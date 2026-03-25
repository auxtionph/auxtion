import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShipOrderDto } from './dto/ship-order.dto';
import { OrderStatus, PayoutStatus, SellerTier } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Get Buyer Orders ───────────────────────────────────────────────────────

  async getBuyerOrders(buyerId: string) {
    return this.prisma.order.findMany({
      where: { buyerId },
      include: {
        item: {
          select: { id: true, title: true, photos: true },
        },
        seller: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        payment: {
          select: { status: true, paymongoRef: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get Seller Orders ──────────────────────────────────────────────────────

  async getSellerOrders(sellerId: string) {
    return this.prisma.order.findMany({
      where: { sellerId },
      include: {
        item: {
          select: { id: true, title: true, photos: true },
        },
        buyer: {
          select: { id: true, displayName: true },
        },
        payment: {
          select: { status: true, paymongoRef: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get Single Order ───────────────────────────────────────────────────────

  async getOrderById(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        item: true,
        payment: true,
        dispute: true,
        buyer: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        seller: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Only buyer or seller can view the order
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  // ── Mark as Shipped ────────────────────────────────────────────────────────

  async markAsShipped(sellerId: string, orderId: string, dto: ShipOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this order');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Order must be paid before shipping');
    }

    const shippedAt = new Date();
    const autoConfirmAt = new Date(shippedAt);
    autoConfirmAt.setDate(autoConfirmAt.getDate() + 5); // 5 days

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SHIPPED,
        courier: dto.courier,
        trackingNumber: dto.trackingNumber,
        shippedAt,
        autoConfirmAt,
      },
    });
  }

  // ── Confirm Receipt (Buyer) ────────────────────────────────────────────────

  async confirmReceipt(buyerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        seller: {
          select: { id: true, sellerTier: true, totalSales: true },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('You are not the buyer of this order');
    }
    if (order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException('Order has not been shipped yet');
    }

    const payoutReleaseAt = this.calculatePayoutReleaseDate(
      order.seller.sellerTier,
    );

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
        payoutReleaseAt,
      },
    });
  }

  // ── Cancel Order (Seller) ──────────────────────────────────────────────────

  async cancelOrder(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this order');
    }
    if (
      order.status !== OrderStatus.PENDING_PAYMENT &&
      order.status !== OrderStatus.PAID
    ) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelReason: 'SELLER_MANUAL',
      },
    });
  }

  // ── Payout Release Date by Tier ────────────────────────────────────────────

  private calculatePayoutReleaseDate(tier: SellerTier): Date {
    const date = new Date();
    switch (tier) {
      case SellerTier.ESTABLISHED:
        date.setDate(date.getDate() + 2);
        break;
      case SellerTier.POWER:
        date.setDate(date.getDate() + 1);
        break;
      default: // NEW
        date.setDate(date.getDate() + 7);
        break;
    }
    return date;
  }

  // ── Auto-Confirm Delivery (Background Job) ─────────────────────────────────

  async autoConfirmDeliveries() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SHIPPED,
        autoConfirmAt: { lte: new Date() },
      },
      include: {
        seller: { select: { sellerTier: true } },
      },
    });

    for (const order of orders) {
      const payoutReleaseAt = this.calculatePayoutReleaseDate(
        order.seller.sellerTier,
      );

      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: new Date(),
          payoutReleaseAt,
        },
      });
    }

    return { confirmed: orders.length };
  }

  // ── Auto-Release Payouts (Background Job) ──────────────────────────────────

  async autoReleasePayouts() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        payoutStatus: PayoutStatus.HELD,
        payoutReleaseAt: { lte: new Date() },
      },
    });

    for (const order of orders) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          payoutStatus: PayoutStatus.RELEASED,
          payoutReleasedAt: new Date(),
        },
      });

      // Increment seller total sales
      await this.prisma.user.update({
        where: { id: order.sellerId },
        data: { totalSales: { increment: 1 } },
      });

      // Check and upgrade seller tier
      await this.checkAndUpgradeSellerTier(order.sellerId);
    }

    return { released: orders.length };
  }

  // ── Tier Upgrade ───────────────────────────────────────────────────────────

  private async checkAndUpgradeSellerTier(sellerId: string) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { totalSales: true, sellerTier: true },
    });

    if (!seller) return;

    if (seller.totalSales >= 5000 && seller.sellerTier !== SellerTier.POWER) {
      await this.prisma.user.update({
        where: { id: sellerId },
        data: { sellerTier: SellerTier.POWER },
      });
    } else if (
      seller.totalSales >= 1000 &&
      seller.sellerTier === SellerTier.NEW
    ) {
      await this.prisma.user.update({
        where: { id: sellerId },
        data: { sellerTier: SellerTier.ESTABLISHED },
      });
    }
  }
}
