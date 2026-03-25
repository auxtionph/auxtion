import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { OffersService } from '../offers/offers.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly offersService: OffersService,
  ) {}

  // ── Auto-Confirm Deliveries ────────────────────────────────────────────────
  // Runs every hour
  // Finds SHIPPED orders where autoConfirmAt has passed
  // Updates status to DELIVERED and starts payout timer

  @Cron(CronExpression.EVERY_HOUR)
  async autoConfirmDeliveries() {
    this.logger.log('Running auto-confirm deliveries job...');
    const result = await this.ordersService.autoConfirmDeliveries();
    this.logger.log(`Auto-confirmed ${result.confirmed} deliveries`);
  }

  // ── Auto-Release Payouts ───────────────────────────────────────────────────
  // Runs every hour
  // Finds DELIVERED orders where payoutReleaseAt has passed
  // Releases payout to seller and increments their totalSales

  @Cron(CronExpression.EVERY_HOUR)
  async autoReleasePayouts() {
    this.logger.log('Running auto-release payouts job...');
    const result = await this.ordersService.autoReleasePayouts();
    this.logger.log(`Released ${result.released} payouts`);
  }

  // ── Expire Offers ──────────────────────────────────────────────────────────
  // Runs every hour
  // Finds PENDING offers where expiresAt has passed
  // Updates status to EXPIRED

  @Cron(CronExpression.EVERY_HOUR)
  async expireOffers() {
    this.logger.log('Running expire offers job...');
    const result = await this.offersService.expireOffers();
    this.logger.log(`Expired ${result.expired} offers`);
  }
}
