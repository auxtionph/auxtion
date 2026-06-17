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
import { StreamingService } from '../streaming/streaming.service';

interface PlaceBidPayload {
  auctionId: string;
  itemId: string;
  amount: number;
}

interface JoinAuctionPayload {
  auctionId: string;
  sellerId?: string;
  userId?: string;
  displayName?: string;
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

interface InviteCoHostPayload {
  auctionId: string;
  hostUserId: string;
  targetUserId: string;
}

interface AcceptCoHostInvitePayload {
  auctionId: string;
  userId: string;
  displayName: string;
  hmsPeerId: string;
}

interface DeclineCoHostInvitePayload {
  auctionId: string;
  userId: string;
}

interface KickCoHostPayload {
  auctionId: string;
  hostUserId: string;
}

interface LeaveCoHostPayload {
  auctionId: string;
  userId: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'auctions',
  pingTimeout: 10000,
  pingInterval: 5000,
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
  private auctionRosters = new Map<
    string,
    Map<string, { displayName: string; joinedAt: number }>
  >();
  private auctionViewers = new Map<string, Set<string>>();
  private socketToViewer = new Map<
    string,
    { auctionId: string; viewerId: string }
  >();
  // Co-host state
  private pendingCoHostInvites = new Map<
    string,
    { targetUserId: string; expiresAt: number }
  >();
  private coHostPeerIds = new Map<string, { userId: string; peerId: string }>();
  private sellerDisconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly biddingService: BiddingService,
    private readonly prisma: PrismaService,
    private readonly maxBidsService: MaxBidsService,
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly streaming: StreamingService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    const auctionId = this.socketToAuction.get(client.id);
    if (auctionId) {
      this.socketToAuction.delete(client.id);
      let disconnectedUserId: string | undefined;
      for (const [uid, sid] of this.userSocketMap.entries()) {
        if (sid === client.id) {
          disconnectedUserId = uid;
          this.userSocketMap.delete(uid);
          break;
        }
      }
      if (disconnectedUserId) {
        const roster = this.auctionRosters.get(auctionId);
        if (roster?.has(disconnectedUserId)) {
          roster.delete(disconnectedUserId);
          this.server.to(`auction:${auctionId}`).emit('room:roster-updated');
        }
      }
      const sellerSet = this.sellerSockets.get(auctionId);
      if (sellerSet?.has(client.id)) {
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

          // ── Auto-end if seller doesn't return within 3 minutes ──────────
          const existingTimer = this.sellerDisconnectTimers.get(auctionId);
          if (existingTimer) clearTimeout(existingTimer);

          const autoEndTimer = setTimeout(
            () => {
              this.sellerDisconnectTimers.delete(auctionId);
              void this.runAutoEnd(auctionId);
            },
            3 * 60 * 1000,
          );

          this.sellerDisconnectTimers.set(auctionId, autoEndTimer);
          this.logger.log(
            `Auto-end timer started for auction ${auctionId} — fires in 3 minutes`,
          );
        }
      }
    }

    const viewerInfo = this.socketToViewer.get(client.id);
    if (viewerInfo) {
      const { auctionId, viewerId } = viewerInfo;
      this.socketToViewer.delete(client.id);
      // Only remove from viewer Set if they have no other active socket in this room
      const stillConnected = this.userSocketMap.has(viewerId);
      if (!stillConnected) {
        this.auctionViewers.get(auctionId)?.delete(viewerId);
      }
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

  private logRoster(label: string) {
    const snapshot = Array.from(this.auctionRosters.entries()).map(
      ([aid, roster]) => ({
        auctionId: aid,
        viewers: Array.from(roster.entries()).map(([uid, d]) => ({
          uid,
          displayName: d.displayName,
        })),
      }),
    );
    this.logger.log(`[ROSTER:${label}] ${JSON.stringify(snapshot)}`);
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
      select: { sellerId: true, status: true },
    });
    if (auction) {
      this.logger.log(
        `Join payload sellerId: ${payload.sellerId ?? 'none'}, auction sellerId: ${auction.sellerId}`,
      );
      if (payload.sellerId === auction.sellerId && auction.status === 'LIVE') {
        if (!this.sellerSockets.has(payload.auctionId)) {
          this.sellerSockets.set(payload.auctionId, new Set());
        }
        this.sellerSockets.get(payload.auctionId)!.add(client.id);
        this.socketToAuction.set(client.id, payload.auctionId);
        this.logger.log(
          `Seller socket tracked: ${client.id} for auction ${payload.auctionId} (total: ${this.sellerSockets.get(payload.auctionId)!.size})`,
        );

        // ── Clear auto-end timer if seller rejoins ──────────────────────
        const pendingAutoEnd = this.sellerDisconnectTimers.get(
          payload.auctionId,
        );
        if (pendingAutoEnd) {
          clearTimeout(pendingAutoEnd);
          this.sellerDisconnectTimers.delete(payload.auctionId);
          this.logger.log(
            `Auto-end timer CLEARED — seller rejoined auction ${payload.auctionId}`,
          );
          // Don't auto-resume — seller will choose via the resume modal
        }
      }
    }

