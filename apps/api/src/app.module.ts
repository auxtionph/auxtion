import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
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
import { StreamingModule } from './modules/streaming/streaming.module';
import { MaxBidsModule } from './modules/max-bids/max-bids.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FollowsModule } from './modules/follows/follows.module';
import { ShopModule } from './modules/shop/shop.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Global default: 60 requests / 60s per route per IP. Auth routes and the
    // PayMongo webhook tighten this per-handler with @Throttle overrides.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
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
    StreamingModule,
    MaxBidsModule,
    NotificationsModule,
    FollowsModule,
    ShopModule,
    UploadsModule,
    AdminModule,
  ],
  providers: [
    // Applies the global throttle to all HTTP routes (skips WebSocket events).
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AppModule {}
