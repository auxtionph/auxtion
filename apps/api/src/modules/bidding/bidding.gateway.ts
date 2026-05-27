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
import { MaxBidsService } from '../max-bids/max-bids.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';

interface PlaceBidPayload {
  auctionId: string;
  itemId: string;
  amount: number;
}

interface JoinAuctionPayload {
  auctionId: string;
  sellerId?: string;
  userId?: string;
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
  paused: boolean;
}

interface StartChatBidPayload {
  auctionId: string;
  itemId: string;
  sellerId: string;
  displaySeconds: number; // 0 = no timer
}

interface DeclareChatWinnerPayload {
  auctionId: string;
  itemId: string;
  sellerId: string;
  winnerId: string;
  winnerName: string;
  amount: number; // in centavos
}

interface SkipChatItemPayload {
  auctionId: string;
  itemId: string;
  sellerId: string;
}

interface StartLiveBuyNowPayload {
  auctionId: string;
  itemId: string;
  sellerId: string;
}

interface ClaimBuyNowPayload {
  auctionId: string;
  itemId: string;
  buyerId: string;
  buyerName: string;
}

interface PullBuyNowPayload {
  auctionId: string;
  itemId: string;
  sellerId: string;
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
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private timerState = new Map<string, TimerState>();
  private lastBidTime = new Map<string, number>();
  private sellerSockets = new Map<string, Set<string>>();
  private socketToAuction = new Map<string, string>();
  private userSocketMap = new Map<string, string>();
  private auctionViewers = new Map<string, Set<string>>();
  private socketToViewer = new Map<
    string,
    { auctionId: string; viewerId: string }
  >();

  constructor(
    private readonly biddingService: BiddingService,
    private readonly prisma: PrismaService,
    private readonly maxBidsService: MaxBidsService,
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    const auctionId = this.socketToAuction.get(client.id);
    if (auctionId) {
      this.socketToAuction.delete(client.id);
      for (const [uid, sid] of this.userSocketMap.entries()) {
        if (sid === client.id) {
          this.userSocketMap.delete(uid);
          break;
        }
      }
      const sellerSet = this.sellerSockets.get(auctionId);
      if (sellerSet) {
        sellerSet.delete(client.id);
        this.logger.log(
          `Seller socket removed: ${client.id}, remaining: ${sellerSet.size}`,
        );

        if (sellerSet.size === 0) {
          this.sellerSockets.delete(auctionId);
          this.timerState.forEach((state, itemId) => {
            if (state.auctionId === auctionId && !state.paused) {
              state.paused = true;
              const existing = this.activeTimers.get(itemId);
              if (existing) {
                clearTimeout(existing);
                this.activeTimers.delete(itemId);
              }
              this.logger.log(
                `Timer PAUSED — all seller sockets gone from auction ${auctionId}`,
              );
              this.server.to(`auction:${auctionId}`).emit('timer-paused', {
                itemId,
                remaining: state.remaining,
                reason: 'seller_disconnected',
              });
            }
          });
        }
      }
    }

    const viewerInfo = this.socketToViewer.get(client.id);
    if (viewerInfo) {
      const { auctionId, viewerId } = viewerInfo;
      this.auctionViewers.get(auctionId)?.delete(viewerId);
      this.socketToViewer.delete(client.id);
      this.broadcastViewerCount(auctionId);
    } else {
      client.rooms.forEach((room) => {
        if (room.startsWith('auction:')) {
          const aid = room.replace('auction:', '');
          this.broadcastViewerCount(aid);
        }
      });
    }
  }

