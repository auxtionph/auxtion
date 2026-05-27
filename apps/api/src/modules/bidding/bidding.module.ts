import { Module } from '@nestjs/common';
import { BiddingGateway } from './bidding.gateway';
import { BiddingService } from './bidding.service';
import { MaxBidsModule } from '../max-bids/max-bids.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MaxBidsModule, PaymentsModule, OrdersModule, NotificationsModule],
  providers: [BiddingGateway, BiddingService],
  exports: [BiddingGateway],
})
export class BiddingModule {}
