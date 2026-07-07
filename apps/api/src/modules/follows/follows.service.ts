import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Follow / Unfollow Seller ───────────────────────────────────────────────
  async toggleSellerFollow(userId: string, sellerId: string) {
    if (userId === sellerId) return { following: false };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const existing = await this.prisma.sellerFollower.findUnique({
      where: { userId_sellerId: { userId, sellerId } },
    });

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await this.prisma.sellerFollower.delete({
        where: { userId_sellerId: { userId, sellerId } },
      });
      return { following: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await this.prisma.sellerFollower.create({
      data: { userId, sellerId },
    });
    return { following: true };
  }

  async getSellerFollowStatus(userId: string, sellerId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const existing = await this.prisma.sellerFollower.findUnique({
      where: { userId_sellerId: { userId, sellerId } },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const count = await this.prisma.sellerFollower.count({
      where: { sellerId },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return { following: !!existing, followerCount: count };
  }

  // ── Follow / Unfollow Auction ──────────────────────────────────────────────
  async toggleAuctionFollow(userId: string, auctionId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const existing = await this.prisma.auctionFollower.findUnique({
      where: { userId_auctionId: { userId, auctionId } },
    });

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await this.prisma.auctionFollower.delete({
        where: { userId_auctionId: { userId, auctionId } },
      });
      return { following: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await this.prisma.auctionFollower.create({
      data: { userId, auctionId },
    });
    return { following: true };
  }

  async getAuctionFollowStatus(userId: string, auctionId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const existing = await this.prisma.auctionFollower.findUnique({
      where: { userId_auctionId: { userId, auctionId } },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const count = await this.prisma.auctionFollower.count({
      where: { auctionId },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return { following: !!existing, followerCount: count };
  }

  // ── Get Seller Payment Info (for chat bid buyers) ──────────────────────────
  // Full GCash/bank details, so this is gated: the caller must actually have an
  // order with this seller (i.e. they won/bought something and need to pay).
  // Without the gate, any account could enumerate sellerIds and harvest every
  // seller's bank account number.
  async getSellerPaymentInfo(requesterId: string, sellerId: string) {
    if (requesterId !== sellerId) {
      const order = await this.prisma.order.findFirst({
        where: { sellerId, buyerId: requesterId },
        select: { id: true },
      });
      if (!order) {
        throw new ForbiddenException(
          'You can only view payment details for a seller you have an order with',
        );
      }
    }

    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        displayName: true,
        gcashNumber: true,
        gcashName: true,
        bankName: true,
        bankAccountNumber: true,
        bankAccountName: true,
      },
    });
    if (!seller) return null;
    return {
      displayName: seller.displayName,
      gcash:
        seller.gcashNumber && seller.gcashName
          ? { number: seller.gcashNumber, name: seller.gcashName }
          : null,
      bank:
        seller.bankName && seller.bankAccountNumber && seller.bankAccountName
          ? {
              name: seller.bankName,
              accountNumber: seller.bankAccountNumber,
              accountName: seller.bankAccountName,
            }
          : null,
    };
  }

  // ── List Followers / Following ─────────────────────────────────────────────
  async listFollowers(userId: string, page = 1, limit = 50) {
    const [rows, total] = await Promise.all([
      this.prisma.sellerFollower.findMany({
        where: { sellerId: userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              role: true,
              sellerTier: true,
            },
          },
        },
      }),
      this.prisma.sellerFollower.count({ where: { sellerId: userId } }),
    ]);
    return {
      items: rows.map((r) => r.user),
      meta: { total, page, limit, hasMore: page * limit < total },
    };
  }

  async listFollowing(userId: string, page = 1, limit = 50) {
    const [rows, total] = await Promise.all([
      this.prisma.sellerFollower.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          seller: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              role: true,
              sellerTier: true,
            },
          },
        },
      }),
      this.prisma.sellerFollower.count({ where: { userId } }),
    ]);
    return {
      items: rows.map((r) => r.seller),
      meta: { total, page, limit, hasMore: page * limit < total },
    };
  }
}
