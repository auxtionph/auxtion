/* eslint-disable */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShopService } from './shop.service';
import { CreateStorefrontItemDto } from './dto/create-storefront-item.dto';
import { UpdateStorefrontItemDto } from './dto/update-storefront-item.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // ─── Public (any logged-in user) ─────────────────────────────────────────

  @Get('shops/:sellerId')
  getSellerStorefront(
    @Param('sellerId') sellerId: string,
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.shopService.getSellerStorefront(sellerId, {
      category,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  }

  @Get('shops/:sellerId/items')
  getSellerItems(
    @Param('sellerId') sellerId: string,
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.shopService.getSellerItems(sellerId, {
      category,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  }

  @Get('shop-items/:id')
  getStorefrontItem(
    @Param('id') id: string,
    @CurrentUser() user: Record<string, any>,
  ) {
    return this.shopService.getItemDetail(id, user.id as string);
  }

  @Post('shop-items/:id/buy')
  @HttpCode(HttpStatus.CREATED)
  buyStorefrontItem(
    @Param('id') id: string,
    @CurrentUser() user: Record<string, any>,
  ) {
    return this.shopService.buyItem(id, user.id as string);
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('type') type = 'all',
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.shopService.search(q, {
      type,
      category,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  }

  // ─── Seller-only ──────────────────────────────────────────────────────────

  @Post('seller/shop-items')
  @UseGuards(RolesGuard)
  @Roles('SELLER')
  @HttpCode(HttpStatus.CREATED)
  createStorefrontItem(
    @CurrentUser() user: Record<string, any>,
    @Body() dto: CreateStorefrontItemDto,
  ) {
    return this.shopService.createStorefrontItem(user.id as string, dto);
  }

  @Get('seller/shop-items/stats')
  @UseGuards(RolesGuard)
  @Roles('SELLER')
  getMyStats(@CurrentUser() user: Record<string, any>) {
    return this.shopService.getSellerStats(user.id as string);
  }

  @Get('seller/shop-items')
  @UseGuards(RolesGuard)
  @Roles('SELLER')
  getMyStorefrontItems(
    @CurrentUser() user: Record<string, any>,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.shopService.getMyItems(user.id as string, {
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  }

  @Patch('seller/shop-items/:id')
  @UseGuards(RolesGuard)
  @Roles('SELLER')
  updateStorefrontItem(
    @Param('id') id: string,
    @CurrentUser() user: Record<string, any>,
    @Body() dto: UpdateStorefrontItemDto,
  ) {
    return this.shopService.updateStorefrontItem(id, user.id as string, dto);
  }

  @Patch('seller/shop-items/:id/pull-to-live')
  @UseGuards(RolesGuard)
  @Roles('SELLER')
  pullToLive(
    @Param('id') id: string,
    @CurrentUser() user: Record<string, any>,
  ) {
    return this.shopService.pullToLive(id, user.id as string);
  }

  @Delete('seller/shop-items/:id')
  @UseGuards(RolesGuard)
  @Roles('SELLER')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteStorefrontItem(
    @Param('id') id: string,
    @CurrentUser() user: Record<string, any>,
  ) {
    return this.shopService.deleteStorefrontItem(id, user.id as string);
  }
}
