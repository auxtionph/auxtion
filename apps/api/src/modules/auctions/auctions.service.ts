import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { AuctionStatus, ShopItemStatus, UserRole } from '@prisma/client';
import { StreamingService } from '../streaming/streaming.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streamingService: StreamingService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Create Auction ─────────────────────────────────────────────────────────

  async createAuction(sellerId: string, dto: CreateAuctionDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });

    if (!user || user.role !== UserRole.SELLER) {
      throw new ForbiddenException('Only approved sellers can create auctions');
    }

    return this.prisma.auction.create({
      data: {
        sellerId,
        title: dto.title,
        startTime: new Date(dto.startTime),
        coverImageUrl: dto.coverImageUrl ?? null,
        status: AuctionStatus.SCHEDULED,
      },
    });
  }

  // ── Get All Live & Scheduled Auctions (Feed) ───────────────────────────────

  async getFeed() {
    return this.prisma.auction.findMany({
      where: {
        status: {
          in: [AuctionStatus.LIVE, AuctionStatus.SCHEDULED],
        },
      },
      include: {
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            sellerTier: true,
          },
        },
        shopItems: {
          where: {
            status: {
              in: [ShopItemStatus.QUEUED, ShopItemStatus.AVAILABLE],
            },
          },
          select: {
            id: true,
            title: true,
            photos: true,
            price: true,
            type: true,
            status: true,
            queueOrder: true,
          },
          orderBy: { queueOrder: 'asc' },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  // ── Get Single Auction ─────────────────────────────────────────────────────

  async getAuctionById(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
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
        shopItems: {
          orderBy: { queueOrder: 'asc' },
        },
        bids: {
          orderBy: { placedAt: 'desc' },
          take: 10,
          include: {
            bidder: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!auction) throw new NotFoundException('Auction not found');

    return auction;
  }

  // ── Get Seller's Auctions ──────────────────────────────────────────────────

  async getSellerAuctions(sellerId: string) {
    return this.prisma.auction.findMany({
      where: { sellerId },
      include: {
        shopItems: {
          select: {
            id: true,
            title: true,
            status: true,
            queueOrder: true,
          },
          orderBy: { queueOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Update Auction ─────────────────────────────────────────────────────────

  async updateAuction(
    sellerId: string,
    auctionId: string,
    dto: UpdateAuctionDto,
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this auction');
    }
    if (auction.status === AuctionStatus.ENDED) {
      throw new BadRequestException('Cannot update an ended auction');
    }

    return this.prisma.auction.update({
      where: { id: auctionId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.startTime && { startTime: new Date(dto.startTime) }),
        ...(dto.coverImageUrl !== undefined && {
          coverImageUrl: dto.coverImageUrl,
        }),
      },
    });
  }

  // ── Go Live ────────────────────────────────────────────────────────────────
  async goLive(sellerId: string, auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this auction');
    }
    // Prevent seller from having two live auctions simultaneously
    const existingLive = await this.prisma.auction.findFirst({
      where: { sellerId, status: AuctionStatus.LIVE },
    });
    if (existingLive) {
      throw new BadRequestException(
        'You already have a live auction. End it before starting a new one.',
      );
    }

    // Block if currently co-hosting someone else's live
    const activeCoHost = await this.prisma.auction.findFirst({
      where: { coHostId: sellerId, status: AuctionStatus.LIVE },
    });
    if (activeCoHost) {
      throw new BadRequestException(
        "You're currently co-hosting another live. Leave it before going live.",
      );
    }
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Auction is not in scheduled status');
    }

    const now = new Date();
    const scheduledTime = new Date(auction.startTime);
    const MAX_DELAY_MS = 45 * 60 * 1000; // 45 minutes

    // Past cancellation window — cancel and reject
    if (now.getTime() > scheduledTime.getTime() + MAX_DELAY_MS) {
      await this.prisma.auction.update({
        where: { id: auctionId },
        data: { status: AuctionStatus.CANCELLED },
      });
      throw new BadRequestException(
        'This auction exceeded the 45-minute delay window and has been cancelled.',
      );
    }

    // Calculate delay (0 if on time or early)
    const delayMs = Math.max(0, now.getTime() - scheduledTime.getTime());

    // If late, shift all subsequent SCHEDULED auctions by same delay
    if (delayMs > 0) {
      const subsequentAuctions = await this.prisma.auction.findMany({
        where: {
          sellerId,
          status: AuctionStatus.SCHEDULED,
          startTime: { gt: scheduledTime },
          id: { not: auctionId },
        },
        orderBy: { startTime: 'asc' },
      });

      for (const next of subsequentAuctions) {
        const newStartTime = new Date(next.startTime.getTime() + delayMs);
        await this.prisma.auction.update({
          where: { id: next.id },
          data: { startTime: newStartTime },
        });
      }
    }

    const roomId = await this.streamingService.createRoom(
      auctionId,
      auction.title,
    );

    const liveAuction = await this.prisma.auction.update({
      where: { id: auctionId },
      data: {
        status: AuctionStatus.LIVE,
        streamUrl: roomId,
        hmsRoomId: roomId,
        actualStartTime: now,
      },
      include: {
        seller: { select: { displayName: true } },
      },
    });

    // ── Notify auction + seller followers ────────────────────────────
    void Promise.all([
      this.notifications.sendToAuctionFollowers(auctionId, {
        title: '🔴 Live now!',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        body: `${liveAuction.seller.displayName} just went live — tap to join!`,
        data: { auctionId, screen: 'live' },
      }),
      this.notifications.sendToSellerFollowers(sellerId, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        title: `🔴 ${liveAuction.seller.displayName} is live!`,
        body: `${liveAuction.title} — join now before it ends!`,
        data: { auctionId, screen: 'live' },
      }),
    ]);

    return liveAuction;
  }

  // ── Get Scheduled Slots ────────────────────────────────────────────────────
  async getScheduledSlots(sellerId: string, date: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const auctions = await this.prisma.auction.findMany({
      where: {
        sellerId,
        status: { in: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] },
        startTime: { gte: start, lte: end },
      },
      select: { startTime: true, title: true },
    });

    return auctions.map((a) => ({
      startTime: a.startTime.toISOString(),
      hour: a.startTime.getHours(),
      minute: a.startTime.getMinutes(),
      title: a.title,
    }));
  }

  // ── End Stream ─────────────────────────────────────────────────────────────

  async endStream(sellerId: string, auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        shopItems: {
          where: { status: ShopItemStatus.LIVE },
        },
      },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this auction');
    }
    if (auction.status !== AuctionStatus.LIVE) {
      throw new BadRequestException('Auction is not live');
    }

    // Reset any LIVE item back to QUEUED with original price
    // No winner — item was interrupted mid-auction
    for (const item of auction.shopItems) {
      await this.prisma.shopItem.update({
        where: { id: item.id },
        data: {
          status: ShopItemStatus.QUEUED,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          price: item.originalPrice > 0 ? item.originalPrice : item.price,
        },
      });
    }

    // End the auction
    const ended = await this.prisma.auction.update({
      where: { id: auctionId },
      data: {
        status: AuctionStatus.ENDED,
        endTime: new Date(),
      },
    });

    // Auto-cancel any failed payments for this auction
    await this.prisma.payment.updateMany({
      where: {
        order: { auctionId },
        status: 'FAILED',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'STREAM_ENDED',
      },
    });

    return ended;
  }

  // ── Add Item to Auction Queue ──────────────────────────────────────────────

  async addItemToAuction(sellerId: string, auctionId: string, itemId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this auction');
    }

    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });

    if (!item) throw new NotFoundException('Item not found');
    if (item.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this item');
    }
    if (item.status !== ShopItemStatus.AVAILABLE) {
      throw new BadRequestException('Item is not available');
    }

    // Get current queue count for ordering
    const queueCount = await this.prisma.shopItem.count({
      where: { auctionId },
    });

    return this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        auctionId,
        // BUY_NOW items stay AVAILABLE — only AUCTION items go to QUEUED
        status:
          item.type === 'BUY_NOW'
            ? ShopItemStatus.AVAILABLE
            : ShopItemStatus.QUEUED,
        queueOrder: item.type === 'BUY_NOW' ? null : queueCount + 1,
      },
    });
  }

  // ── Cancel Auction ─────────────────────────────────────────────────────────

  async cancelAuction(sellerId: string, auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this auction');
    }
    if (auction.status === AuctionStatus.ENDED) {
      throw new BadRequestException('Auction has already ended');
    }

    return this.prisma.auction.update({
      where: { id: auctionId },
      data: { status: AuctionStatus.CANCELLED },
    });
  }

  async getActiveAuction(sellerId: string) {
    const auction = await this.prisma.auction.findFirst({
      where: {
        sellerId,
        status: AuctionStatus.LIVE,
      },
      select: {
        id: true,
        title: true,
        streamUrl: true,
        startTime: true,
        shopItems: {
          where: {
            status: { in: ['LIVE', 'QUEUED'] },
          },
          select: {
            id: true,
            title: true,
            status: true,
            mode: true,
          },
        },
      },
    });

    return auction ?? null;
  }

  async setHmsRoomId(userId: string, auctionId: string, hmsRoomId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { sellerId: true },
    });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.sellerId !== userId) {
      throw new ForbiddenException('Not your auction');
    }
    return this.prisma.auction.update({
      where: { id: auctionId },
      data: { hmsRoomId },
    });
  }
}
