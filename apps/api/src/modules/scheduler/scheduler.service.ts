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

  // ── Expire Pending Payments (every minute) ─────────────────────────────────

  @Cron('* * * * *')
  async expirePendingPayments() {
    const result = await this.ordersService.expirePendingPayments();
    if (result.expired > 0) {
      this.logger.log(`Expired ${result.expired} pending payments`);
    }
  }

  // ── Payment Reminders (every minute) ───────────────────────────────────────

  @Cron('* * * * *')
  async sendPaymentReminders() {
    const result = await this.ordersService.sendPaymentReminders();
    if (result.twoMin > 0) {
      this.logger.log(`Payment reminders: ${result.twoMin}@2min`);
    }
  }

  // ── Auto-Shift Overdue Auctions ────────────────────────────────────────────
  // Runs every minute
  // If a SCHEDULED auction is past its startTime → shift to next 15-min slot
  // Also shift all subsequent SCHEDULED auctions by same delay
  // If already past originalStartTime + 45min → cancel

  @Cron('* * * * *')
  async autoCancelOverdueAuctions() {
    const now = new Date();
    const MAX_DELAY_MS = 45 * 60 * 1000;
    const INTERVAL_MS = 15 * 60 * 1000;

    const overdue = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.SCHEDULED,
        startTime: { lt: now },
      },
      orderBy: { startTime: 'asc' },
    });

    for (const auction of overdue) {
      // Use originalStartTime as the baseline — never the shifted time
      const baseTime = auction.originalStartTime
        ? new Date(auction.originalStartTime)
        : new Date(auction.startTime);

      const overdueMs = now.getTime() - baseTime.getTime();

      // Past 45min from ORIGINAL scheduled time → cancel
      if (overdueMs >= MAX_DELAY_MS) {
        this.logger.log(
          `Cancelling auction "${auction.title}" — past 45min from original start time`,
        );
        await this.prisma.auction.update({
          where: { id: auction.id },
          data: { status: AuctionStatus.CANCELLED },
        });
        continue;
      }

      // Snap to next 15-min boundary
      const newStartTime = new Date(
        Math.ceil(now.getTime() / INTERVAL_MS) * INTERVAL_MS,
      );
      newStartTime.setSeconds(0, 0);

      const scheduledTime = new Date(auction.startTime);

      // No change needed
      if (newStartTime.getTime() === scheduledTime.getTime()) continue;

      const shiftMs =
        Math.round((newStartTime.getTime() - scheduledTime.getTime()) / 60000) *
        60000;

      this.logger.log(
        `Shifting auction "${auction.title}" by ${Math.round(shiftMs / 60000)}min → ${newStartTime.toISOString()}`,
      );

      // Shift this auction — record originalStartTime only on first shift
      await this.prisma.auction.update({
        where: { id: auction.id },
        data: {
          startTime: newStartTime,
          ...(!auction.originalStartTime && {
            originalStartTime: scheduledTime,
          }),
        },
      });

      // Cascade shift to all subsequent SCHEDULED auctions for this seller
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