    // Track every joiner (seller, co-host, viewer) by userId for targeted emits.
    // Client passes the userId in the `sellerId` field of the join payload (legacy).
    const joinerUserId = payload.userId ?? payload.sellerId;
    if (joinerUserId) {
      this.userSocketMap.set(joinerUserId, client.id);
      this.socketToAuction.set(client.id, payload.auctionId);
      this.logger.log(
        `[userSocketMap] ${joinerUserId} → ${client.id} (auction ${payload.auctionId})`,
      );

      // Roster tracking — resolve displayName from payload or DB
      let displayName = payload.displayName;
      if (!displayName) {
        const u = await this.prisma.user.findUnique({
          where: { id: joinerUserId },
          select: { displayName: true },
        });
        displayName = u?.displayName ?? 'Viewer';
      }
      if (!this.auctionRosters.has(payload.auctionId)) {
        this.auctionRosters.set(payload.auctionId, new Map());
      }
      this.auctionRosters.get(payload.auctionId)!.set(joinerUserId, {
        displayName,
        joinedAt: Date.now(),
      });
      this.server
        .to(`auction:${payload.auctionId}`)
        .emit('room:roster-updated');
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
    // Roster cleanup on explicit leave
    const leaverUserId = payload.userId ?? payload.sellerId;
    if (leaverUserId) {
      const roster = this.auctionRosters.get(payload.auctionId);
      if (roster?.has(leaverUserId)) {
        roster.delete(leaverUserId);
        this.server
          .to(`auction:${payload.auctionId}`)
          .emit('room:roster-updated');
      }
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

      // Block host and co-host from bidding on their own live
      const auctionForBid = await this.prisma.auction.findUnique({
        where: { id: payload.auctionId },
        select: { coHostId: true, sellerId: true },
      });
      if (auctionForBid?.coHostId === payload.bidderId) {
        client.emit('bid-error', {
          message: "Co-hosts can't bid on the live they're hosting.",
        });
        return;
      }
      if (auctionForBid?.sellerId === payload.bidderId) {
        client.emit('bid-error', {
          message: "You can't bid on your own live.",
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
      const item = await this.biddingService.startItemBidding(
        payload.sellerId,
        payload.auctionId,
        payload.itemId,
      );
      this.server.to(`auction:${payload.auctionId}`).emit('item-started', {
        itemId: item.id,
        title: item.title,
        startingPrice: item.price,
        photos: item.photos,
        timestamp: Date.now(),
      });
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
    // Clear any pending auto-end timer — seller ended manually
    const pendingTimer = this.sellerDisconnectTimers.get(payload.auctionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.sellerDisconnectTimers.delete(payload.auctionId);
    }

    // Demote co-host if present
    void (async () => {
      const a = await this.prisma.auction.findUnique({
        where: { id: payload.auctionId },
        select: { coHostId: true, hmsRoomId: true },
      });
      if (a?.coHostId && a.hmsRoomId) {
        const info = this.coHostPeerIds.get(payload.auctionId);
        if (info) {
          try {
            await this.streaming.changePeerRole(
              a.hmsRoomId,
              info.peerId,
              'viewer-realtime',
            );
          } catch (e) {
            this.logger.error('Auto-demote on end-auction failed:', e);
          }
        }
        await this.prisma.auction.update({
          where: { id: payload.auctionId },
          data: { coHostId: null },
        });
        this.coHostPeerIds.delete(payload.auctionId);
        this.server.to(`auction:${payload.auctionId}`).emit('co-host:left', {
          auctionId: payload.auctionId,
          userId: a.coHostId,
          reason: 'auction-ended',
        });
      }
    })();
    this.timerState.forEach((state, itemId) => {
      if (state.auctionId === payload.auctionId) {
        this.clearTimer(itemId);
      }
    });

    // Reset LIVE swipe-auction items back to QUEUED (chat bid items are left as-is — seller declares winner)
    void this.prisma.shopItem.updateMany({
      where: { auctionId: payload.auctionId, status: 'LIVE', mode: 'auction' },
      data: { status: 'QUEUED' },
    });

    this.auctionViewers.delete(payload.auctionId);

    this.auctionRosters.delete(payload.auctionId);

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

  // ────────────────────────────────────────────────────────────────────────────
  //  CO-HOST FLOW
  // ────────────────────────────────────────────────────────────────────────────

  @SubscribeMessage('host:invite-co-host')
  async handleInviteCoHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: InviteCoHostPayload,
  ) {
    const { auctionId, hostUserId, targetUserId } = payload;

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        sellerId: true,
        coHostId: true,
        seller: { select: { displayName: true } },
      },
    });
    if (!auction || auction.sellerId !== hostUserId) {
      client.emit('error', { message: 'Only the host can invite a co-host.' });
      return;
    }
    if (auction.coHostId) {
      client.emit('error', {
        message: 'A co-host is already active. Remove them first.',
      });
      return;
    }
    if (targetUserId === hostUserId) {
      client.emit('error', { message: "You can't invite yourself." });
      return;
    }

    const targetSocketId = this.userSocketMap.get(targetUserId);
    if (!targetSocketId) {
      client.emit('error', { message: 'That user is no longer in the live.' });
      return;
    }

    const existingCoHost = await this.prisma.auction.findFirst({
      where: { coHostId: targetUserId, status: 'LIVE' },
    });
    if (existingCoHost) {
      client.emit('error', {
        message: 'That user is already co-hosting another live.',
      });
      return;
    }

    this.pendingCoHostInvites.set(auctionId, {
      targetUserId,
      expiresAt: Date.now() + 60_000,
    });

    this.server.to(targetSocketId).emit('co-host:invited', {
      auctionId,
      hostUserId,
      hostDisplayName: auction.seller.displayName,
    });

    this.logger.log(
      `Co-host invite: ${hostUserId} → ${targetUserId} (auction ${auctionId})`,
    );
  }

  @SubscribeMessage('co-host:accept-invite')
  async handleAcceptCoHostInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AcceptCoHostInvitePayload,
  ) {
    const { auctionId, userId, displayName, hmsPeerId } = payload;

    const pending = this.pendingCoHostInvites.get(auctionId);
    if (!pending || pending.targetUserId !== userId) {
      client.emit('error', { message: 'No active invite for you.' });
      return;
    }
    if (Date.now() > pending.expiresAt) {
      this.pendingCoHostInvites.delete(auctionId);
      client.emit('error', { message: 'Invite expired.' });
      return;
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { hmsRoomId: true },
    });
    if (!auction?.hmsRoomId) {
      client.emit('error', { message: 'HMS room not initialized.' });
      return;
    }

