export interface SocketBidPayload {
  auctionId: string;
  itemId: string;
  bidderId: string;
  amount: number;      // centavos
  timestamp: number;
}

export interface SocketBidUpdate {
  auctionId: string;
  itemId: string;
  currentPrice: number;
  highestBidderId: string;
  highestBidderName: string;
  totalBids: number;
  timeRemaining: number;
}

export interface SocketAuctionEvent {
  auctionId: string;
  event: 'STARTED' | 'ENDED' | 'ITEM_CHANGED' | 'TIME_EXTENDED';
  payload?: Record<string, unknown>;
}

export interface SocketChatMessage {
  auctionId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  message: string;
  timestamp: number;
}