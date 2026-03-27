import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SDK } from '@100mslive/server-sdk';

@Injectable()
export class StreamingService {
  private hms: SDK;

  constructor(private readonly configService: ConfigService) {
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
    const authToken = await this.hms.auth.getAuthToken({
      roomId,
      userId,
      role,
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
}
