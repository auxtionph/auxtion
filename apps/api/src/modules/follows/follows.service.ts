import { Injectable } from '@nestjs/common';
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
  async getSellerPaymentInfo(sellerId: string) {
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
}
