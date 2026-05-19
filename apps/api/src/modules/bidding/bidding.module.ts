import { Module } from '@nestjs/common';
import { BiddingGateway } from './bidding.gateway';
import { BiddingService } from './bidding.service';
import { MaxBidsModule } from '../max-bids/max-bids.module';

@Module({
  imports: [MaxBidsModule],
  providers: [BiddingGateway, BiddingService],
  exports: [BiddingService, BiddingGateway],
})
export class BiddingModule {}
