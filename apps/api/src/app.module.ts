import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SellerApplicationModule } from './modules/seller-application/seller-application.module';
import { ShopItemsModule } from './modules/shop-items/shop-items.module';
import { AuctionsModule } from './modules/auctions/auctions.module';
import { BiddingModule } from './modules/bidding/bidding.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    SellerApplicationModule,
    ShopItemsModule,
    AuctionsModule,
    BiddingModule,
  ],
})
export class AppModule {}
