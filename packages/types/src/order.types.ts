export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export type PayoutStatus = 'HELD' | 'RELEASED' | 'FROZEN';

export type CancelReason =
  | 'SELLER_MANUAL'
  | 'STREAM_ENDED'
  | 'PAYMENT_TIMEOUT';

export type Courier =
  | 'JT_EXPRESS'
  | 'LBC'
  | 'NINJA_VAN'
  | 'FLASH_EXPRESS'
  | 'GRAB_EXPRESS'
  | 'OTHER';

export interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  itemId: string;
  auctionId?: string;
  amount: number;           // centavos
  status: OrderStatus;
  courier?: Courier;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  autoConfirmAt?: Date;     // shippedAt + 5 days
  payoutStatus: PayoutStatus;
  payoutReleaseAt?: Date;
  payoutReleasedAt?: Date;
  cancelReason?: CancelReason;
  createdAt: Date;
  updatedAt: Date;
}