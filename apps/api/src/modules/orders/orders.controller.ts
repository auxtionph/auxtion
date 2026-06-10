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

  // ⚠️ Static routes MUST come before :id routes
  @Get('address/default')
  getDefaultAddress(@CurrentUser() user: AuthUser) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.ordersService.getDefaultAddress(user.id);
  }

  @Get('auction/:auctionId/unpaid-summary')
  getUnpaidSummary(
    @CurrentUser() user: AuthUser,
    @Param('auctionId') auctionId: string,
  ) {
    return this.ordersService.getUnpaidSummary(user.id, auctionId);
  }

  @Patch('auction/:auctionId/bulk-cancel-unpaid')
  @HttpCode(HttpStatus.OK)
  bulkCancelAuctionOrders(
    @CurrentUser() user: AuthUser,
    @Param('auctionId') auctionId: string,
  ) {
    return this.ordersService.bulkCancelAuctionOrders(user.id, auctionId);
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

  @Patch(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.markPaid(user.id, id);
  }

  @Patch(':id/payment-reference')
  @HttpCode(HttpStatus.OK)
  submitPaymentReference(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reference?: string; proofUrl?: string },
  ) {
    return this.ordersService.submitPaymentReference(
      user.id,
      id,
      body.reference ?? '',
      body.proofUrl,
    );
  }

  @Patch(':id/shipping-address')
  @HttpCode(HttpStatus.OK)
  updateShippingAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      phone: string;
      line1: string;
      city: string;
      province: string;
      postalCode: string;
    },
  ) {
    return this.ordersService.updateShippingAddress(user.id, id, body);
  }

  @Patch(':id/dispute')
  @HttpCode(HttpStatus.OK)
  disputeOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.ordersService.disputeOrder(user.id, id, body.reason);
  }
}
