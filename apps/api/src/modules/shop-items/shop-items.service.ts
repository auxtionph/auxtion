import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShopItemDto } from './dto/create-shop-item.dto';
import { UpdateShopItemDto } from './dto/update-shop-item.dto';
import { ReorderQueueDto } from './dto/reorder-queue.dto';
import { ShopItemStatus, ShopItemType } from '@prisma/client';

@Injectable()
export class ShopItemsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Create Item ────────────────────────────────────────────────────────────

  async createItem(sellerId: string, dto: CreateShopItemDto) {
    const minimumOffer = Math.round(dto.price * 0.7);

    return this.prisma.shopItem.create({
      data: {
        sellerId,
        title: dto.title,
        description: dto.description,
        photos: dto.photos,
        price: dto.price,
        minimumOffer,
        type: dto.type,
        queueOrder: dto.queueOrder ?? null,
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

    const minimumOffer = dto.price ? Math.round(dto.price * 0.7) : undefined;

    return this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.photos && { photos: dto.photos }),
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

    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: ShopItemStatus.CANCELLED },
    });

    return { message: 'Item removed successfully' };
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
}
