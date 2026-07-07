import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BiddingGateway } from './bidding.gateway';
import { BiddingService } from './bidding.service';
import { MaxBidsModule } from '../max-bids/max-bids.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamingModule } from '../streaming/streaming.module';

@Module({
  imports: [
    JwtModule.register({}),
    MaxBidsModule,
    PaymentsModule,
    OrdersModule,
    NotificationsModule,
    StreamingModule,
  ],
  providers: [BiddingGateway, BiddingService],
  exports: [BiddingGateway],
})
export class BiddingModule {}
