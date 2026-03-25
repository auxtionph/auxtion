export type ShopItemType = 'AUCTION' | 'BUY_NOW' | 'GIVEAWAY';

export type ShopItemStatus =
  | 'AVAILABLE'
  | 'QUEUED'
  | 'LIVE'
  | 'SOLD'
  | 'CANCELLED';

export interface ShopItem {
  id: string;
  sellerId: string;
  auctionId?: string;
  title: string;
  description: string;
  photos: string[];
  price: number;         // centavos
  minimumOffer: number;  // centavos — 70% of price
  type: ShopItemType;
  status: ShopItemStatus;
  queueOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}