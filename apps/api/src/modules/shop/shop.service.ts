/* eslint-disable */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStorefrontItemDto } from './dto/create-storefront-item.dto';
import { UpdateStorefrontItemDto } from './dto/update-storefront-item.dto';
import { ShopItemStatus, ShopItemCategory, Prisma, OrderStatus } from '@prisma/client';
import axios from 'axios';

const COMMISSION_RATE  = 0.05;
const PROCESSING_RATE  = 0.025;
const PAYMONGO_SECRET  = process.env.PAYMONGO_SECRET_KEY ?? '';
const PAYMONGO_BASE    = 'https://api.paymongo.com/v1';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertOwnership(itemId: string, sellerId: string) {
    const item = await this.prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');
    if (item.sellerId !== sellerId) throw new ForbiddenException('Not your item');
    return item;
  }

  private authHeader() {
    return `Basic ${Buffer.from(PAYMONGO_SECRET + ':').toString('base64')}`;
  }

  // ─── Public storefront ────────────────────────────────────────────────────

  async getSellerStorefront(
    sellerId: string,
    opts: { category?: string; page: number; limit: number },
  ) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        totalSales: true,
        sellerTier: true,
        followers: { select: { id: true } },
        auctions: {
          where: { status: 'LIVE' },
          select: { id: true, title: true, hmsRoomId: true },
          take: 1,
        },
      },
    });
    if (!seller) throw new NotFoundException('Seller not found');

    const items = await this.getSellerItems(sellerId, opts);

    return {
      seller: {
        ...seller,
        followerCount: seller.followers.length,
        liveAuction: seller.auctions[0] ?? null,
      },
      ...items,
    };
  }

  async getSellerItems(
    sellerId: string,
    opts: { category?: string; page: number; limit: number },
  ) {
    const where: Prisma.ShopItemWhereInput = {
      sellerId,
      status: ShopItemStatus.STOREFRONT,
      ...(opts.category ? { category: opts.category as ShopItemCategory } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.shopItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          originalPrice: true,
          photos: true,
          category: true,
          viewCount: true,
          createdAt: true,
          seller: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.prisma.shopItem.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page: opts.page,
        limit: opts.limit,
        pages: Math.ceil(total / opts.limit),
      },
    };
  }

  async getItemDetail(itemId: string, viewerId: string) {
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

    // Increment view count async — don't block response
    if (item.sellerId !== viewerId) {
      void this.prisma.shopItem
        .update({ where: { id: itemId }, data: { viewCount: { increment: 1 } } })
        .catch(() => undefined);
    }

    return item;
  }

  async buyItem(itemId: string, buyerId: string, addressId?: string) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
      include: { seller: true },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item.status !== ShopItemStatus.STOREFRONT) {
      throw new ConflictException('Item is no longer available');
    }
    if (item.sellerId === buyerId) {
      throw new BadRequestException('Cannot buy your own item');
    }

    // Address gate — use the explicitly chosen address if provided, else the buyer's default
    const address = addressId
      ? await this.prisma.userAddress.findFirst({
          where: { id: addressId, userId: buyerId },
        })
      : await this.prisma.userAddress.findFirst({
          where: { userId: buyerId, isDefault: true },
        });
    if (!address) {
      throw new BadRequestException('Please add a shipping address before purchasing');
    }

    // Fees
    const commission    = Math.round(item.price * COMMISSION_RATE);
    const processingFee = Math.round(item.price * PROCESSING_RATE);
    const sellerPayout  = item.price - commission - processingFee;

    // Atomic: lock item + create order
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.shopItem.updateMany({
        where: { id: itemId, status: ShopItemStatus.STOREFRONT },
        data:  { status: ShopItemStatus.SOLD },
      });
      if (locked.count === 0) {
        throw new ConflictException('Item was just purchased by someone else');
      }

      return tx.order.create({
        data: {
          buyerId,
          sellerId:           item.sellerId,
          itemId,
          amount:             item.price,
          status:             OrderStatus.PENDING_PAYMENT,
          mode:               'storefront',
          commissionAmount:   commission,
          processingFee,
          sellerPayout,
          shippingName:       address.name,
          shippingPhone:      address.phone,
          shippingLine1:      address.line1,
          shippingCity:       address.city,
          shippingProvince:   address.province,
          shippingPostalCode: address.postalCode,
          paymentDeadline:    new Date(Date.now() + 10 * 60 * 1000),
        },
      });
    });

    // PayMongo Payment Link
    const pmRes = await axios.post<{
      data: { id: string; attributes: { checkout_url: string } };
    }>(
      `${PAYMONGO_BASE}/links`,
      {
        data: {
          attributes: {
            amount:      item.price, // already centavos
            description: item.title,
            remarks:     `auxtion-order-${order.id}`,
          },
        },
      },
      { headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' } },
    );

    const link        = pmRes.data.data;
    const checkoutUrl = link.attributes.checkout_url;

    await this.prisma.payment.create({
      data: {
        orderId:     order.id,
        userId:      buyerId,
        amount:      item.price,
        status:      'PENDING',
        checkoutUrl,
        paymongoRef: link.id,
        expiresAt:   new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return { orderId: order.id, checkoutUrl };
  }

  async search(
    q: string,
    opts: { type: string; category?: string; page: number; limit: number },
  ) {
    if (!q?.trim()) {
      return { items: [], sellers: [], meta: { total: 0, page: 1, limit: opts.limit, pages: 0 } };
    }

    const skip = (opts.page - 1) * opts.limit;
    const results: { items?: unknown[]; sellers?: unknown[]; meta: unknown } = { meta: {} };

    if (opts.type === 'item' || opts.type === 'all') {
      const where: Prisma.ShopItemWhereInput = {
        status: { in: [ShopItemStatus.STOREFRONT, ShopItemStatus.LIVE, ShopItemStatus.LIVE_BUYNOW] },
        OR: [
          { title:       { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
        ...(opts.category ? { category: opts.category as ShopItemCategory } : {}),
      };

      const [items, total] = await Promise.all([
        this.prisma.shopItem.findMany({
          where,
          orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: opts.limit,
          select: {
            id: true, title: true, price: true, photos: true,
            status: true, category: true, viewCount: true,
            seller: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        }),
        this.prisma.shopItem.count({ where }),
      ]);

      results.items = items;
      results.meta  = {
        total, page: opts.page, limit: opts.limit, pages: Math.ceil(total / opts.limit),
      };
    }

    if (opts.type === 'seller' || opts.type === 'all') {
      results.sellers = await this.prisma.user.findMany({
        where: {
          role: 'SELLER',
          displayName: { contains: q, mode: 'insensitive' },
        },
        select: {
          id: true, displayName: true, avatarUrl: true,
          sellerTier: true, totalSales: true,
          _count: {
            select: { shopItems: { where: { status: ShopItemStatus.STOREFRONT } } },
          },
        },
        skip,
        take: opts.limit,
      });
    }

    return results;
  }

  // ─── Seller management ────────────────────────────────────────────────────

  async createStorefrontItem(sellerId: string, dto: CreateStorefrontItemDto) {
    const priceCentavos = dto.price * 100; // mobile sends pesos; app stores centavos everywhere
    return this.prisma.shopItem.create({
      data: {
        sellerId,
        title:         dto.title,
        description:   dto.description,
        price:         priceCentavos,
        minimumOffer:  priceCentavos,
        originalPrice: priceCentavos,
        category:      dto.category as ShopItemCategory,
        photos:        dto.photos   as Prisma.InputJsonValue,
        status:        ShopItemStatus.STOREFRONT,
        type:          'BUY_NOW',
        mode:          'storefront',
      },
    });
  }

  async getMyItems(
    sellerId: string,
    opts: { status?: string; page: number; limit: number },
  ) {
    const statusFilter: ShopItemStatus[] = opts.status
      ? [opts.status as ShopItemStatus]
      : [ShopItemStatus.STOREFRONT, ShopItemStatus.SOLD];

    const where: Prisma.ShopItemWhereInput = {
      sellerId,
      status: { in: statusFilter },
      mode:   'storefront',
    };

    const [items, total] = await Promise.all([
      this.prisma.shopItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      this.prisma.shopItem.count({ where }),
    ]);


    // Attach buyer + shipping info for sold items so sellers can see who bought what
    const soldItemIds = items.filter(i => i.status === ShopItemStatus.SOLD).map(i => i.id);
    const ordersByItemId = new Map<string, unknown>();
    if (soldItemIds.length > 0) {
      const orders = await this.prisma.order.findMany({
        where: { itemId: { in: soldItemIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          itemId: true,
          status: true,
          shippingName: true,
          shippingPhone: true,
          shippingLine1: true,
          shippingCity: true,
          shippingProvince: true,
          shippingPostalCode: true,
          buyer: { select: { displayName: true } },
        },
      });
      for (const order of orders) {
        if (!ordersByItemId.has(order.itemId)) {
          ordersByItemId.set(order.itemId, order);
        }
      }
    }

    const itemsWithOrder = items.map(item => ({
      ...item,
      order: ordersByItemId.get(item.id) ?? null,
    }));

    return {
      items: itemsWithOrder,
      meta: { total, page: opts.page, limit: opts.limit, pages: Math.ceil(total / opts.limit) },
    };
  }

  async getSellerStats(sellerId: string) {
    const [listed, sold, views] = await Promise.all([
      this.prisma.shopItem.count({
        where: { sellerId, status: ShopItemStatus.STOREFRONT, mode: 'storefront' },
      }),
      this.prisma.shopItem.count({
        where: { sellerId, status: ShopItemStatus.SOLD, mode: 'storefront' },
      }),
      this.prisma.shopItem.aggregate({
        where: { sellerId, mode: 'storefront' },
        _sum: { viewCount: true },
      }),
    ]);

    return { listed, sold, totalViews: views._sum.viewCount ?? 0 };
  }

  async updateStorefrontItem(
    itemId: string,
    sellerId: string,
    dto: UpdateStorefrontItemDto,
  ) {
    const item = await this.assertOwnership(itemId, sellerId);
    if (item.status !== ShopItemStatus.STOREFRONT) {
      throw new BadRequestException('Can only edit items currently listed on your storefront');
    }

    return this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        ...(dto.title       !== undefined ? { title: dto.title }                                     : {}),
        ...(dto.description !== undefined ? { description: dto.description }                         : {}),
        ...(dto.price       !== undefined ? { price: dto.price * 100, minimumOffer: dto.price * 100, originalPrice: dto.price * 100 } : {}),
        ...(dto.category    !== undefined ? { category: dto.category as ShopItemCategory }           : {}),
        ...(dto.photos      !== undefined ? { photos: dto.photos as Prisma.InputJsonValue }          : {}),
      },
    });
  }

  async pullToLive(itemId: string, sellerId: string) {
    const item = await this.assertOwnership(itemId, sellerId);
    if (item.status !== ShopItemStatus.STOREFRONT) {
      throw new BadRequestException('Item must be on storefront to pull to live');
    }
    return this.prisma.shopItem.update({
      where: { id: itemId },
      data:  { status: ShopItemStatus.QUEUED, mode: 'auction' },
    });
  }

  async deleteStorefrontItem(itemId: string, sellerId: string) {
    const item = await this.assertOwnership(itemId, sellerId);
    if (item.status !== ShopItemStatus.STOREFRONT) {
      throw new BadRequestException('Can only remove items currently listed on your storefront');
    }

    const pendingOrder = await this.prisma.order.findFirst({
      where: {
        itemId,
        status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.SHIPPED] },
      },
    });
    if (pendingOrder) throw new ConflictException('Cannot remove item with an active order');

    return this.prisma.shopItem.update({
      where: { id: itemId },
      data:  { status: ShopItemStatus.CANCELLED },
    });
  }
}
