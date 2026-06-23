import { Module } from '@nestjs/common';
import { SellerApplicationService } from './seller-application.service';
import { SellerApplicationController } from './seller-application.controller';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [SellerApplicationController],
  providers: [SellerApplicationService],
  exports: [SellerApplicationService],
})
export class SellerApplicationModule {}
