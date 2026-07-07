import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':orderId/initiate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  initiatePayment(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.initiatePayment(user.id, orderId);
  }

  @Get(':orderId/status')
  @UseGuards(JwtAuthGuard)
  getPaymentStatus(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.getPaymentStatus(user.id, orderId);
  }

  // Separate bucket for the PayMongo webhook: 20 requests / 60s per source IP.
  @Post('webhook/paymongo')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Req() req: Request,
    @Headers('paymongo-signature') signature: string,
  ) {
    // Use raw body if available (requires rawBody middleware), fallback to re-serialized body
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ??
      JSON.stringify(req.body);
    return this.paymentsService.handleWebhook(rawBody, signature);
  }
}
