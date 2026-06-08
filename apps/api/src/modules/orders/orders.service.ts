import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ShipOrderDto } from './dto/ship-order.dto';
import {
  OrderStatus,
  PayoutStatus,
  SellerTier,
  PaymentMethod,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

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
        auction: {
          select: {
            id: true,
            title: true,
            actualStartTime: true,
            startTime: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get Unpaid Orders for an Auction (End Live preview) ────────────────────

  async getUnpaidSummary(sellerId: string, auctionId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        sellerId,
        auctionId,
        status: {
          in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_MANUAL_PAYMENT],
        },
      },
      include: {
        item: { select: { title: true } },
        buyer: { select: { id: true, displayName: true } },
      },
      orderBy: { paymentDeadline: 'asc' },
    });

    return {
      totalUnpaid: orders.length,
      totalAmount: orders.reduce((sum, o) => sum + o.amount, 0),
      orders: orders.map((o) => ({
        id: o.id,
        amount: o.amount,
        status: o.status,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        paymentDeadline: o.paymentDeadline,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        itemTitle: o.item.title,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        buyerName: o.buyer.displayName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        buyerId: o.buyer.id,
      })),
    };
  }

  // ── Bulk Cancel Unpaid Orders for an Auction (End Live action) ────────────

  async bulkCancelAuctionOrders(sellerId: string, auctionId: string) {
    const unpaid = await this.prisma.order.findMany({
      where: {
        sellerId,
        auctionId,
        status: {
          in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_MANUAL_PAYMENT],
        },
      },
      include: {
        item: { select: { id: true, title: true } },
        buyer: { select: { id: true, displayName: true } },
      },
    });

    if (unpaid.length === 0) {
      return { cancelled: 0 };
    }

    // Cancel all + return items to AVAILABLE in one transaction
    await this.prisma.$transaction([
      this.prisma.order.updateMany({
        where: { id: { in: unpaid.map((o) => o.id) } },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: 'STREAM_ENDED',
        },
      }),
      this.prisma.shopItem.updateMany({
        where: { id: { in: unpaid.map((o) => o.itemId) } },
        data: { status: 'AVAILABLE' },
      }),
    ]);

    // Batch notifications by buyer (1 notification per buyer, not per order)
    const byBuyer = new Map<string, typeof unpaid>();
    for (const o of unpaid) {
      const list = byBuyer.get(o.buyerId) ?? [];
      list.push(o);
      byBuyer.set(o.buyerId, list);
    }

    for (const [buyerId, orders] of byBuyer.entries()) {
      const first = orders[0];
      const count = orders.length;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const body =
        count === 1
          ? `Live ended before you paid for ${first.item.title}. Order cancelled.`
          : `Live ended before you paid for ${count} items. Orders cancelled.`;

      void this.notifications.sendToUser(buyerId, {
        title: '⏱ Live ended',
        body,
        data: { auctionId, screen: 'activity' },
      });
    }

    this.logger.log(
      `Bulk cancelled ${unpaid.length} unpaid orders for auction ${auctionId}`,
    );

    return { cancelled: unpaid.length };
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
      include: { item: { select: { title: true } } },
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
    autoConfirmAt.setDate(autoConfirmAt.getDate() + 5);

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SHIPPED,
        courier: dto.courier,
        trackingNumber: dto.trackingNumber,
        shippedAt,
        autoConfirmAt,
      },
    });

    // ── Notify buyer ─────────────────────────────────────────────────
    void this.notifications.sendToUser(order.buyerId, {
      title: '📦 Your order has been shipped!',
      body: `${order.item.title} is on its way via ${dto.courier.replace(/_/g, ' ')}`,
      data: { orderId, screen: 'order' },
    });

    // ── Create AfterShip tracking (non-fatal if fails) ──────────────
    void this.createAfterShipTracking(
      dto.trackingNumber,
      dto.courier,
      orderId,
      order.item.title,
    );

    return { success: true, orderId };
  }

  // ── AfterShip: Create Tracking Entry ──────────────────────────────────────

  private async createAfterShipTracking(
    trackingNumber: string,
    courier: string,
    orderId: string,
    itemTitle: string,
  ) {
    const apiKey = this.configService.get<string>('AFTERSHIP_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'AFTERSHIP_API_KEY not set — skipping tracking creation',
      );
      return;
    }

    const courierSlugMap: Record<string, string> = {
      JT_EXPRESS: 'jtexpress-ph',
      LBC: 'lbc',
      NINJA_VAN: 'ninjavan-philippines',
      FLASH_EXPRESS: 'flash-express',
      GRAB_EXPRESS: 'grab-express',
      OTHER: '',
    };

    const slug = courierSlugMap[courier];
    if (!slug) {
      this.logger.warn(`No AfterShip slug for courier ${courier} — skipping`);
      return;
    }

    try {
      const res = await fetch('https://api.aftership.com/v4/trackings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'as-api-key': apiKey,
        },
        body: JSON.stringify({
          tracking: {
            tracking_number: trackingNumber,
            slug,
            title: itemTitle,
            custom_fields: { orderId },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`AfterShip tracking creation failed: ${err}`);
      } else {
        this.logger.log(`AfterShip tracking created for order ${orderId}`);
      }
    } catch (err) {
      this.logger.error(`AfterShip fetch error: ${String(err)}`);
    }
  }

  // ── Mark as Delivered (called by AfterShip webhook or auto-confirm) ────────

  async markAsDelivered(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { seller: { select: { sellerTier: true } } },
    });
    if (!order) return;
    if (order.status !== OrderStatus.SHIPPED) return;

    const payoutReleaseAt = this.calculatePayoutReleaseDate(
      order.seller.sellerTier,
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
        payoutReleaseAt,
        autoConfirmAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });

    this.logger.log(`Order ${orderId} marked DELIVERED`);
  }

  // ── Confirm Receipt (Buyer) ────────────────────────────────────────────────

  async confirmReceipt(buyerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        seller: {
          select: { id: true, sellerTier: true, totalSales: true },
        },
        item: { select: { title: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('You are not the buyer of this order');
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order has not been delivered yet');
    }

    const payoutReleaseAt = this.calculatePayoutReleaseDate(
      order.seller.sellerTier,
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED,
        deliveredAt: new Date(),
        payoutReleaseAt,
      },
    });

    // ── Notify seller ─────────────────────────────────────────────────
    void this.notifications.sendToUser(order.sellerId, {
      title: '✅ Buyer confirmed receipt!',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      body: `Payment for ${order.item.title ?? 'your item'} will be released soon.`,
      data: { screen: 'seller-orders' },
    });

    return { success: true };
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
        status: OrderStatus.DELIVERED,
        autoConfirmAt: { lte: new Date() },
      },
      include: {
        seller: { select: { sellerTier: true } },
        item: { select: { title: true } },
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

      await this.prisma.user.update({
        where: { id: order.sellerId },
        data: { totalSales: { increment: 1 } },
      });

      await this.checkAndUpgradeSellerTier(order.sellerId);

      this.logger.log(
        `Order ${order.id} auto-completed after delivery timeout`,
      );
    }

    return { confirmed: orders.length };
  }

  // ── Expire Pending Payments (Background Job) ───────────────────────────────

  async expirePendingPayments() {
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_MANUAL_PAYMENT],
        },
        paymentDeadline: { lte: new Date() },
      },
      include: {
        item: { select: { id: true, title: true } },
        buyer: { select: { id: true, displayName: true } },
        auction: { select: { status: true } },
      },
    });

    for (const order of expiredOrders) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const auctionEnded = order.auction?.status === 'ENDED';

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelReason: 'PAYMENT_TIMEOUT',
          },
        }),
        this.prisma.shopItem.update({
          where: { id: order.itemId },
          data: { status: 'AVAILABLE' },
        }),
      ]);

      // Notify buyer — different copy based on whether live is still going
      const item = order.item as { id: string; title: string };
      const buyer = order.buyer as { id: string; displayName: string };

      const buyerBody = auctionEnded
        ? `Payment window for ${item.title} closed. Order cancelled.`
        : `Payment timeout for ${item.title}. The item has been relisted.`;

      const sellerBody = auctionEnded
        ? `${buyer.displayName} didn't pay for ${item.title}.`
        : `${buyer.displayName} didn't pay for ${item.title}. Item relisted.`;

      void this.notifications.sendToUser(order.buyerId, {
        title: '⏱ Order cancelled',
        body: buyerBody,
        data: { orderId: order.id, screen: 'activity' },
      });

      void this.notifications.sendToUser(order.sellerId, {
        title: "⏱ Buyer didn't pay",
        body: sellerBody,
        data: { itemId: order.itemId, screen: 'seller-orders' },
      });

      this.logger.log(
        `Order ${order.id} expired (auction ${auctionEnded ? 'ENDED' : 'LIVE'})`,
      );
    }

    return { expired: expiredOrders.length };
  }

  // ── Send Payment Reminder (Background Job) ─────────────────────────────────

  async sendPaymentReminders() {
    const now = new Date();
    const twoMin = new Date(now.getTime() + 2 * 60 * 1000);

    // 2-minute warning (window: 1:30 to 2:30 remaining)
    const twoWarn = await this.prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_MANUAL_PAYMENT],
        },
        paymentDeadline: {
          gte: new Date(twoMin.getTime() - 30 * 1000),
          lte: new Date(twoMin.getTime() + 30 * 1000),
        },
      },
      include: { item: { select: { title: true } } },
    });

    for (const order of twoWarn) {
      void this.notifications.sendToUser(order.buyerId, {
        title: '⚠️ 2 minutes to pay',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        body: `Pay now for ${order.item.title} or order auto-cancels.`,
        data: { orderId: order.id, screen: 'order' },
      });
    }

    return { twoMin: twoWarn.length };
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

  // ── Create Manual Order (Chat Bid / Mode 2) ────────────────────────────────

  async createManual(params: {
    itemId: string;
    auctionId: string;
    sellerId: string;
    buyerId: string;
    amount: number;
    mode: string;
  }) {
    const COMMISSION_RATE = 0.05;
    const commission = Math.round(params.amount * COMMISSION_RATE);
    const payout = params.amount - commission;

    return this.prisma.order.create({
      data: {
        itemId: params.itemId,
        auctionId: params.auctionId,
        sellerId: params.sellerId,
        buyerId: params.buyerId,
        amount: params.amount,
        commissionAmount: commission,
        processingFee: 0,
        sellerPayout: payout,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        paymentMethod: PaymentMethod.MANUAL,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        status: OrderStatus.PENDING_MANUAL_PAYMENT,
        paymentDeadline: new Date(Date.now() + 10 * 60 * 1000),
        mode: params.mode,
      },
      include: {
        item: { select: { id: true, title: true, photos: true } },
        buyer: { select: { id: true, displayName: true } },
        seller: { select: { id: true, displayName: true } },
      },
    });
  }

  // ── Mark Manual Payment Paid (Seller confirms GCash received) ──────────────

  async markPaid(sellerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId)
      throw new ForbiddenException('You do not own this order');
    if (order.status !== OrderStatus.PENDING_MANUAL_PAYMENT)
      throw new BadRequestException('Order is not awaiting manual payment');

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, paidAt: new Date() },
    });
  }

  // ── Update Shipping Address (Buyer) ────────────────────────────────────────

  async updateShippingAddress(
    buyerId: string,
    orderId: string,
    address: {
      name: string;
      phone: string;
      line1: string;
      city: string;
      province: string;
      postalCode: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId)
      throw new ForbiddenException('Access denied');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const existing = await this.prisma.userAddress.findFirst({
      where: { userId: buyerId, isDefault: true },
    });
    if (!existing) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await this.prisma.userAddress.create({
        data: { userId: buyerId, ...address, isDefault: true },
      });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingName: address.name,
        shippingPhone: address.phone,
        shippingLine1: address.line1,
        shippingCity: address.city,
        shippingProvince: address.province,
        shippingPostalCode: address.postalCode,
      },
    });
  }

  // ── Get Default Address (Buyer) ────────────────────────────────────────────

  getDefaultAddress(userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return this.prisma.userAddress.findFirst({
      where: { userId, isDefault: true },
    });
  }

  // ── Dispute Order (Buyer) ──────────────────────────────────────────────────

  async disputeOrder(buyerId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId)
      throw new ForbiddenException('Access denied');
    if (order.status !== OrderStatus.SHIPPED)
      throw new BadRequestException('Can only dispute shipped orders');

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DISPUTED },
    });

    return this.prisma.dispute.create({
      data: { orderId, raisedBy: buyerId, reason },
    });
  }
}
