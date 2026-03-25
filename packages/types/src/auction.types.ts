export type AuctionStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'ENDED'
  | 'CANCELLED';

export interface Auction {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  status: AuctionStatus;
  startTime: Date;
  endTime?: Date;
  streamUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}