  @SubscribeMessage('join-auction')
  async handleJoinAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAuctionPayload,
  ) {
    const room = `auction:${payload.auctionId}`;
    await client.join(room);
    this.logger.log(`Join payload: ${JSON.stringify(payload)}`);

    const auction = await this.prisma.auction.findUnique({
      where: { id: payload.auctionId },
      select: { sellerId: true },
    });
    if (auction) {
      this.logger.log(
        `Join payload sellerId: ${payload.sellerId ?? 'none'}, auction sellerId: ${auction.sellerId}`,
      );
      if (payload.sellerId === auction.sellerId) {
        if (!this.sellerSockets.has(payload.auctionId)) {
          this.sellerSockets.set(payload.auctionId, new Set());
        }
        this.sellerSockets.get(payload.auctionId)!.add(client.id);
        this.socketToAuction.set(client.id, payload.auctionId);
        if (payload.userId) this.userSocketMap.set(payload.userId, client.id);
        this.logger.log(
          `Seller socket tracked: ${client.id} for auction ${payload.auctionId} (total: ${this.sellerSockets.get(payload.auctionId)!.size})`,
        );
      }
    }

    // ── Viewer dedup ──────────────────────────────────────────
    const isSeller = auction?.sellerId === payload.sellerId;
    if (!isSeller) {
      if (!this.auctionViewers.has(payload.auctionId)) {
        this.auctionViewers.set(payload.auctionId, new Set());
      }
      const viewerId = payload.userId ?? client.id;
      this.auctionViewers.get(payload.auctionId)!.add(viewerId);
      this.socketToViewer.set(client.id, {
        auctionId: payload.auctionId,
        viewerId,
      });
    }
    this.broadcastViewerCount(payload.auctionId);

    try {
      const activeItem = [...this.timerState.values()].find(
        (s) => s.auctionId === payload.auctionId,
      );
      if (activeItem) {
        const bidState = await this.biddingService.getBidState(
          activeItem.itemId,
        );
        client.emit('bid-state', bidState);
      }
    } catch {
      // No active item yet
    }

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

  @SubscribeMessage('leave-auction')
  async handleLeaveAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinAuctionPayload,
  ) {
    const room = `auction:${payload.auctionId}`;
    await client.leave(room);
    const viewerInfo = this.socketToViewer.get(client.id);
    if (viewerInfo) {
      this.auctionViewers
        .get(viewerInfo.auctionId)
        ?.delete(viewerInfo.viewerId);
      this.socketToViewer.delete(client.id);
    }
    this.broadcastViewerCount(payload.auctionId);
    return { event: 'left', room };
  }

  @SubscribeMessage('start-item-timer')
  async handleStartItemTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartItemTimerPayload,
  ) {
    const { auctionId, itemId, sellerId, startSeconds, counterbidSeconds } =
      payload;

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction || auction.sellerId !== sellerId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    this.clearTimer(itemId);
    await this.biddingService.startItemBidding(sellerId, auctionId, itemId);

    const item = await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { mode: 'auction' },
    });
    if (!item) return;

    this.timerState.set(itemId, {
      remaining: startSeconds,
      counterbidSeconds,
      auctionId,
      itemId,
      paused: false,
    });

    this.server.to(`auction:${auctionId}`).emit('item-started', {
      itemId: item.id,
      title: item.title,
      currentPrice: item.price,
      photos: item.photos,
      timestamp: Date.now(),
    });

    this.server.to(`auction:${auctionId}`).emit('timer-started', {
      itemId,
      remaining: startSeconds,
      counterbidSeconds,
    });

    this.startCountdown(auctionId, itemId);

    this.server.to(`auction:${auctionId}`).emit('shop-updated', {
      auctionId,
      timestamp: Date.now(),
    });

    this.logger.log(
      `Timer started: item ${itemId} — ${startSeconds}s (counterbid: ${counterbidSeconds}s)`,
    );
  }

  @SubscribeMessage('place-bid')
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PlaceBidPayload & { bidderId: string },
  ) {
    try {
      const timerState = this.timerState.get(payload.itemId);
      if (timerState?.paused) {
        client.emit('bid-error', {
          message: 'Bidding is paused — seller is reconnecting.',
        });
        return;
      }

      this.lastBidTime.set(payload.itemId, Date.now());

      const result = await this.biddingService.placeBid(
        payload.bidderId,
        payload.auctionId,
        payload.itemId,
        payload.amount,
      );

      const state = this.timerState.get(payload.itemId);
      if (
        state &&
        (state.remaining <= state.counterbidSeconds || state.remaining <= 1)
      ) {
        this.logger.log(
          `Counterbid! Resetting timer to ${state.counterbidSeconds}s`,
        );
        const existing = this.activeTimers.get(payload.itemId);
        if (existing) clearTimeout(existing);
        state.remaining = state.counterbidSeconds;
        this.server.to(`auction:${payload.auctionId}`).emit('timer-update', {
          itemId: payload.itemId,
          remaining: state.counterbidSeconds,
          isCounterbid: true,
        });
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
      await this.resolveProxyBids(
        payload.auctionId,
        payload.itemId,
        payload.amount,
        payload.bidderId,
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bid failed';
      client.emit('bid-error', { message });
      throw new WsException(message);
    }
  }

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
      this.server.to(`auction:${payload.auctionId}`).emit('shop-updated', {
        auctionId: payload.auctionId,
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

  @SubscribeMessage('notify-shop-updated')
  handleNotifyShopUpdated(@MessageBody() payload: { auctionId: string }) {
    this.server.to(`auction:${payload.auctionId}`).emit('shop-updated', {
      auctionId: payload.auctionId,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('pause-item-timer')
  handlePauseTimer(
    @MessageBody()
    payload: {
      auctionId: string;
      itemId: string;
      sellerId: string;
    },
  ) {
    const state = this.timerState.get(payload.itemId);
    if (!state || state.auctionId !== payload.auctionId) return;
    if (!payload.sellerId) return;

    state.paused = true;
    const existing = this.activeTimers.get(payload.itemId);
    if (existing) {
      clearTimeout(existing);
      this.activeTimers.delete(payload.itemId);
    }

    this.logger.log(
      `Timer PAUSED for item ${payload.itemId} — seller disconnected`,
    );
    this.server.to(`auction:${payload.auctionId}`).emit('timer-paused', {
      itemId: payload.itemId,
      remaining: state.remaining,
      reason: 'seller_disconnected',
    });
  }

  @SubscribeMessage('resume-item-timer')
  handleResumeTimer(
    @MessageBody()
    payload: {
      auctionId: string;
      itemId: string;
      sellerId: string;
    },
  ) {
    const state = this.timerState.get(payload.itemId);
    if (!state || state.auctionId !== payload.auctionId) return;

    state.paused = false;
    this.logger.log(
      `Timer RESUMED for item ${payload.itemId} at ${state.remaining}s`,
    );
    this.server.to(`auction:${payload.auctionId}`).emit('timer-resumed', {
      itemId: payload.itemId,
      remaining: state.remaining,
    });
    this.startCountdown(payload.auctionId, payload.itemId);
  }

  @SubscribeMessage('cancel-item-timer')
  handleCancelItemTimer(
    @MessageBody() payload: { auctionId: string; itemId: string },
  ) {
    this.clearTimer(payload.itemId);
    this.logger.log(`Timer CANCELLED for item ${payload.itemId}`);

    this.server.to(`auction:${payload.auctionId}`).emit('timer-resumed', {
      itemId: payload.itemId,
      remaining: 0,
    });
    this.server.to(`auction:${payload.auctionId}`).emit('item-ended', {
      itemId: payload.itemId,
      winner: null,
      timestamp: Date.now(),
    });
    this.server.to(`auction:${payload.auctionId}`).emit('shop-updated', {
      auctionId: payload.auctionId,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('start-chat-bid')
  async handleStartChatBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartChatBidPayload,
  ) {
    const { auctionId, itemId, sellerId, displaySeconds } = payload;

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction || auction.sellerId !== sellerId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    await this.biddingService.startItemBidding(sellerId, auctionId, itemId);

    const item = await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { mode: 'chat' },
    });
    if (!item) return;

    // Broadcast item started with mode: chat
    this.server.to(`auction:${auctionId}`).emit('item-started', {
      itemId: item.id,
      title: item.title,
      currentPrice: item.price,
      photos: item.photos,
      mode: 'chat',
      timestamp: Date.now(),
    });

    // Optional display-only timer — no auto-end
    if (displaySeconds > 0) {
      this.server.to(`auction:${auctionId}`).emit('timer-started', {
        itemId,
        remaining: displaySeconds,
        counterbidSeconds: 0,
      });
      this.timerState.set(itemId, {
        remaining: displaySeconds,
        counterbidSeconds: 0,
        auctionId,
        itemId,
        paused: false,
      });
      this.startDisplayCountdown(auctionId, itemId);
    }

    this.server.to(`auction:${auctionId}`).emit('shop-updated', {
      auctionId,
      timestamp: Date.now(),
    });

    this.logger.log(`Chat bid started: item ${itemId} in auction ${auctionId}`);
  }

  @SubscribeMessage('declare-chat-winner')
  async handleDeclareChatWinner(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeclareChatWinnerPayload,
  ) {
    const { auctionId, itemId, sellerId, winnerId, winnerName, amount } =
      payload;

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction || auction.sellerId !== sellerId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Clear any display timer
    this.clearTimer(itemId);

    // Record the sale
    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: 'SOLD' },
    });

    await this.prisma.bid.create({
      data: {
        itemId,
        bidderId: winnerId,
        auctionId,
        amount,
      },
    });

    this.server.to(`auction:${auctionId}`).emit('item-ended', {
      itemId,
      winner: {
        userId: winnerId,
        displayName: winnerName,
        amount,
      },
      timestamp: Date.now(),
    });

    this.server.to(`auction:${auctionId}`).emit('shop-updated', {
      auctionId,
      timestamp: Date.now(),
    });

    // ── Create manual order (Mode 2 — GCash outside app) ────────────────────
    try {
      await this.ordersService.createManual({
        itemId,
        auctionId,
        sellerId: auction.sellerId,
        buyerId: winnerId,
        amount,
        mode: 'chat',
      });
      // Notify winner
      const item = await this.prisma.shopItem.findUnique({
        where: { id: itemId },
        select: { title: true },
      });
      void this.notifications.sendToUser(winnerId, {
        title: '🎉 You won!',
        body: `You won ${item?.title ?? 'an item'} for ₱${(amount / 100).toLocaleString()}. Pay now to secure it!`,
        data: { screen: 'order' },
      });
    } catch (e) {
      this.logger.error(`Chat order creation failed for item ${itemId}:`, e);
    }

    this.logger.log(
      `Chat bid winner declared: ${winnerName} won item ${itemId} at ${amount}`,
    );
  }

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

  @SubscribeMessage('reaction')
  handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { auctionId: string; emoji: string; userId: string },
  ) {
    // Broadcast to everyone in the room including sender
    this.server.to(`auction:${payload.auctionId}`).emit('reaction', {
      emoji: payload.emoji,
      userId: payload.userId,
    });
  }

  @SubscribeMessage('skip-chat-item')
  async handleSkipChatItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SkipChatItemPayload,
  ) {
    const { auctionId, itemId, sellerId } = payload;

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction || auction.sellerId !== sellerId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Clear any display timer
    this.clearTimer(itemId);

    // Reset item back to QUEUED with original price
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
      select: { originalPrice: true, price: true },
    });

    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: {
        status: 'QUEUED',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        price:
          item?.originalPrice && item.originalPrice > 0
            ? item.originalPrice
            : (item?.price ?? 0),
      },
    });

    // Clear any bids placed during this chat bid round
    await this.prisma.bid.deleteMany({ where: { itemId } });
    await this.biddingService['redis'].del(`bid:${itemId}`);

    // Notify all clients — no winner
    this.server.to(`auction:${auctionId}`).emit('item-ended', {
      itemId,
      winner: null,
      timestamp: Date.now(),
    });

    this.server.to(`auction:${auctionId}`).emit('shop-updated', {
      auctionId,
      timestamp: Date.now(),
    });

    this.logger.log(`Chat item skipped: ${itemId} — reset to QUEUED`);
  }

  @SubscribeMessage('end-auction')
  handleEndAuction(@MessageBody() payload: { auctionId: string }) {
    this.timerState.forEach((state, itemId) => {
      if (state.auctionId === payload.auctionId) {
        this.clearTimer(itemId);
      }
    });

    // Reset any LIVE items back to QUEUED — covers chat bid items with no winner
    void this.prisma.shopItem.updateMany({
      where: { auctionId: payload.auctionId, status: 'LIVE' },
      data: { status: 'QUEUED' },
    });

    this.auctionViewers.delete(payload.auctionId);

    this.server.to(`auction:${payload.auctionId}`).emit('auction-ended', {
      auctionId: payload.auctionId,
      timestamp: Date.now(),
    });
  }

  private startCountdown(auctionId: string, itemId: string) {
    const tick = () => {
      const state = this.timerState.get(itemId);
      if (!state) return;
      if (state.paused) return;

      state.remaining -= 1;
      this.server.to(`auction:${auctionId}`).emit('timer-update', {
        itemId,
        remaining: state.remaining,
        isCounterbid: false,
      });

      if (state.remaining <= 0) {
        const existing = this.activeTimers.get(itemId);
        if (existing) clearTimeout(existing);
        this.activeTimers.delete(itemId);
        void this.handleTimerExpired(auctionId, itemId);
      } else {
        const timeout = setTimeout(tick, 1000);
        this.activeTimers.set(itemId, timeout);
      }
    };

    const timeout = setTimeout(tick, 1000);
    this.activeTimers.set(itemId, timeout);
  }

  private startDisplayCountdown(auctionId: string, itemId: string) {
    const tick = () => {
      const state = this.timerState.get(itemId);
      if (!state || state.paused) return;

      state.remaining -= 1;
      this.server.to(`auction:${auctionId}`).emit('timer-update', {
        itemId,
        remaining: state.remaining,
        isCounterbid: false,
      });

      if (state.remaining <= 0) {
        this.activeTimers.delete(itemId);
        this.timerState.delete(itemId);
        // Emit timer-ended but do NOT auto-sell — seller declares winner manually
        this.server.to(`auction:${auctionId}`).emit('timer-ended', {
          itemId,
          timestamp: Date.now(),
        });
      } else {
        const timeout = setTimeout(tick, 1000);
        this.activeTimers.set(itemId, timeout);
      }
    };

    const timeout = setTimeout(tick, 1000);
    this.activeTimers.set(itemId, timeout);
  }

  private async handleTimerExpired(auctionId: string, itemId: string) {
    const state = this.timerState.get(itemId);
    const lastBid = this.lastBidTime.get(itemId);

    if (lastBid && Date.now() - lastBid < 3000) {
      this.logger.log(`Snipe detected — extending timer`);
      const counterbidSeconds = state?.counterbidSeconds ?? 5;
      this.timerState.set(itemId, {
        remaining: counterbidSeconds,
        counterbidSeconds,
        auctionId,
        itemId,
        paused: false,
      });
      this.server.to(`auction:${auctionId}`).emit('timer-update', {
        itemId,
        remaining: counterbidSeconds,
        isCounterbid: true,
      });
      this.startCountdown(auctionId, itemId);
      return;
    }

    this.timerState.delete(itemId);
    this.lastBidTime.delete(itemId);
    this.logger.log(`Timer expired — auto-selling item ${itemId}`);

    try {
      const auction = await this.prisma.auction.findUnique({
        where: { id: auctionId },
      });
      if (!auction) return;

      await this.maxBidsService.deactivateForItem(itemId);
      const result = await this.biddingService.endItemBidding(
        auction.sellerId,
        auctionId,
        itemId,
      );

      this.server
        .to(`auction:${auctionId}`)
        .emit('timer-ended', { itemId, timestamp: Date.now() });
      this.server.to(`auction:${auctionId}`).emit('item-ended', {
        itemId,
        winner: result.winner,
        timestamp: Date.now(),
      });
      this.server.to(`auction:${auctionId}`).emit('shop-updated', {
        auctionId,
        timestamp: Date.now(),
      });

      // ── Create order for winner ──────────────────────────────────────────
      if (result.winner) {
        try {
          await this.paymentsService.createPaymongoOrder({
            buyerId: result.winner.userId,
            sellerId: auction.sellerId,
            itemId,
            auctionId,
            amount: result.winner.amount,
            mode: 'auction',
          });
          this.logger.log(
            `Order created for winner ${result.winner.displayName}`,
          );
          // Notify winner
          const item = await this.prisma.shopItem.findUnique({
            where: { id: itemId },
            select: { title: true },
          });
          void this.notifications.sendToUser(result.winner.userId, {
            title: '🎉 You won!',
            body: `You won ${item?.title ?? 'an item'} for ₱${(result.winner.amount / 100).toLocaleString()}. Pay now to secure it!`,
            data: { screen: 'order' },
          });
        } catch (e) {
          this.logger.error(`Order creation failed for item ${itemId}:`, e);
        }
      }

      this.logger.log(
        `Item ${itemId} auto-sold to ${result.winner?.displayName ?? 'no winner'}`,
      );
    } catch (e) {
      this.logger.error(`Auto-end failed for item ${itemId}:`, e);
    }
  }

  emitToAuction(auctionId: string, event: string, data: unknown) {
    this.server.to(`auction:${auctionId}`).emit(event, data);
  }

  private clearTimer(itemId: string) {
    const existing = this.activeTimers.get(itemId);
    if (existing) {
      clearTimeout(existing);
      this.activeTimers.delete(itemId);
    }
    this.timerState.delete(itemId);
  }

  private broadcastViewerCount(auctionId: string) {
    const count = this.auctionViewers.get(auctionId)?.size ?? 0;
    this.server.to(`auction:${auctionId}`).emit('viewer-count', { count });
  }

  @SubscribeMessage('start-live-buynow')
  async handleStartLiveBuyNow(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: StartLiveBuyNowPayload,
  ) {
    const { auctionId, itemId, sellerId } = payload;

    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.sellerId !== sellerId) return;
    if (item.type !== 'BUY_NOW') return;

    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: 'LIVE_BUYNOW' },
    });

    this.server.to(`auction:${auctionId}`).emit('live-buynow-started', {
      itemId,
      title: item.title,
      price: item.price,
      photos: item.photos,
    });

    this.logger.log(`Live Buy Now started: ${itemId}`);
  }

  @SubscribeMessage('claim-buynow')
  async handleClaimBuyNow(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClaimBuyNowPayload,
  ) {
    const { auctionId, itemId, buyerId, buyerName } = payload;

    // Atomic check — only first claimer wins
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.status !== 'LIVE_BUYNOW') {
      client.emit('buynow-claim-failed', {
        itemId,
        reason: 'Already claimed or not available',
      });
      return;
    }

    // Mark SOLD atomically
    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: 'SOLD' },
    });

    this.server.to(`auction:${auctionId}`).emit('buynow-claimed', {
      itemId,
      title: item.title,
      price: item.price,
      buyerId,
      buyerName,
    });

    // ── Create order for buyer ───────────────────────────────────────────────
    try {
      await this.paymentsService.createPaymongoOrder({
        buyerId,
        sellerId: item.sellerId,
        itemId,
        auctionId,
        amount: item.price,
        mode: 'buynow',
      });
    } catch (e) {
      this.logger.error(`Buy Now order creation failed for item ${itemId}:`, e);
    }

    this.logger.log(`Buy Now claimed: ${itemId} by ${buyerName}`);
  }

  @SubscribeMessage('pull-buynow')
  async handlePullBuyNow(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PullBuyNowPayload,
  ) {
    const { auctionId, itemId, sellerId } = payload;

    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.sellerId !== sellerId) return;
    if (item.status !== 'LIVE_BUYNOW') return;

    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { status: 'AVAILABLE' },
    });

    this.server.to(`auction:${auctionId}`).emit('buynow-pulled', { itemId });
    this.logger.log(`Buy Now pulled back: ${itemId}`);
  }

  private emitToUser(userId: string, event: string, data: unknown) {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) this.server.to(socketId).emit(event, data);
  }

  private async resolveProxyBids(
    auctionId: string,
    itemId: string,
    incomingAmount: number,
    incomingUserId: string,
  ): Promise<void> {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: itemId },
      select: { price: true, status: true },
    });
    if (!item || item.status !== 'LIVE') return;

    const increment = 5000; // fixed increment — minIncrement not on ShopItem
    const activeMaxBids = await this.maxBidsService.getActiveForItem(itemId);
    if (activeMaxBids.length === 0) return;

    const [topProxy, secondProxy] = activeMaxBids;
    if (!topProxy) return;

    if (secondProxy) {
      const finalPrice = Math.min(
        topProxy.amount,
        secondProxy.amount + increment,
      );
      await this.prisma.shopItem.update({
        where: { id: itemId },
        data: { price: finalPrice },
      });
      this.emitToUser(topProxy.userId, 'max-bid-triggered', {
        itemId,
        newPrice: finalPrice,
        yourMax: topProxy.amount,
      });
      this.emitToUser(secondProxy.userId, 'max-bid-exceeded', {
        itemId,
        newPrice: finalPrice,
        yourMax: secondProxy.amount,
      });
      this.emitToAuction(auctionId, 'bid-update', {
        itemId,
        currentPrice: finalPrice,
        winnerId: topProxy.userId,
        bidType: 'proxy',
      });
      return;
    }

    if (topProxy.userId === incomingUserId) return;

    if (incomingAmount >= topProxy.amount) {
      await this.maxBidsService.deactivateForItem(itemId);
      this.emitToUser(topProxy.userId, 'max-bid-exceeded', {
        itemId,
        newPrice: incomingAmount,
        yourMax: topProxy.amount,
      });
      return;
    }

    const counterPrice = Math.min(incomingAmount + increment, topProxy.amount);
    await this.prisma.shopItem.update({
      where: { id: itemId },
      data: { price: counterPrice },
    });
    this.emitToUser(topProxy.userId, 'max-bid-triggered', {
      itemId,
      newPrice: counterPrice,
      yourMax: topProxy.amount,
    });
    this.emitToAuction(auctionId, 'bid-update', {
      itemId,
      currentPrice: counterPrice,
      winnerId: topProxy.userId,
      bidType: 'proxy',
    });
  }

  @SubscribeMessage('set-max-bid')
  async handleSetMaxBid(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      auctionId: string;
      itemId: string;
      amount: number;
      userId: string;
    },
  ) {
    try {
      const maxBid = await this.maxBidsService.upsert(payload.userId, {
        auctionId: payload.auctionId,
        itemId: payload.itemId,
        amount: payload.amount,
      });
      client.emit('max-bid-confirmed', {
        itemId: payload.itemId,
        amount: maxBid.amount,
      });
      const item = await this.prisma.shopItem.findUnique({
        where: { id: payload.itemId },
        select: { price: true },
      });
      if (item)
        await this.resolveProxyBids(
          payload.auctionId,
          payload.itemId,
          item.price ?? 0,
          payload.userId,
        );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Max bid failed';
      client.emit('bid-error', { message });
    }
  }
}
