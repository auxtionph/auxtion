import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { BiddingModule } from '../bidding/bidding.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [BiddingModule, PaymentsModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
