import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { OrdersModule } from '../orders/orders.module';
import { OffersModule } from '../offers/offers.module';

@Module({
  imports: [OrdersModule, OffersModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
