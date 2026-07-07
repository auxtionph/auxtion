import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SDK } from '@100mslive/server-sdk';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';

export type HmsRole = 'broadcaster' | 'co-broadcaster' | 'viewer-realtime';

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  private hms: SDK;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.hms = new SDK(
      this.configService.getOrThrow<string>('HMS_APP_ACCESS_KEY'),
      this.configService.getOrThrow<string>('HMS_APP_SECRET'),
    );
  }

  async generateToken(
    roomId: string,
    userId: string,
    role: 'broadcaster' | 'viewer-realtime',
  ): Promise<string> {
    // ── Authorize the requested role against room ownership ────────────────
    // The roomId is publicly discoverable (storefront), so a broadcaster token
    // must never be handed out on the client's say-so. Only the auction's
    // seller may publish; everyone else is forced to viewer-realtime. (Co-hosts
    // join as viewers and are promoted later via changePeerRole.)
    let grantedRole: HmsRole = 'viewer-realtime';
    if (role === 'broadcaster') {
      const auction = await this.prisma.auction.findFirst({
        where: { hmsRoomId: roomId },
        select: { sellerId: true },
      });
      if (auction && auction.sellerId === userId) {
        grantedRole = 'broadcaster';
      } else {
        this.logger.warn(
          `Denied broadcaster token: user ${userId} does not own room ${roomId}`,
        );
      }
    }

    const authToken = await this.hms.auth.getAuthToken({
      roomId,
      userId,
      role: grantedRole,
    });
    return authToken.token;
  }

  async createRoom(auctionId: string, name: string): Promise<string> {
    const room = await this.hms.rooms.create({
      name: `auxtion-${auctionId}`,
      description: name,
      template_id: this.configService.getOrThrow<string>('HMS_TEMPLATE_ID'),
    });
    return room.id;
  }

  // ── HMS Active Rooms management ──────────────────────────────────────────
  // The server SDK doesn't expose peer role-change endpoints — they live under
  // the Active Rooms REST API, which requires a management token (HS256 JWT
  // signed with HMS_APP_SECRET).

  private getManagementToken(): string {
    const accessKey =
      this.configService.getOrThrow<string>('HMS_APP_ACCESS_KEY');
    const secret = this.configService.getOrThrow<string>('HMS_APP_SECRET');
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        access_key: accessKey,
        type: 'management',
        version: 2,
        iat: now,
        nbf: now,
      },
      secret,
      { algorithm: 'HS256', expiresIn: '24h', jwtid: `${Date.now()}` },
    );
  }

  /** Promote or demote a peer's role inside a live HMS room. */
  async changePeerRole(
    roomId: string,
    peerId: string,
    role: HmsRole,
  ): Promise<void> {
    if (!roomId || !peerId) {
      throw new InternalServerErrorException('HMS roomId or peerId missing');
    }
    const res = await fetch(
      `https://api.100ms.live/v2/active-rooms/${roomId}/peers/${peerId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getManagementToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`HMS changePeerRole failed (${res.status}): ${text}`);
      throw new InternalServerErrorException(
        `HMS role change failed: ${res.status}`,
      );
    }
    this.logger.log(`HMS role changed: peer ${peerId} → ${role}`);
  }

  /** Forcibly remove a peer from the room. */
  async removePeer(
    roomId: string,
    peerId: string,
    reason = 'Removed by host',
  ): Promise<void> {
    const res = await fetch(
      `https://api.100ms.live/v2/active-rooms/${roomId}/peers/${peerId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.getManagementToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`HMS removePeer failed (${res.status}): ${text}`);
      throw new InternalServerErrorException(
        `HMS remove peer failed: ${res.status}`,
      );
    }
  }
}
