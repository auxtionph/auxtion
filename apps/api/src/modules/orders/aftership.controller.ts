import { Controller, Post, Body, Logger } from '@nestjs/common';
import { OrdersService } from './orders.service';

interface AfterShipWebhookBody {
  msg?: {
    tag?: string;
    tracking_number?: string;
    custom_fields?: { orderId?: string };
  };
}

@Controller('aftership')
export class AfterShipController {
  private readonly logger = new Logger(AfterShipController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post('webhook')
  async handleWebhook(@Body() body: AfterShipWebhookBody) {
    const tag = body?.msg?.tag;
    const orderId = body?.msg?.custom_fields?.orderId;
    const trackingNumber = body?.msg?.tracking_number;

    this.logger.log(
      `AfterShip webhook: tag=${tag} tracking=${trackingNumber} orderId=${orderId}`,
    );

    if (!orderId) {
      this.logger.warn('AfterShip webhook missing orderId in custom_fields');
      return { received: true };
    }

    if (tag === 'Delivered') {
      await this.ordersService.markAsDelivered(orderId);
    }

    return { received: true };
  }
}
