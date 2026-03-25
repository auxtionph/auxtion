export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;        // centavos
  status: PaymentStatus;
  paymongoRef?: string;
  failedAt?: Date;
  cancelledAt?: Date;
  retryCount: number;
  createdAt: Date;
}