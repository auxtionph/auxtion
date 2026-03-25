import { Module } from '@nestjs/common';
import { ShopItemsService } from './shop-items.service';
import { ShopItemsController } from './shop-items.controller';

@Module({
  controllers: [ShopItemsController],
  providers: [ShopItemsService],
  exports: [ShopItemsService],
})
export class ShopItemsModule {}
