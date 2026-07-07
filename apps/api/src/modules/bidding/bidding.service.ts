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
    // ── Amount must be a positive whole number of centavos ──
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'Bid amount must be a positive whole number',
      );
    }

    // ── Cheap up-front validation (re-checked atomically under the row lock) ──
    const [auction, item, bidder] = await Promise.all([
      this.prisma.auction.findUnique({ where: { id: auctionId } }),
      this.prisma.shopItem.findUnique({ where: { id: itemId } }),
      this.prisma.user.findUnique({
        where: { id: bidderId },
        select: { id: true, displayName: true },
      }),
    ]);

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== AuctionStatus.LIVE)
      throw new BadRequestException('Auction is not live');
    if (!item) throw new NotFoundException('Item not found');
    if (item.auctionId !== auctionId)
      throw new BadRequestException('Item does not belong to this auction');
    if (item.status !== ShopItemStatus.LIVE)
      throw new BadRequestException('Item is not currently being auctioned');
    if (auction.sellerId === bidderId)
      throw new BadRequestException('Sellers cannot bid on their own auctions');
    if (!bidder) throw new NotFoundException('Bidder not found');

    // ── Atomic bid: serialize concurrent bids on this item via a row lock ──
    // Postgres SELECT ... FOR UPDATE on the shop_items row means two racing
    // bids can never both read the same "current price" and both win — the
    // second waits for the first to commit. The write is AWAITED (no more
    // fire-and-forget), so a failed DB write surfaces as a bid-error instead
    // of a phantom confirmed bid.
    const newTotalBids = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "shop_items" WHERE id = ${itemId} FOR UPDATE`;

      const locked = await tx.shopItem.findUnique({
        where: { id: itemId },
        select: { price: true, status: true, auctionId: true },
      });
      if (!locked || locked.status !== ShopItemStatus.LIVE)
        throw new BadRequestException('Item is not currently being auctioned');
      if (locked.auctionId !== auctionId)
        throw new BadRequestException('Item does not belong to this auction');

      const existingBidCount = await tx.bid.count({ where: { itemId } });
      const currentPrice = locked.price;

      if (existingBidCount === 0) {
        if (amount < currentPrice)
          throw new BadRequestException(`Bid must be at least ${currentPrice}`);
      } else {
        if (amount <= currentPrice)
          throw new BadRequestException(
            `Bid must be higher than ${currentPrice}`,
          );
      }

      await tx.bid.updateMany({
        where: { itemId, isWinning: true },
        data: { isWinning: false },
      });
      await tx.bid.create({
        data: { auctionId, itemId, bidderId, amount, isWinning: true },
      });
      await tx.shopItem.update({
        where: { id: itemId },
        data: { price: amount },
      });

      return existingBidCount + 1;
    });

    // ── Redis is now a read-through cache, not the source of truth ──
    const bidState = {
      auctionId,
      itemId,
      currentPrice: amount,
      highestBidderId: bidderId,
      highestBidderName: bidder.displayName,
      totalBids: newTotalBids,
      updatedAt: Date.now(),
    };
    await this.redis
      .set(`bid:${itemId}`, JSON.stringify(bidState), 3600)
      .catch(() => undefined);

    return {
      auctionId,
      itemId,
      bidderId,
      bidderName: bidder.displayName,
      amount,
      totalBids: newTotalBids,
      timestamp: Date.now(),
    };
  }

  // ── Apply a Proxy (Max-Bid) Increment ──────────────────────────────────────
  // Records the proxy leader as the winning bidder at `amount` under the same
  // row lock as manual bids, so the DB (the source of truth for the winner)
  // always reflects who is actually winning. Refuses to lower the price.
  async applyProxyBid(
    auctionId: string,
    itemId: string,
    bidderId: string,
    bidderName: string,
    amount: number,
  ): Promise<{ applied: boolean; currentPrice: number; totalBids: number }> {
    if (!Number.isInteger(amount) || amount <= 0) {
      return { applied: false, currentPrice: 0, totalBids: 0 };
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "shop_items" WHERE id = ${itemId} FOR UPDATE`;
      const locked = await tx.shopItem.findUnique({
        where: { id: itemId },
        select: { price: true, status: true },
      });
      if (!locked || locked.status !== ShopItemStatus.LIVE) {
        return {
          applied: false,
          currentPrice: locked?.price ?? 0,
          totalBids: 0,
        };
      }
      if (amount <= locked.price) {
        const totalBids = await tx.bid.count({ where: { itemId } });
        return { applied: false, currentPrice: locked.price, totalBids };
      }
      await tx.bid.updateMany({
        where: { itemId, isWinning: true },
        data: { isWinning: false },
      });
      await tx.bid.create({
        data: { auctionId, itemId, bidderId, amount, isWinning: true },
      });
      await tx.shopItem.update({
        where: { id: itemId },
        data: { price: amount },
      });
      const totalBids = await tx.bid.count({ where: { itemId } });
      return { applied: true, currentPrice: amount, totalBids };
    });

    if (outcome.applied) {
      const bidState = {
        auctionId,
        itemId,
        currentPrice: amount,
        highestBidderId: bidderId,
        highestBidderName: bidderName,
        totalBids: outcome.totalBids,
        updatedAt: Date.now(),
      };
      await this.redis
        .set(`bid:${itemId}`, JSON.stringify(bidState), 3600)
        .catch(() => undefined);
    }

    return outcome;
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

    // Reset any current LIVE item back to QUEUED
    await this.prisma.shopItem.updateMany({
      where: { auctionId, status: ShopItemStatus.LIVE },
      data: { status: ShopItemStatus.QUEUED },
    });

    // Get original price before clearing bids
    const itemMeta = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
      select: { originalPrice: true },
    });

    await this.prisma.bid.deleteMany({
      where: { itemId },
    });

    await this.redis.del(`bid:${itemId}`);

    // Reset price to originalPrice + set LIVE
    const item = await this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        status: ShopItemStatus.LIVE,
        mode: 'auction', // gateway overrides to 'chat' if needed
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        price:
          itemMeta?.originalPrice && itemMeta.originalPrice > 0
            ? itemMeta.originalPrice
            : undefined,
      },
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

    // ── DB is the source of truth for the winner ──
    // Redis has a 3600s TTL and can be evicted/restarted mid-auction; reading
    // the winner from Redis silently dropped real bids. The highest bid wins;
    // ties break to the earliest bid (first to reach that amount).
    const winningBid = await this.prisma.bid.findFirst({
      where: { itemId },
      orderBy: [{ amount: 'desc' }, { placedAt: 'asc' }],
      include: { bidder: { select: { id: true, displayName: true } } },
    });

    const winner = winningBid
      ? {
          userId: winningBid.bidderId,
          displayName: winningBid.bidder.displayName,
          amount: winningBid.amount,
        }
      : null;

    // Mark item as sold or available
    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        status: winner ? ShopItemStatus.SOLD : ShopItemStatus.QUEUED,
      },
    });

    // Clear Redis cache (best-effort — no longer authoritative)
    await this.redis.del(`bid:${itemId}`).catch(() => undefined);

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