    try {
      await this.streaming.changePeerRole(
        auction.hmsRoomId,
        hmsPeerId,
        'co-broadcaster',
      );
    } catch (e) {
      this.logger.error(`HMS promote failed for ${userId}:`, e);
      client.emit('error', {
        message: 'Failed to switch you to broadcaster. Try again.',
      });
      return;
    }

    await this.prisma.auction.update({
      where: { id: auctionId },
      data: { coHostId: userId },
    });
    this.coHostPeerIds.set(auctionId, { userId, peerId: hmsPeerId });
    this.pendingCoHostInvites.delete(auctionId);

    this.server.to(`auction:${auctionId}`).emit('co-host:joined', {
      auctionId,
      userId,
      displayName,
    });

    this.server.to(`auction:${auctionId}`).emit('room:roster-updated');

    this.logger.log(
      `Co-host joined: ${displayName} (${userId}) in auction ${auctionId}`,
    );
  }

  @SubscribeMessage('co-host:decline-invite')
  handleDeclineCoHostInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeclineCoHostInvitePayload,
  ) {
    const pending = this.pendingCoHostInvites.get(payload.auctionId);
    if (pending?.targetUserId === payload.userId) {
      this.pendingCoHostInvites.delete(payload.auctionId);
    }
    this.server
      .to(`auction:${payload.auctionId}`)
      .emit('co-host:invite-declined', {
        auctionId: payload.auctionId,
        declinedByUserId: payload.userId,
      });
  }

  @SubscribeMessage('host:kick-co-host')
  async handleKickCoHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: KickCoHostPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: payload.auctionId },
      select: { sellerId: true, coHostId: true, hmsRoomId: true },
    });
    if (!auction || auction.sellerId !== payload.hostUserId) {
      client.emit('error', { message: 'Only the host can kick the co-host.' });
      return;
    }
    if (!auction.coHostId) return;

    const coHostInfo = this.coHostPeerIds.get(payload.auctionId);
    if (coHostInfo && auction.hmsRoomId) {
      try {
        await this.streaming.changePeerRole(
          auction.hmsRoomId,
          coHostInfo.peerId,
          'viewer-realtime',
        );
      } catch (e) {
        this.logger.error(`HMS demote (kick) failed:`, e);
      }
    }

    const kickedUserId = auction.coHostId;
    await this.prisma.auction.update({
      where: { id: payload.auctionId },
      data: { coHostId: null },
    });
    this.coHostPeerIds.delete(payload.auctionId);

    this.server.to(`auction:${payload.auctionId}`).emit('co-host:left', {
      auctionId: payload.auctionId,
      userId: kickedUserId,
      reason: 'kicked',
    });

    this.server.to(`auction:${payload.auctionId}`).emit('room:roster-updated');

    this.logger.log(
      `Co-host kicked: ${kickedUserId} from auction ${payload.auctionId}`,
    );
  }

  @SubscribeMessage('co-host:self-leave')
  async handleCoHostSelfLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveCoHostPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: payload.auctionId },
      select: { coHostId: true, hmsRoomId: true },
    });
    if (!auction || auction.coHostId !== payload.userId) return;

    const coHostInfo = this.coHostPeerIds.get(payload.auctionId);
    if (coHostInfo && auction.hmsRoomId) {
      try {
        await this.streaming.changePeerRole(
          auction.hmsRoomId,
          coHostInfo.peerId,
          'viewer-realtime',
        );
      } catch (e) {
        this.logger.error(`HMS demote (self-leave) failed:`, e);
      }
    }

    await this.prisma.auction.update({
      where: { id: payload.auctionId },
      data: { coHostId: null },
    });
    this.coHostPeerIds.delete(payload.auctionId);

    this.server.to(`auction:${payload.auctionId}`).emit('co-host:left', {
      auctionId: payload.auctionId,
      userId: payload.userId,
      reason: 'self-left',
    });

    this.server.to(`auction:${payload.auctionId}`).emit('room:roster-updated');
  }
  private async runAutoEnd(auctionId: string): Promise<void> {
    this.logger.log(`[AUTO-END] Firing for auction ${auctionId}`);

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        status: true,
        sellerId: true,
        coHostId: true,
        hmsRoomId: true,
      },
    });
    if (!auction || auction.status !== 'LIVE') {
      this.logger.log(`[AUTO-END] Skipped — auction ${auctionId} is not LIVE`);
      return;
    }

    // Clear all item timers
    this.timerState.forEach((_state, itemId) => {
      if (_state.auctionId === auctionId) this.clearTimer(itemId);
    });

    // Handle running swipe item — sell to highest bidder if bids exist
    const liveSwipeItem = await this.prisma.shopItem.findFirst({
      where: { auctionId, status: 'LIVE', mode: 'auction' },
    });
    if (liveSwipeItem) {
      try {
        await this.maxBidsService.deactivateForItem(liveSwipeItem.id);
        const result = await this.biddingService.endItemBidding(
          auction.sellerId,
          auctionId,
          liveSwipeItem.id,
        );
        this.server.to(`auction:${auctionId}`).emit('item-ended', {
          itemId: liveSwipeItem.id,
          winner: result.winner,
          timestamp: Date.now(),
        });
        if (result.winner) {
          try {
            await this.paymentsService.createPaymongoOrder({
              buyerId: result.winner.userId,
              sellerId: auction.sellerId,
              itemId: liveSwipeItem.id,
              auctionId,
              amount: result.winner.amount,
              mode: 'auction',
            });
            const itemData = await this.prisma.shopItem.findUnique({
              where: { id: liveSwipeItem.id },
              select: { title: true },
            });
            void this.notifications.sendToUser(result.winner.userId, {
              title: '🎉 You won!',
              body: `You won ${itemData?.title ?? 'an item'} for ₱${(result.winner.amount / 100).toLocaleString()}. Pay now to secure it!`,
              data: { screen: 'order' },
            });
          } catch (e) {
            this.logger.error(`[AUTO-END] Order creation failed:`, e);
          }
        }
      } catch (e) {
        this.logger.error(
          `[AUTO-END] endItemBidding failed, resetting to QUEUED:`,
          e,
        );
        await this.prisma.shopItem.update({
          where: { id: liveSwipeItem.id },
          data: { status: 'QUEUED' },
        });
      }
    }

    // Handle running chat item — reset to QUEUED (can't auto-declare winner)
    const liveChatItem = await this.prisma.shopItem.findFirst({
      where: { auctionId, status: 'LIVE', mode: 'chat' },
    });
    if (liveChatItem) {
      const originalPrice =
        liveChatItem.originalPrice > 0
          ? liveChatItem.originalPrice
          : liveChatItem.price;
      await this.prisma.shopItem.update({
        where: { id: liveChatItem.id },
        data: { status: 'QUEUED', price: originalPrice },
      });
      this.server.to(`auction:${auctionId}`).emit('item-ended', {
        itemId: liveChatItem.id,
        winner: null,
        timestamp: Date.now(),
      });
    }

    // Handle live buy now — pull back to AVAILABLE
    const liveBuyNowItem = await this.prisma.shopItem.findFirst({
      where: { auctionId, status: 'LIVE_BUYNOW' },
    });
    if (liveBuyNowItem) {
      await this.prisma.shopItem.update({
        where: { id: liveBuyNowItem.id },
        data: { status: 'AVAILABLE' },
      });
      this.server.to(`auction:${auctionId}`).emit('buynow-pulled', {
        itemId: liveBuyNowItem.id,
      });
    }

    // Demote co-host if present
    if (auction.coHostId && auction.hmsRoomId) {
      const info = this.coHostPeerIds.get(auctionId);
      if (info) {
        try {
          await this.streaming.changePeerRole(
            auction.hmsRoomId,
            info.peerId,
            'viewer-realtime',
          );
        } catch (e) {
          this.logger.error(`[AUTO-END] Co-host demote failed:`, e);
        }
      }
      await this.prisma.auction.update({
        where: { id: auctionId },
        data: { coHostId: null },
      });
      this.coHostPeerIds.delete(auctionId);
      this.server.to(`auction:${auctionId}`).emit('co-host:left', {
        auctionId,
        userId: auction.coHostId,
        reason: 'auction-ended',
      });
    }

    // End auction in DB
    await this.prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'ENDED', endTime: new Date() },
    });

    // Cleanup in-memory state
    this.auctionViewers.delete(auctionId);
    this.auctionRosters.delete(auctionId);
    this.sellerSockets.delete(auctionId);

    this.server.to(`auction:${auctionId}`).emit('auction-ended', {
      auctionId,
      timestamp: Date.now(),
    });

    this.logger.log(`[AUTO-END] Auction ${auctionId} ended successfully`);
  }

  @SubscribeMessage('host:request-roster')
  handleRequestRoster(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { auctionId: string; sellerId: string; coHostId?: string },
  ): void {
    const roster = this.auctionRosters.get(payload.auctionId);
    if (!roster) {
      client.emit('room:roster', []);
      return;
    }
    const list = Array.from(roster.entries())
      .filter(([uid]) => uid !== payload.sellerId && uid !== payload.coHostId)
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    client.emit('room:roster', list);
  }
}
