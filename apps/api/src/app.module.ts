import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, AuthModule],
})
export class AppModule {}
