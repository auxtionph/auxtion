import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('auctions')
@UseGuards(JwtAuthGuard)
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  // Public feed — live and upcoming auctions
  @Get('feed')
  getFeed() {
    return this.auctionsService.getFeed();
  }

  // Get single auction
  @Get(':id')
  getAuctionById(@Param('id') id: string) {
    return this.auctionsService.getAuctionById(id);
  }

  // Get seller's auctions
  @Get('seller/:sellerId')
  getSellerAuctions(@Param('sellerId') sellerId: string) {
    return this.auctionsService.getSellerAuctions(sellerId);
  }

  // Seller creates auction
  @Post()
  createAuction(@CurrentUser() user: AuthUser, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.createAuction(user.id, dto);
  }

  // Seller updates auction
  @Patch(':id')
  updateAuction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAuctionDto,
  ) {
    return this.auctionsService.updateAuction(user.id, id, dto);
  }

  // Seller goes live
  @Patch(':id/go-live')
  @HttpCode(HttpStatus.OK)
  goLive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auctionsService.goLive(user.id, id);
  }

  // Seller ends stream
  @Patch(':id/end')
  @HttpCode(HttpStatus.OK)
  endStream(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auctionsService.endStream(user.id, id);
  }

  // Seller adds item to auction queue
  @Post(':id/items/:itemId')
  @HttpCode(HttpStatus.OK)
  addItemToAuction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.auctionsService.addItemToAuction(user.id, id, itemId);
  }

  // Seller cancels auction
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelAuction(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auctionsService.cancelAuction(user.id, id);
  }
}
