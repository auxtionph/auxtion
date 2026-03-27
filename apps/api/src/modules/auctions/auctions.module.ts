import { Module } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { StreamingModule } from '../streaming/streaming.module';

@Module({
  controllers: [AuctionsController],
  providers: [AuctionsService],
  exports: [AuctionsService],
  imports: [StreamingModule],
})
export class AuctionsModule {}
