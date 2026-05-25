import { Module } from '@nestjs/common';
import { BiddingGateway } from './bidding.gateway';
import { BiddingService } from './bidding.service';
import { MaxBidsModule } from '../max-bids/max-bids.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [MaxBidsModule, PaymentsModule, OrdersModule],
  providers: [BiddingGateway, BiddingService],
  exports: [BiddingService, BiddingGateway],
})
export class BiddingModule {}
