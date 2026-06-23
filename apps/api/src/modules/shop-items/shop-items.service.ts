import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShopItemDto } from './dto/create-shop-item.dto';
import { UpdateShopItemDto } from './dto/update-shop-item.dto';
import { ReorderQueueDto } from './dto/reorder-queue.dto';
import { ShopItemStatus, ShopItemType, Prisma } from '@prisma/client';
import { UploadsService } from '../uploads/uploads.service';
import { UploadPurpose } from '../uploads/uploads.service';

@Injectable()
export class ShopItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ── Cloudinary Upload Signature ────────────────────────────────────────────

  getUploadSignature(userId: string) {
    return this.uploadsService.getSignature(userId, UploadPurpose.SHOP_ITEMS);
  }

  // ── Cloudinary Delete (fire-and-forget) ───────────────────────────────────

  async deletePhotoFromCloudinary(publicId: string): Promise<void> {
    return this.uploadsService.deletePhoto(publicId);
  }

  // ── Create Item ────────────────────────────────────────────────────────────

  async createItem(sellerId: string, dto: CreateShopItemDto) {
    const minimumOffer = Math.round(dto.price * 0.7);

    return this.prisma.shopItem.create({
      data: {
        sellerId,
        title: dto.title,
        description: dto.description,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        photos: (dto.photos ?? []) as unknown as Prisma.InputJsonValue,
        price: dto.price,
        minimumOffer,
        type: dto.type,
        queueOrder: dto.queueOrder ?? null,
        originalPrice: dto.price,
      },
    });
  }

  // ── Get Seller Shop ────────────────────────────────────────────────────────

  async getSellerShop(sellerId: string, type?: ShopItemType) {
    return this.prisma.shopItem.findMany({
      where: {
        sellerId,
        ...(type ? { type } : {}),
        status: {
          notIn: [ShopItemStatus.CANCELLED],
        },
      },
      orderBy: [{ queueOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // ── Get Single Item ────────────────────────────────────────────────────────

  async getItemById(itemId: string) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            sellerTier: true,
            totalSales: true,
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Item not found');

    return item;
  }

  // ── Update Item ────────────────────────────────────────────────────────────

  async updateItem(sellerId: string, itemId: string, dto: UpdateShopItemDto) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this item');
    }

    // Drop removed photos from Cloudinary before updating
    if (dto.photos !== undefined) {
      const oldPhotos = (item.photos as any[]) ?? [];
      const newPublicIds = new Set(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        (dto.photos as any[]).map((p: any) => p.publicId),
      );
      const dropped = oldPhotos.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (p: any) => !newPublicIds.has(p.publicId),
      );
      // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      dropped.forEach((p: any) => this.deletePhotoFromCloudinary(p.publicId));
    }

    const minimumOffer = dto.price ? Math.round(dto.price * 0.7) : undefined;

    return this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        ...(dto.photos !== undefined && {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          photos: dto.photos as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.price && { price: dto.price, minimumOffer }),
        ...(dto.type && { type: dto.type }),
        ...(dto.queueOrder !== undefined && { queueOrder: dto.queueOrder }),
      },
    });
  }

  // ── Delete Item ────────────────────────────────────────────────────────────

  async deleteItem(sellerId: string, itemId: string) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this item');
    }

    // Clean up Cloudinary photos before cancelling
    const photos = (item.photos as any[]) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    photos.forEach((p: any) => this.deletePhotoFromCloudinary(p.publicId));

    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: ShopItemStatus.CANCELLED },
    });

    return { message: 'Item removed successfully' };
  }

  // ── Reset Live Item (seller reconnect — no transaction) ────────────────────
  async resetItem(
    sellerId: string,
    itemId: string,
  ): Promise<{ success: boolean; message: string }> {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this item');
    }
    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        status: ShopItemStatus.QUEUED, // ← was AVAILABLE
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        price: item.originalPrice > 0 ? item.originalPrice : item.price, // ← reset price too
      },
    });
    return { success: true, message: 'Item reset to queue' };
  }

  // ── Reorder Queue ──────────────────────────────────────────────────────────

  async reorderQueue(sellerId: string, dto: ReorderQueueDto) {
    const updates = dto.itemIds.map((id, index) =>
      this.prisma.shopItem.updateMany({
        where: { id, sellerId },
        data: { queueOrder: index + 1 },
      }),
    );

    await this.prisma.$transaction(updates);

    return { message: 'Queue reordered successfully' };
  }

  // ── Toggle Bell Notification ───────────────────────────────────────────────

  async toggleNotification(userId: string, itemId: string) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Item not found');

    const existing = await this.prisma.itemNotification.findUnique({
      where: { itemId_userId: { itemId, userId } },
    });

    if (existing) {
      await this.prisma.itemNotification.delete({
        where: { itemId_userId: { itemId, userId } },
      });
      return { subscribed: false };
    }

    await this.prisma.itemNotification.create({
      data: { itemId, userId },
    });

    return { subscribed: true };
  }

  // ── Convert Buy Now to Auction (run from offer) ────────────────────────────
  async convertToAuction(
    sellerId: string,
    itemId: string,
    startingPrice: number,
  ) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this item');
    }

    return this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        type: ShopItemType.AUCTION,
        status: ShopItemStatus.QUEUED,
        price: startingPrice,
        originalPrice: startingPrice,
        minimumOffer: Math.round(startingPrice * 0.7),
        mode: 'auction',
      },
    });
  }
}
