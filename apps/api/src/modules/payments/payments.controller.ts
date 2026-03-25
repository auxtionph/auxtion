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
} from '@nestjs/common';
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

  // Initiate payment for an order
  @Post(':orderId/initiate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  initiatePayment(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.initiatePayment(user.id, orderId);
  }

  // Get payment status
  @Get(':orderId/status')
  @UseGuards(JwtAuthGuard)
  getPaymentStatus(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.getPaymentStatus(user.id, orderId);
  }

  // PayMongo webhook — no auth, verified by signature
  @Post('webhook/paymongo')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('paymongo-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(payload, signature);
  }
}
