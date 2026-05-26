import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { AfterShipController } from './aftership.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [OrdersController, AfterShipController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
