export type OfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Offer {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number;      // centavos
  status: OfferStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}