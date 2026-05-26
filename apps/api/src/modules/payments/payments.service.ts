import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  // ── Create Order + Payment record (PayMongo path) ─────────────────────────
  // Called from bidding.gateway.ts and offers.service.ts on win/claim/accept.
  // Uses $transaction so item SOLD + Order + Payment are atomic.

  async createPaymongoOrder(params: {
    buyerId: string;
    sellerId: string;
    itemId: string;
    auctionId?: string;
    amount: number;
    mode: string;
  }) {
    const SERVICE_FEE_BPS = this.configService.get<number>(
      'SERVICE_FEE_BPS',
      0,
    );
    const SELLER_FEE_BPS = this.configService.get<number>('SELLER_FEE_BPS', 0);

    const buyerServiceFee = Math.round(
      (params.amount * SERVICE_FEE_BPS) / 10000,
    );
    const sellerTransactionFee = Math.round(
      (params.amount * SELLER_FEE_BPS) / 10000,
    );
    const sellerPayout = params.amount - sellerTransactionFee;

    // Fetch shipping fee snapshot from item
    const item = await this.prisma.shopItem.findUnique({
      where: { id: params.itemId },
      select: { title: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    const [order] = await this.prisma.$transaction([
      this.prisma.order.create({
        data: {
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          itemId: params.itemId,
          auctionId: params.auctionId,
          amount: params.amount,
          status: OrderStatus.PENDING_PAYMENT,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          paymentMethod: PaymentMethod.GCASH,
          commissionAmount: buyerServiceFee,
          processingFee: 0,
          sellerPayout,
          mode: params.mode,
        },
      }),
      this.prisma.shopItem.update({
        where: { id: params.itemId },
        data: { status: 'SOLD' },
      }),
    ]);

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        userId: params.buyerId,
        amount: params.amount,
        status: PaymentStatus.PENDING,
      },
    });

    return order;
  }

  // ── Initiate PayMongo Payment Link (lazy — called when buyer taps Pay) ────

  async initiatePayment(buyerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        item: { select: { title: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId)
      throw new BadRequestException('Access denied');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (order.payment?.retryCount && order.payment.retryCount >= 3) {
      throw new BadRequestException(
        'Maximum payment attempts reached. Contact support.',
      );
    }

    // Reuse existing link if still valid
    if (order.payment?.checkoutUrl && order.payment.expiresAt) {
      if (order.payment.expiresAt > new Date()) {
        return {
          orderId: order.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          checkoutUrl: order.payment.checkoutUrl,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresAt: order.payment.expiresAt,
          amount: order.amount,
        };
      }
    }

    const secretKey = this.configService.getOrThrow<string>(
      'PAYMONGO_SECRET_KEY',
    );

    // PayMongo Payment Links API
    const response = await fetch('https://api.paymongo.com/v1/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: order.amount,
            currency: 'PHP',
            description: `Auxtion — ${order.item.title}`,
            remarks: `auxtion-order-${order.id}`,
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`PayMongo link creation failed: ${err}`);
      throw new BadRequestException(
        'Failed to create payment link. Try again.',
      );
    }

    const data = (await response.json()) as {
      data: {
        id: string;
        attributes: {
          checkout_url: string;
          created_at: number;
        };
      };
    };

    const checkoutUrl = data.data.attributes.checkout_url;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.prisma.payment.update({
      where: { orderId },
      data: {
        paymongoRef: data.data.id,
        checkoutUrl,
        expiresAt,
        retryCount: { increment: order.payment?.retryCount ? 1 : 0 },
      },
    });

    return { orderId: order.id, checkoutUrl, expiresAt, amount: order.amount };
  }

  // ── PayMongo Webhook Handler ───────────────────────────────────────────────
  // Signature format: "t=<timestamp>,te=<test_sig>,li=<live_sig>"
  // We verify against both test and live keys for sandbox compatibility.

  async handleWebhook(rawBody: string, signatureHeader: string) {
    const webhookSecret = this.configService.getOrThrow<string>(
      'PAYMONGO_WEBHOOK_SECRET',
    );

    if (!this.verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
      this.logger.warn('Webhook signature verification failed');
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const eventId = payload?.data?.id as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const eventType = payload?.data?.attributes?.type as string | undefined;

    if (!eventId || !eventType) {
      throw new BadRequestException('Malformed webhook payload');
    }

    // ── Idempotency — ignore duplicate webhook deliveries ──────────────────
    const existing = await this.prisma.payment.findFirst({
      where: { webhookEventId: eventId },
    });
    if (existing) {
      this.logger.log(`Duplicate webhook ignored: ${eventId}`);
      return { received: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const paymongoRef = payload?.data?.attributes?.data?.id as
      | string
      | undefined;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const remarks = payload?.data?.attributes?.data?.attributes?.remarks as
      | string
      | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const linkRemarks = payload?.data?.attributes?.remarks as
      | string
      | undefined;

    let orderId: string | undefined;
    if (remarks?.startsWith('auxtion-order-')) {
      orderId = remarks.replace('auxtion-order-', '');
    } else if (linkRemarks?.startsWith('auxtion-order-')) {
      orderId = linkRemarks.replace('auxtion-order-', '');
    }

    if (!orderId) {
      this.logger.warn(`Webhook ${eventId} has no orderId in remarks`);
      return { received: true };
    }

    if (eventType === 'payment.paid' || eventType === 'link.payment.paid') {
      await this.markOrderAsPaid(orderId, paymongoRef ?? eventId, eventId);
    }

    if (eventType === 'payment.failed') {
      await this.markPaymentFailed(orderId, eventId);
    }

    return { received: true };
  }

  // ── Mark Order as Paid (atomic) ────────────────────────────────────────────

  private async markOrderAsPaid(
    orderId: string,
    paymongoRef: string,
    webhookEventId: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      }),
      this.prisma.payment.update({
        where: { orderId },
        data: {
          status: PaymentStatus.PAID,
          paymongoRef,
          webhookEventId,
          paidAt: new Date(),
        },
      }),
    ]);
    this.logger.log(
      `Order ${orderId} marked PAID via webhook ${webhookEventId}`,
    );
  }

  // ── Mark Payment as Failed ─────────────────────────────────────────────────

  private async markPaymentFailed(orderId: string, webhookEventId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });
    if (!payment) return;

    const newRetryCount = payment.retryCount + 1;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: {
          status: PaymentStatus.FAILED,
          failedAt: new Date(),
          retryCount: newRetryCount,
          webhookEventId,
        },
      }),
      // Cancel order if max retries exceeded
      ...(newRetryCount >= 3
        ? [
            this.prisma.order.update({
              where: { id: orderId },
              data: {
                status: OrderStatus.CANCELLED,
                cancelReason: 'PAYMENT_TIMEOUT',
              },
            }),
          ]
        : []),
    ]);
  }

  // ── PayMongo Webhook Signature Verification ────────────────────────────────
  // Header format: "t=<timestamp>,te=<test_sig>,li=<live_sig>"

  private verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string,
  ): boolean {
    try {
      const parts = Object.fromEntries(
        signatureHeader.split(',').map((p) => p.split('=') as [string, string]),
      );
      const timestamp = parts['t'];
      const testSig = parts['te'];
      const liveSig = parts['li'];

      if (!timestamp) return false;

      const message = `${timestamp}.${rawBody}`;
      const hmac = createHmac('sha256', secret);
      hmac.update(message);
      const digest = hmac.digest('hex');

      const digestBuf = Buffer.from(digest, 'hex');

      // Check against whichever sig is present (test OR live)
      for (const sig of [testSig, liveSig].filter(Boolean)) {
        try {
          const sigBuf = Buffer.from(sig, 'hex');
          if (
            digestBuf.length === sigBuf.length &&
            timingSafeEqual(digestBuf, sigBuf)
          )
            return true;
        } catch {
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  // ── Get Payment Status ─────────────────────────────────────────────────────

  async getPaymentStatus(buyerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId)
      throw new BadRequestException('Access denied');

    return {
      orderId: order.id,
      orderStatus: order.status,
      payment: order.payment,
    };
  }
}
