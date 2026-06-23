import { Module } from '@nestjs/common';
import { ShopItemsService } from './shop-items.service';
import { ShopItemsController } from './shop-items.controller';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [ShopItemsController],
  providers: [ShopItemsService],
  exports: [ShopItemsService],
})
export class ShopItemsModule {}
