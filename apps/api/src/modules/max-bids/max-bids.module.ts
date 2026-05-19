import { Module } from '@nestjs/common';
import { MaxBidsService } from './max-bids.service';
import { MaxBidsController } from './max-bids.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MaxBidsController],
  providers: [MaxBidsService],
  exports: [MaxBidsService],
})
export class MaxBidsModule {}
