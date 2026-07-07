import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SellerApplicationStatus,
  DisputeStatus,
  AuctionStatus,
  OrderStatus,
  UserRole,
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
}
