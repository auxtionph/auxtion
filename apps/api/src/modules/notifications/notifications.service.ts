import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default';
  badge?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendToUser(userId: string, message: Omit<PushMessage, 'to'>) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    if (!user?.pushToken) return;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    await this.send([{ to: user.pushToken, sound: 'default', ...message }]);
  }

  async sendToUsers(userIds: string[], message: Omit<PushMessage, 'to'>) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, pushToken: { not: null } },
      select: { pushToken: true },
    });
    const messages = users
      .filter((u) => u.pushToken)
      .map((u) => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        to: u.pushToken!,
        sound: 'default' as const,
        ...message,
      }));
    if (messages.length === 0) return;
    await this.send(messages);
  }

  async sendToAuctionFollowers(
    auctionId: string,
    message: Omit<PushMessage, 'to'>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const followers = await this.prisma.auctionFollower.findMany({
      where: { auctionId },
      select: { userId: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const userIds = followers.map((f) => f.userId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (userIds.length === 0) return;
    await this.sendToUsers(userIds, message);
  }

  async sendToSellerFollowers(
    sellerId: string,
    message: Omit<PushMessage, 'to'>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const followers = await this.prisma.sellerFollower.findMany({
      where: { sellerId },
      select: { userId: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    const userIds = followers.map((f) => f.userId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (userIds.length === 0) return;
    await this.sendToUsers(userIds, message);
  }

  private async send(messages: PushMessage[]) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.error(`Expo push failed: ${await res.text()}`);
        return;
      }
      const data = (await res.json()) as {
        data: { status: string; message?: string }[];
      };
      const failed = data.data?.filter((r) => r.status !== 'ok');
      if (failed?.length) {
        this.logger.warn(`Push issues: ${JSON.stringify(failed)}`);
      } else {
        this.logger.log(`Push sent to ${messages.length} device(s)`);
      }
    } catch (err) {
      this.logger.error(`Push error: ${String(err)}`);
    }
  }
}
