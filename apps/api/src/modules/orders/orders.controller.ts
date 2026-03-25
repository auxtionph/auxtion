import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { ShipOrderDto } from './dto/ship-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('buying')
  getBuyerOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.getBuyerOrders(user.id);
  }

  @Get('selling')
  getSellerOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.getSellerOrders(user.id);
  }

  @Get(':id')
  getOrderById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getOrderById(user.id, id);
  }

  @Patch(':id/ship')
  @HttpCode(HttpStatus.OK)
  markAsShipped(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.ordersService.markAsShipped(user.id, id, dto);
  }

  @Patch(':id/confirm-receipt')
  @HttpCode(HttpStatus.OK)
  confirmReceipt(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.confirmReceipt(user.id, id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.cancelOrder(user.id, id);
  }
}
