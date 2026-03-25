import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SellerApplicationModule } from './modules/seller-application/seller-application.module';
import { ShopItemsModule } from './modules/shop-items/shop-items.module';
import { AuctionsModule } from './modules/auctions/auctions.module';
import { BiddingModule } from './modules/bidding/bidding.module';
import { OffersModule } from './modules/offers/offers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    SellerApplicationModule,
    ShopItemsModule,
    AuctionsModule,
    BiddingModule,
    OffersModule,
    OrdersModule,
    PaymentsModule,
    SchedulerModule,
  ],
})
export class AppModule {}
