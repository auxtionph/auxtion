import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuctionStatus } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import { OffersService } from '../offers/offers.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly offersService: OffersService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async autoConfirmDeliveries() {
    this.logger.log('Running auto-confirm deliveries job...');
    const result = await this.ordersService.autoConfirmDeliveries();
    this.logger.log(`Auto-confirmed ${result.confirmed} deliveries`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoReleasePayouts() {
    this.logger.log('Running auto-release payouts job...');
    const result = await this.ordersService.autoReleasePayouts();
    this.logger.log(`Released ${result.released} payouts`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireOffers() {
    this.logger.log('Running expire offers job...');
    const result = await this.offersService.expireOffers();
    this.logger.log(`Expired ${result.expired} offers`);
  }

  // ── Auto-Shift Overdue Auctions ────────────────────────────────────────────
  // Runs every minute
  // If a SCHEDULED auction is past its startTime → shift to next 15-min slot
  // Also shift all subsequent SCHEDULED auctions by same delay
  // If already shifted past startTime + 45min → cancel

  @Cron('* * * * *')
  async autoCancelOverdueAuctions() {
    const now = new Date();
    const MAX_DELAY_MS = 45 * 60 * 1000;
    const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

    // Find SCHEDULED auctions where startTime has passed
    const overdue = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.SCHEDULED,
        startTime: { lt: now },
      },
      orderBy: { startTime: 'asc' },
    });

    for (const auction of overdue) {
      const scheduledTime = new Date(auction.startTime);
      const overdueMs = now.getTime() - scheduledTime.getTime();

      // Past 45min window → cancel, don't shift subsequent
      if (overdueMs >= MAX_DELAY_MS) {
        this.logger.log(
          `Cancelling overdue auction ${auction.id} — past 45min window`,
        );
        await this.prisma.auction.update({
          where: { id: auction.id },
          data: { status: AuctionStatus.CANCELLED },
        });
        continue;
      }

      // Snap to exact 15-min boundary (no floating point drift)
      const newStartTime = new Date(
        Math.ceil(now.getTime() / INTERVAL_MS) * INTERVAL_MS,
      );
      // Zero out seconds and milliseconds for clean times
      newStartTime.setSeconds(0, 0);

      // Only update if time actually changed
      if (newStartTime.getTime() === scheduledTime.getTime()) continue;

      // Calculate shift in whole minutes to avoid ms drift
      const shiftMinutes = Math.round(
        (newStartTime.getTime() - scheduledTime.getTime()) / 60000,
      );
      const shiftMs = shiftMinutes * 60000;

      this.logger.log(
        `Shifting auction "${auction.title}" by ${Math.round(shiftMs / 60000)}min → ${newStartTime.toISOString()}`,
      );

      // Shift this auction
      await this.prisma.auction.update({
        where: { id: auction.id },
        data: { startTime: newStartTime },
      });

      // Shift all subsequent SCHEDULED auctions by same amount
      const subsequent = await this.prisma.auction.findMany({
        where: {
          sellerId: auction.sellerId,
          status: AuctionStatus.SCHEDULED,
          startTime: { gt: scheduledTime },
          id: { not: auction.id },
        },
      });

      for (const next of subsequent) {
        const shifted = new Date(next.startTime.getTime() + shiftMs);
        shifted.setSeconds(0, 0);
        await this.prisma.auction.update({
          where: { id: next.id },
          data: { startTime: shifted },
        });
      }
    }
  }
}
