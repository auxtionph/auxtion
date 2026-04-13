import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuctionStatus, ShopItemStatus } from '@prisma/client';

export interface BidResult {
  auctionId: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  totalBids: number;
  timestamp: number;
}

@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Place Bid ──────────────────────────────────────────────────────────────

  async placeBid(
    bidderId: string,
    auctionId: string,
    itemId: string,
    amount: number,
  ): Promise<BidResult> {
    // Validate auction is live
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== AuctionStatus.LIVE) {
      throw new BadRequestException('Auction is not live');
    }

    // Validate item is live in this auction
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.auctionId !== auctionId) {
      throw new BadRequestException('Item does not belong to this auction');
    }
    if (item.status !== ShopItemStatus.LIVE) {
      throw new BadRequestException('Item is not currently being auctioned');
    }

    // Validate bid amount is higher than current price
    const existingBidCount = await this.prisma.bid.count({ where: { itemId } });
    if (existingBidCount === 0) {
      // First bid — must be at least starting price
      if (amount < item.price) {
        throw new BadRequestException(`Bid must be at least ${item.price}`);
      }
    } else {
      // Subsequent bids — must be strictly higher
      if (amount <= item.price) {
        throw new BadRequestException(
          `Bid must be higher than current price of ${item.price}`,
        );
      }
    }

    // Validate bidder is not the seller
    if (auction.sellerId === bidderId) {
      throw new BadRequestException('Sellers cannot bid on their own auctions');
    }

    // Get bidder info
    const bidder = await this.prisma.user.findUnique({
      where: { id: bidderId },
      select: { id: true, displayName: true },
    });

    if (!bidder) throw new NotFoundException('Bidder not found');

    // Create bid and update item price atomically
    await this.prisma.$transaction([
      // Step 1: Mark ALL existing winning bids as not winning
      this.prisma.bid.updateMany({
        where: { itemId, isWinning: true },
        data: { isWinning: false },
      }),
      // Step 2: Create new winning bid
      this.prisma.bid.create({
        data: {
          auctionId,
          itemId,
          bidderId,
          amount,
          isWinning: true,
        },
      }),
      // Step 3: Update item current price
      this.prisma.shopItem.update({
        where: { id: itemId },
        data: { price: amount },
      }),
    ]);

    // Get total bid count
    const totalBids = await this.prisma.bid.count({
      where: { itemId },
    });

    // Cache current bid state in Redis
    const bidState = {
      auctionId,
      itemId,
      currentPrice: amount,
      highestBidderId: bidderId,
      highestBidderName: bidder.displayName,
      totalBids,
      updatedAt: Date.now(),
    };

    await this.redis.set(
      `bid:${itemId}`,
      JSON.stringify(bidState),
      3600, // 1 hour TTL
    );

    return {
      auctionId,
      itemId,
      bidderId,
      bidderName: bidder.displayName,
      amount,
      totalBids,
      timestamp: Date.now(),
    };
  }

  // ── Get Current Bid State ──────────────────────────────────────────────────

  async getBidState(itemId: string) {
    // Try cache first
    const cached = await this.redis.get(`bid:${itemId}`);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    // Fallback to DB
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
      select: { id: true, price: true, auctionId: true },
    });

    if (!item) throw new NotFoundException('Item not found');

    const winningBid = await this.prisma.bid.findFirst({
      where: { itemId },
      orderBy: { amount: 'desc' },
      include: {
        bidder: { select: { id: true, displayName: true } },
      },
    });

    const totalBids = await this.prisma.bid.count({ where: { itemId } });

    return {
      itemId,
      currentPrice: item.price,
      highestBidderId: winningBid?.bidderId ?? null,
      highestBidderName: winningBid?.bidder.displayName ?? null,
      totalBids,
    };
  }

  // ── Start Item Bidding ─────────────────────────────────────────────────────

  async startItemBidding(sellerId: string, auctionId: string, itemId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new BadRequestException('You do not own this auction');
    }

    // Set any current LIVE item back to QUEUED
    await this.prisma.shopItem.updateMany({
      where: { auctionId, status: ShopItemStatus.LIVE },
      data: { status: ShopItemStatus.QUEUED },
    });

    await this.prisma.bid.deleteMany({
      where: { itemId },
    });

    await this.redis.del(`bid:${itemId}`);

    // Set this item to LIVE
    const item = await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: ShopItemStatus.LIVE },
    });

    return item;
  }

  // ── End Item Bidding ───────────────────────────────────────────────────────

  async endItemBidding(sellerId: string, auctionId: string, itemId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new BadRequestException('You do not own this auction');
    }

    // ✅ Use Redis as source of truth — always has the latest bid
    const cached = await this.redis.get(`bid:${itemId}`);
    let winner: { userId: string; displayName: string; amount: number } | null =
      null;

    if (cached) {
      const state = JSON.parse(cached) as {
        highestBidderId: string;
        highestBidderName: string;
        currentPrice: number;
      };
      winner = {
        userId: state.highestBidderId,
        displayName: state.highestBidderName,
        amount: state.currentPrice,
      };
    }

    // Mark item as sold or available
    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        status: winner ? ShopItemStatus.SOLD : ShopItemStatus.AVAILABLE,
      },
    });

    // Clear Redis cache
    await this.redis.del(`bid:${itemId}`);

    return { itemId, winner };
  }

  // ── Get Bid History ────────────────────────────────────────────────────────

  async getBidHistory(itemId: string) {
    return this.prisma.bid.findMany({
      where: { itemId },
      include: {
        bidder: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { placedAt: 'desc' },
      take: 50,
    });
  }
}
