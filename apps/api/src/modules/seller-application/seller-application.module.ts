import { Module } from '@nestjs/common';
import { SellerApplicationService } from './seller-application.service';
import { SellerApplicationController } from './seller-application.controller';

@Module({
  controllers: [SellerApplicationController],
  providers: [SellerApplicationService],
  exports: [SellerApplicationService],
})
export class SellerApplicationModule {}
