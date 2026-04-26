---
name: paymongo
description: "Use this skill whenever implementing PayMongo payments in Auxtion. Covers GCash, card payments, webhook handling, and the order flow. Read before building any payment feature."
---

# PayMongo — Auxtion Payment Integration

## Overview

PayMongo is a Filipino payment gateway. Auxtion uses it for:
- Buy Now purchases
- Offer acceptance settlements
- (Future) auction winner payments

## Supported Methods (Philippines)

| Method | Type | Notes |
|---|---|---|
| GCash | E-wallet | Most common in PH |
| Maya | E-wallet | Formerly PayMaya |
| Card | Credit/Debit | Visa, Mastercard |
| GrabPay | E-wallet | |

---

## Setup

### Install

```bash
cd apps/api
npm install paymongo  # or use fetch directly
```

### Env vars (Railway + local)

```
PAYMONGO_SECRET_KEY=sk_live_xxxx     # or sk_test_xxxx for sandbox
PAYMONGO_PUBLIC_KEY=pk_live_xxxx
PAYMONGO_WEBHOOK_SECRET=whsk_xxxx   # from PayMongo dashboard
```

### Base URL

```
https://api.paymongo.com/v1
```

Always use `Authorization: Basic ${base64(SECRET_KEY:)}` — note the colon after the key, no password.

---

## Core Concepts

### Payment Intent flow (cards)

```
Create PaymentIntent
  → Attach PaymentMethod
  → Confirm
  → Webhook: payment_intent.succeeded
```

### Source flow (GCash, Maya, GrabPay)

```
Create Source (type: gcash/paymaya/grab_pay)
  → Redirect user to source.attributes.redirect.checkout_url
  → User completes payment on GCash/Maya
  → Redirect back to app
  → Webhook: source.chargeable
  → Create Payment using source
  → Webhook: payment.paid
```

---

## Implementation

### PayMongo service

```typescript
// apps/api/src/modules/payments/paymongo.service.ts
import { Injectable } from '@nestjs/common';

const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

@Injectable()
export class PaymongoService {
  private readonly authHeader: string;

  constructor() {
    const key = process.env.PAYMONGO_SECRET_KEY!;
    this.authHeader = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
  }

  private async request(method: string, path: string, body?: object) {
    const res = await fetch(`${PAYMONGO_BASE}${path}`, {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(JSON.stringify(err));
    }
    return res.json();
  }

  // Create GCash source
  async createGCashSource(amountInCentavos: number, description: string, returnUrl: string) {
    return this.request('POST', '/sources', {
      data: {
        attributes: {
          amount: amountInCentavos,
          currency: 'PHP',
          type: 'gcash',
          description,
          redirect: {
            success: returnUrl,
            failed: returnUrl,
          },
        },
      },
    });
  }

  // Create payment from chargeable source
  async createPayment(sourceId: string, amountInCentavos: number, description: string) {
    return this.request('POST', '/payments', {
      data: {
        attributes: {
          amount: amountInCentavos,
          currency: 'PHP',
          description,
          source: {
            id: sourceId,
            type: 'source',
          },
        },
      },
    });
  }

  // Retrieve payment intent
  async getPaymentIntent(id: string) {
    return this.request('GET', `/payment_intents/${id}`);
  }
}
```

### Webhook handler

```typescript
// apps/api/src/modules/payments/payments.controller.ts
import { Controller, Post, Headers, Body, RawBodyRequest, Req } from '@nestjs/common';
import { createHmac } from 'crypto';

@Controller('webhooks/paymongo')
export class PaymentsController {
  @Post()
  async handleWebhook(
    @Headers('paymongo-signature') signature: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Verify webhook signature
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET!;
    const rawBody = req.rawBody?.toString() ?? '';

    const [, timestamp, , testSignature] = signature.split(',').map(s => s.split('='));
    const toSign = `${timestamp}.${rawBody}`;
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(toSign)
      .digest('hex');

    if (expectedSignature !== testSignature) {
      throw new Error('Invalid webhook signature');
    }

    const event = body.data.attributes.type;
    const data = body.data.attributes.data;

    switch (event) {
      case 'source.chargeable':
        await this.handleSourceChargeable(data);
        break;
      case 'payment.paid':
        await this.handlePaymentPaid(data);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(data);
        break;
    }

    return { received: true };
  }

  private async handleSourceChargeable(source: any) {
    // Source is chargeable — create payment immediately
    // Look up order by source.id, create payment
  }

  private async handlePaymentPaid(payment: any) {
    // Payment succeeded — fulfill order
    // Update order status, notify buyer/seller
  }

  private async handlePaymentFailed(payment: any) {
    // Payment failed — release item back to available
  }
}
```

---

## Order Model (Prisma)

```prisma
model Order {
  id          String      @id @default(cuid())
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  buyerId     String
  buyer       User        @relation("BuyerOrders", fields: [buyerId], references: [id])

  sellerId    String
  seller      User        @relation("SellerOrders", fields: [sellerId], references: [id])

  itemId      String
  item        ShopItem    @relation(fields: [itemId], references: [id])

  auctionId   String?
  auction     Auction?    @relation(fields: [auctionId], references: [id])

  amount      Int         // centavos
  status      OrderStatus @default(PENDING)

  // PayMongo
  paymentIntentId  String?
  sourceId         String?
  paymentId        String?

  type        OrderType   // AUCTION_WIN | BUY_NOW | OFFER_ACCEPTED
}

enum OrderStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
  CANCELLED
}

enum OrderType {
  AUCTION_WIN
  BUY_NOW
  OFFER_ACCEPTED
}
```

---

## Deep Link Setup (for GCash redirect back)

```typescript
// Redirect URL for GCash return
const returnUrl = `auxtion://payment-complete?orderId=${orderId}`;

// In app.json
{
  "expo": {
    "scheme": "auxtion"
  }
}

// Handle deep link in app
import * as Linking from 'expo-linking';
const url = Linking.useURL();
// Parse orderId from url, check payment status
```

---

## Sandbox Testing

Use test credentials from PayMongo dashboard.

GCash test: just tap "Authorize" on the redirect page — no real GCash needed.

Test card: `4343434343434345` / any future date / any CVV.

---

## Checklist

- [ ] Create Order model + migration
- [ ] Create PaymongoService
- [ ] Create OrdersModule (service + controller)
- [ ] Add webhook endpoint (needs raw body — configure in main.ts)
- [ ] Setup deep link scheme in app.json
- [ ] Handle GCash redirect in React Native
- [ ] Test with sandbox credentials
- [ ] Add webhook URL to PayMongo dashboard
- [ ] Switch to live keys for production