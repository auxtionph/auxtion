import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SellerApplicationStatus,
  DisputeStatus,
  AuctionStatus,
  OrderStatus,
  UserRole,
  CancelReason,
  ShopItemStatus,
  PayoutStatus,
} from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalUsers,
      totalSellers,
      pendingApplications,
      openDisputes,
      liveAuctions,
      totalOrders,
      completedOrders,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.SELLER } }),
      this.prisma.sellerApplication.count({
        where: { status: SellerApplicationStatus.PENDING },
      }),
      this.prisma.dispute.count({ where: { status: DisputeStatus.OPEN } }),
      this.prisma.auction.count({ where: { status: AuctionStatus.LIVE } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
    ]);

    // GMV = sum of completed order amounts (centavos)
    const gmvAgg = await this.prisma.order.aggregate({
      where: { status: OrderStatus.COMPLETED },
      _sum: { amount: true },
    });

    return {
      totalUsers,
      totalSellers,
      pendingApplications,
      openDisputes,
      liveAuctions,
      totalOrders,
      completedOrders,
      gmv: gmvAgg._sum.amount ?? 0,
    };
  }

  async listUsers(opts: { search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const search = opts.search?.trim();

    const where = search
      ? {
          OR: [
            { displayName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          totalSales: true,
          isEmailVerified: true,
          createdAt: true,
          _count: { select: { sellerOrders: true, buyerOrders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users,
      meta: { page, limit, total, hasMore: page * limit < total },
    };
  }

  async changeUserRole(adminId: string, targetUserId: string, role: UserRole) {
    if (adminId === targetUserId) {
      throw new BadRequestException('You cannot change your own role');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === role) {
      throw new BadRequestException(`User is already ${role}`);
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, email: true, displayName: true, role: true },
    });
  }

  async getAllOrders(opts: {
    status?: OrderStatus;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const where: {
      status?: OrderStatus;
      OR?: { buyerId?: string; sellerId?: string }[];
    } = {};
    if (opts.status) where.status = opts.status;
    if (opts.userId) {
      where.OR = [{ buyerId: opts.userId }, { sellerId: opts.userId }];
    }

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          amount: true,
          status: true,
          payoutStatus: true,
          createdAt: true,
          paymentDeadline: true,
          buyer: { select: { id: true, displayName: true, email: true } },
          seller: { select: { id: true, displayName: true, email: true } },
          item: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: orders,
      meta: { page, limit, total, hasMore: page * limit < total },
    };
  }

  async forceCancelOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, itemId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot force-cancel an order that is already ${order.status}`,
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: CancelReason.SELLER_MANUAL,
        },
      }),
      this.prisma.shopItem.update({
        where: { id: order.itemId },
        data: { status: ShopItemStatus.AVAILABLE },
      }),
    ]);

    return updated;
  }

  async getDisputes(opts: { status?: DisputeStatus; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const where = opts.status ? { status: opts.status } : {};

    const [disputes, total] = await this.prisma.$transaction([
      this.prisma.dispute.findMany({
        where,
        select: {
          id: true,
          reason: true,
          status: true,
          raisedBy: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              amount: true,
              status: true,
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              item: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return {
      items: disputes,
      meta: { page, limit, total, hasMore: page * limit < total },
    };
  }

  async resolveDispute(
    adminId: string,
    disputeId: string,
    inFavorOf: 'BUYER' | 'SELLER',
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, orderId: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== DisputeStatus.OPEN) {
      throw new BadRequestException('This dispute has already been resolved');
    }

    if (inFavorOf === 'SELLER') {
      // Seller wins: complete the order, release payout.
      const [resolved] = await this.prisma.$transaction([
        this.prisma.dispute.update({
          where: { id: disputeId },
          data: { status: DisputeStatus.RESOLVED_SELLER, resolvedBy: adminId },
        }),
        this.prisma.order.update({
          where: { id: dispute.orderId },
          data: {
            status: OrderStatus.COMPLETED,
            payoutStatus: PayoutStatus.RELEASED,
          },
        }),
      ]);
      return resolved;
    }

    // Buyer wins: cancel order, freeze payout for manual refund review.
    const [resolved] = await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id: disputeId },
        data: { status: DisputeStatus.RESOLVED_BUYER, resolvedBy: adminId },
      }),
      this.prisma.order.update({
        where: { id: dispute.orderId },
        data: {
          status: OrderStatus.CANCELLED,
          payoutStatus: PayoutStatus.FROZEN,
          cancelReason: CancelReason.SELLER_MANUAL,
        },
      }),
    ]);
    return resolved;
  }
}
