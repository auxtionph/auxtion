import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { createHmac } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ── Create Order After Win/Offer Accept ────────────────────────────────────

  async createOrder(
    buyerId: string,
    sellerId: string,
    itemId: string,
    amount: number,
    auctionId?: string,
  ) {
    // Create order
    const order = await this.prisma.order.create({
      data: {
        buyerId,
        sellerId,
        itemId,
        auctionId,
        amount,
        status: OrderStatus.PENDING_PAYMENT,
      },
    });

    // Create payment record
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        userId: buyerId,
        amount,
        status: PaymentStatus.PENDING,
      },
    });

    return order;
  }

  // ── Initiate PayMongo Payment ──────────────────────────────────────────────

  async initiatePayment(buyerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        item: { select: { title: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) {
      throw new BadRequestException('Access denied');
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }

    const secretKey = this.configService.getOrThrow<string>(
      'PAYMONGO_SECRET_KEY',
    );

    // Create PayMongo payment intent
    const response = await fetch(
      'https://api.paymongo.com/v1/payment_intents',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: order.amount,
              payment_method_allowed: ['gcash', 'paymaya', 'card'],
              currency: 'PHP',
              description: `Auxtion — ${order.item.title}`,
              metadata: {
                orderId: order.id,
                buyerId,
              },
            },
          },
        }),
      },
    );

    const data = (await response.json()) as {
      data: { id: string; attributes: { client_key: string } };
    };

    return {
      orderId: order.id,
      paymentIntentId: data.data.id,
      clientKey: data.data.attributes.client_key,
      amount: order.amount,
    };
  }

  // ── Handle PayMongo Webhook ────────────────────────────────────────────────

  async handleWebhook(payload: Record<string, unknown>, signature: string) {
    const webhookSecret = this.configService.getOrThrow<string>(
      'PAYMONGO_WEBHOOK_SECRET',
    );

    // Verify webhook signature
    const isValid = this.verifyWebhookSignature(
      JSON.stringify(payload),
      signature,
      webhookSecret,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = payload as {
      data: {
        attributes: {
          type: string;
          data: {
            attributes: {
              metadata: { orderId: string };
              status: string;
              id: string;
            };
          };
        };
      };
    };

    const eventType = event.data.attributes.type;
    const paymentData = event.data.attributes.data.attributes;
    const { orderId } = paymentData.metadata;

    if (eventType === 'payment.paid') {
      await this.markOrderAsPaid(orderId, paymentData.id);
    }

    if (eventType === 'payment.failed') {
      await this.markPaymentFailed(orderId);
    }

    return { received: true };
  }

  // ── Mark Order as Paid ─────────────────────────────────────────────────────

  private async markOrderAsPaid(orderId: string, paymongoRef: string) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
    });

    await this.prisma.payment.update({
      where: { orderId },
      data: {
        status: PaymentStatus.PAID,
        paymongoRef,
      },
    });
  }

  // ── Mark Payment as Failed ─────────────────────────────────────────────────

  private async markPaymentFailed(orderId: string) {
    await this.prisma.payment.update({
      where: { orderId },
      data: {
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
        retryCount: { increment: 1 },
      },
    });
  }

  // ── Verify Webhook Signature ───────────────────────────────────────────────

  private verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const digest = hmac.digest('hex');
    return digest === signature;
  }

  // ── Get Payment Status ─────────────────────────────────────────────────────

  async getPaymentStatus(buyerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) {
      throw new BadRequestException('Access denied');
    }

    return {
      orderId: order.id,
      orderStatus: order.status,
      payment: order.payment,
    };
  }
}
