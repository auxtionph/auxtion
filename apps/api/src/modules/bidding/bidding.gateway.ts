import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { PrismaService } from '../../prisma/prisma.service';

interface PlaceBidPayload {
  auctionId: string;
  itemId: string;
  amount: number;
}

interface JoinAuctionPayload {
  auctionId: string;
}

interface StartItemPayload {
  auctionId: string;
  itemId: string;
}

interface StartItemTimerPayload {
  auctionId: string;
  itemId: string;
  sellerId: string;
  startSeconds: number;
  counterbidSeconds: number;
}

interface TimerState {
  remaining: number;
  counterbidSeconds: number;
  auctionId: string;
  itemId: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'auctions',
})
export class BiddingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BiddingGateway.name);
  private viewerCounts = new Map<string, number>();
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private timerState = new Map<string, TimerState>();

  constructor(
    private readonly biddingService: BiddingService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Connection ─────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    client.rooms.forEach((room) => {
      if (room.startsWith('auction:')) {
        const auctionId = room.replace('auction:', '');
        this.decrementViewers(auctionId);
        this.broadcastViewerCount(auctionId);
      }
    });
  }

  // ── Join ───────────────────────────────────────────────────────────────────

  @SubscribeMessage('join-auction')
  async handleJoinAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAuctionPayload,
  ) {
    const room = `auction:${payload.auctionId}`;
    await client.join(room);

    this.incrementViewers(payload.auctionId);
    this.broadcastViewerCount(payload.auctionId);

    // Send current bid state to joining client
    try {
      const bidState = await this.biddingService.getBidState(payload.auctionId);
      client.emit('bid-state', bidState);
    } catch {
      // No active item yet
    }

    // ✅ Send active timer state to late joiners
    const activeItem = [...this.timerState.values()].find(
      (s) => s.auctionId === payload.auctionId,
    );
    if (activeItem) {
      client.emit('timer-started', {
        itemId: activeItem.itemId,
        remaining: activeItem.remaining,
        counterbidSeconds: activeItem.counterbidSeconds,
      });
    }

    // ✅ Send last 100 chat messages to this client only
    const history = await this.prisma.auctionChatMessage.findMany({
      where: { auctionId: payload.auctionId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (history.length > 0) {
      client.emit(
        'chat-history',
        history.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          message: m.message,
          timestamp: Number(m.timestamp),
        })),
      );
    }

    this.logger.log(`Client ${client.id} joined auction ${payload.auctionId}`);
    return { event: 'joined', room };
  }

  // ── Leave ──────────────────────────────────────────────────────────────────

  @SubscribeMessage('leave-auction')
  async handleLeaveAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAuctionPayload,
  ) {
    const room = `auction:${payload.auctionId}`;
    await client.leave(room);
    this.decrementViewers(payload.auctionId);
    this.broadcastViewerCount(payload.auctionId);
    return { event: 'left', room };
  }

  // ── Start Item Timer ───────────────────────────────────────────────────────

  @SubscribeMessage('start-item-timer')
  async handleStartItemTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartItemTimerPayload,
  ) {
    const { auctionId, itemId, sellerId, startSeconds, counterbidSeconds } =
      payload;

    // Validate seller owns auction
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction || auction.sellerId !== sellerId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Clear any existing timer for this item
    this.clearTimer(itemId);

    // Start item bidding in DB
    await this.biddingService.startItemBidding(sellerId, auctionId, itemId);

    // Get item details for broadcast
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });
    if (!item) return;

    // Set timer state
    this.timerState.set(itemId, {
      remaining: startSeconds,
      counterbidSeconds,
      auctionId,
      itemId,
    });

    // Broadcast item started
    this.server.to(`auction:${auctionId}`).emit('item-started', {
      itemId: item.id,
      title: item.title,
      currentPrice: item.price,
      photos: item.photos,
      timestamp: Date.now(),
    });

    // Broadcast timer started
    this.server.to(`auction:${auctionId}`).emit('timer-started', {
      itemId,
      remaining: startSeconds,
      counterbidSeconds,
    });

    // Start countdown
    this.startCountdown(auctionId, itemId);

    this.logger.log(
      `Timer started: item ${itemId} — ${startSeconds}s (counterbid: ${counterbidSeconds}s)`,
    );
  }

  // ── Place Bid ──────────────────────────────────────────────────────────────

  @SubscribeMessage('place-bid')
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PlaceBidPayload & { bidderId: string },
  ) {
    try {
      const result = await this.biddingService.placeBid(
        payload.bidderId,
        payload.auctionId,
        payload.itemId,
        payload.amount,
      );

      // ✅ Counterbid reset — if bid placed within counterbid window, reset timer
      const state = this.timerState.get(payload.itemId);
      if (state && state.remaining <= state.counterbidSeconds) {
        this.logger.log(
          `Counterbid! Resetting timer to ${state.counterbidSeconds}s`,
        );

        // Clear current tick
        const existing = this.activeTimers.get(payload.itemId);
        if (existing) clearTimeout(existing);

        state.remaining = state.counterbidSeconds;

        this.server.to(`auction:${payload.auctionId}`).emit('timer-update', {
          itemId: payload.itemId,
          remaining: state.counterbidSeconds,
          isCounterbid: true,
        });

        // Restart countdown from reset value
        this.startCountdown(payload.auctionId, payload.itemId);
      }

      this.server.to(`auction:${payload.auctionId}`).emit('bid-update', {
        auctionId: payload.auctionId,
        itemId: result.itemId,
        bidderId: result.bidderId,
        bidderName: result.bidderName,
        amount: result.amount,
        totalBids: result.totalBids,
        timestamp: result.timestamp,
      });

      client.emit('bid-confirmed', {
        success: true,
        amount: result.amount,
        timestamp: result.timestamp,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bid failed';
      client.emit('bid-error', { message });
      throw new WsException(message);
    }
  }

  // ── Start Item (legacy — no timer) ─────────────────────────────────────────

  @SubscribeMessage('start-item')
  async handleStartItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartItemPayload & { sellerId: string },
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const item = await this.biddingService.startItemBidding(
        payload.sellerId,
        payload.auctionId,
        payload.itemId,
      );

      this.server.to(`auction:${payload.auctionId}`).emit('item-started', {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        itemId: item.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        title: item.title,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        startingPrice: item.price,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        photos: item.photos,
        timestamp: Date.now(),
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { success: true, item };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start item';
      client.emit('error', { message });
      throw new WsException(message);
    }
  }

  // ── End Item ───────────────────────────────────────────────────────────────

  @SubscribeMessage('end-item')
  async handleEndItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartItemPayload & { sellerId: string },
  ) {
    try {
      this.clearTimer(payload.itemId);

      const result = await this.biddingService.endItemBidding(
        payload.sellerId,
        payload.auctionId,
        payload.itemId,
      );

      this.server.to(`auction:${payload.auctionId}`).emit('item-ended', {
        itemId: payload.itemId,
        winner: result.winner,
        timestamp: Date.now(),
      });

      return { success: true, result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to end item';
      client.emit('error', { message });
      throw new WsException(message);
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  @SubscribeMessage('chat-message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      auctionId: string;
      userId: string;
      displayName: string;
      message: string;
    },
  ) {
    const timestamp = Date.now();

    await this.prisma.auctionChatMessage.create({
      data: {
        auctionId: payload.auctionId,
        userId: payload.userId,
        displayName: payload.displayName,
        message: payload.message,
        timestamp: BigInt(timestamp),
      },
    });

    this.server.to(`auction:${payload.auctionId}`).emit('chat-message', {
      userId: payload.userId,
      displayName: payload.displayName,
      message: payload.message,
      timestamp,
    });
  }

  // ── End Auction ────────────────────────────────────────────────────────────

  @SubscribeMessage('end-auction')
  handleEndAuction(@MessageBody() payload: { auctionId: string }) {
    // Clear all timers for this auction
    this.timerState.forEach((state, itemId) => {
      if (state.auctionId === payload.auctionId) {
        this.clearTimer(itemId);
      }
    });

    this.server.to(`auction:${payload.auctionId}`).emit('auction-ended', {
      auctionId: payload.auctionId,
      timestamp: Date.now(),
    });
  }

  // ── Timer Internals ────────────────────────────────────────────────────────

  private startCountdown(auctionId: string, itemId: string) {
    const tick = () => {
      const state = this.timerState.get(itemId);
      if (!state) return;

      state.remaining -= 1;

      this.server.to(`auction:${auctionId}`).emit('timer-update', {
        itemId,
        remaining: state.remaining,
        isCounterbid: false,
      });

      if (state.remaining <= 0) {
        this.clearTimer(itemId);
        void this.handleTimerExpired(auctionId, itemId);
      } else {
        const timeout = setTimeout(tick, 1000);
        this.activeTimers.set(itemId, timeout);
      }
    };

    const timeout = setTimeout(tick, 1000);
    this.activeTimers.set(itemId, timeout);
  }

  private async handleTimerExpired(auctionId: string, itemId: string) {
    this.logger.log(`Timer expired — auto-selling item ${itemId}`);
    try {
      const auction = await this.prisma.auction.findUnique({
        where: { id: auctionId },
      });
      if (!auction) return;

      const result = await this.biddingService.endItemBidding(
        auction.sellerId,
        auctionId,
        itemId,
      );

      this.server.to(`auction:${auctionId}`).emit('timer-ended', {
        itemId,
        timestamp: Date.now(),
      });

      this.server.to(`auction:${auctionId}`).emit('item-ended', {
        itemId,
        winner: result.winner,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Item ${itemId} auto-sold to ${result.winner?.displayName ?? 'no winner'}`,
      );
    } catch (e) {
      this.logger.error(`Auto-end failed for item ${itemId}:`, e);
    }
  }

  private clearTimer(itemId: string) {
    const existing = this.activeTimers.get(itemId);
    if (existing) {
      clearTimeout(existing);
      this.activeTimers.delete(itemId);
    }
    this.timerState.delete(itemId);
  }

  // ── Viewer Count ───────────────────────────────────────────────────────────

  private incrementViewers(auctionId: string) {
    const current = this.viewerCounts.get(auctionId) ?? 0;
    this.viewerCounts.set(auctionId, current + 1);
  }

  private decrementViewers(auctionId: string) {
    const current = this.viewerCounts.get(auctionId) ?? 0;
    this.viewerCounts.set(auctionId, Math.max(0, current - 1));
  }

  private broadcastViewerCount(auctionId: string) {
    const count = this.viewerCounts.get(auctionId) ?? 0;
    this.server.to(`auction:${auctionId}`).emit('viewer-count', { count });
  }
}
