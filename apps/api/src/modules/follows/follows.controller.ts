import { Controller, Post, Get, Param, Query, UseGuards } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { parsePagination } from '../../common/utils/pagination';

interface AuthUser {
  id: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post('sellers/:sellerId/follow')
  toggleSellerFollow(
    @CurrentUser() user: AuthUser,
    @Param('sellerId') sellerId: string,
  ) {
    return this.followsService.toggleSellerFollow(user.id, sellerId);
  }

  @Get('sellers/:sellerId/follow-status')
  getSellerFollowStatus(
    @CurrentUser() user: AuthUser,
    @Param('sellerId') sellerId: string,
  ) {
    return this.followsService.getSellerFollowStatus(user.id, sellerId);
  }

  @Post('auctions/:auctionId/follow')
  toggleAuctionFollow(
    @CurrentUser() user: AuthUser,
    @Param('auctionId') auctionId: string,
  ) {
    return this.followsService.toggleAuctionFollow(user.id, auctionId);
  }

  @Get('auctions/:auctionId/follow-status')
  getAuctionFollowStatus(
    @CurrentUser() user: AuthUser,
    @Param('auctionId') auctionId: string,
  ) {
    return this.followsService.getAuctionFollowStatus(user.id, auctionId);
  }

  @Get('sellers/:sellerId/payment-info')
  getSellerPaymentInfo(
    @CurrentUser() user: AuthUser,
    @Param('sellerId') sellerId: string,
  ) {
    return this.followsService.getSellerPaymentInfo(user.id, sellerId);
  }

  @Get('users/me/followers')
  listMyFollowers(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parsePagination(page, limit, { defaultLimit: 50 });
    return this.followsService.listFollowers(user.id, p.page, p.limit);
  }

  @Get('users/me/following')
  listMyFollowing(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parsePagination(page, limit, { defaultLimit: 50 });
    return this.followsService.listFollowing(user.id, p.page, p.limit);
  }
}
