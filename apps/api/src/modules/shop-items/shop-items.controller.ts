import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopItemsService } from './shop-items.service';
import { CreateShopItemDto } from './dto/create-shop-item.dto';
import { UpdateShopItemDto } from './dto/update-shop-item.dto';
import { ReorderQueueDto } from './dto/reorder-queue.dto';
import { ConvertToAuctionDto } from './dto/convert-to-auction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShopItemType, UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('shop-items')
@UseGuards(JwtAuthGuard)
export class ShopItemsController {
  constructor(private readonly shopItemsService: ShopItemsService) {}

  // ── Static routes first (must come before :id routes) ─────────────────────

  // Generate signed Cloudinary upload params — mobile uploads directly to Cloudinary
  @Get('upload-signature')
  getUploadSignature(@CurrentUser() user: AuthUser) {
    return this.shopItemsService.getUploadSignature(user.id);
  }

  // Seller reorders auction queue
  @Patch('queue/reorder')
  reorderQueue(@CurrentUser() user: AuthUser, @Body() dto: ReorderQueueDto) {
    return this.shopItemsService.reorderQueue(user.id, dto);
  }

  // Get a seller's shop — public access
  @Get('seller/:sellerId')
  getSellerShop(
    @Param('sellerId') sellerId: string,
    @Query('type') type?: ShopItemType,
  ) {
    return this.shopItemsService.getSellerShop(sellerId, type);
  }

  // ── Item creation ──────────────────────────────────────────────────────────

  @Post()
  createItem(@CurrentUser() user: AuthUser, @Body() dto: CreateShopItemDto) {
    return this.shopItemsService.createItem(user.id, dto);
  }

  // ── :id routes last ────────────────────────────────────────────────────────

  @Get(':id')
  getItemById(@Param('id') id: string) {
    return this.shopItemsService.getItemById(id);
  }

  @Patch(':id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShopItemDto,
  ) {
    return this.shopItemsService.updateItem(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shopItemsService.deleteItem(user.id, id);
  }

  @Patch(':id/reset')
  @HttpCode(HttpStatus.OK)
  async resetItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.shopItemsService.resetItem(user.id, id);
  }

  @Patch(':id/convert-to-auction')
  @HttpCode(HttpStatus.OK)
  convertToAuction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertToAuctionDto,
  ) {
    return this.shopItemsService.convertToAuction(user.id, id, dto.startingPrice);
  }

  @Post(':id/notify')
  @HttpCode(HttpStatus.OK)
  toggleNotification(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shopItemsService.toggleNotification(user.id, id);
  }
}
