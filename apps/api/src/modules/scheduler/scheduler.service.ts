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

  // ── Auto-Cancel Overdue Auctions ───────────────────────────────────────────
  // Runs every minute
  // SCHEDULED auctions past startTime + 45min → CANCELLED
  // Does NOT shift subsequent sets (seller no-showed)

  @Cron('* * * * *')
  async autoCancelOverdueAuctions() {
    const cutoff = new Date(Date.now() - 45 * 60 * 1000);

    const overdue = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.SCHEDULED,
        startTime: { lt: cutoff },
      },
      select: { id: true },
    });

    if (overdue.length === 0) return;

    this.logger.log(`Auto-cancelling ${overdue.length} overdue auctions...`);

    await this.prisma.auction.updateMany({
      where: { id: { in: overdue.map((a) => a.id) } },
      data: { status: AuctionStatus.CANCELLED },
    });

    this.logger.log(`Cancelled ${overdue.length} overdue auctions`);
  }
}
