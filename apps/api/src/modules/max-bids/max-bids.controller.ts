import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { MaxBidsService } from './max-bids.service';
import { CreateMaxBidDto } from './dto/create-max-bid.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller('max-bids')
export class MaxBidsController {
  constructor(private readonly maxBidsService: MaxBidsService) {}

  @Post()
  upsert(@CurrentUser() user: AuthUser, @Body() dto: CreateMaxBidDto) {
    return this.maxBidsService.upsert(user.id, dto);
  }

  @Get('item/:itemId/me')
  getMyMaxBid(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.maxBidsService.getForUser(itemId, user.id);
  }
}
