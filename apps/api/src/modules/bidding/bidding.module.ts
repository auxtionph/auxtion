import { Module } from '@nestjs/common';
import { BiddingGateway } from './bidding.gateway';
import { BiddingService } from './bidding.service';

@Module({
  providers: [BiddingGateway, BiddingService],
  exports: [BiddingService],
})
export class BiddingModule {}
