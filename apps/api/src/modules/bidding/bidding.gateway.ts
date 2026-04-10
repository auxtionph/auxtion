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

    // ✅ Send last 100 chat messages to this client only (not broadcast)
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

      this.server.to(`auction:${payload.auctionId}`).emit('bid-update', {
        itemId: result.itemId,
        currentPrice: result.amount,
        highestBidderId: result.bidderId,
        highestBidderName: result.bidderName,
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

  // ── Start Item ─────────────────────────────────────────────────────────────

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

    // ✅ Persist via Prisma before broadcasting
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
    this.server.to(`auction:${payload.auctionId}`).emit('auction-ended', {
      auctionId: payload.auctionId,
      timestamp: Date.now(),
    });
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
