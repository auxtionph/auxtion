import { apiClient } from './client';

export const auctionsApi = {
  getFeed: async () => {
    const response = await apiClient.get('/auctions/feed');
    return response.data.data as AuctionFeedItem[];
  },

  getById: async (id: string) => {
    const response = await apiClient.get(`/auctions/${id}`);
    return response.data.data as AuctionDetail;
  },
};

export interface AuctionFeedItem {
  id: string;
  title: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  startTime: string;
  streamUrl?: string;
  seller: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    sellerTier: string;
  };
  shopItems: {
    id: string;
    title: string;
    photos: string[];
    price: number;
    type: string;
    status: string;
    queueOrder: number;
  }[];
}

export interface AuctionDetail extends AuctionFeedItem {
  bids: {
    id: string;
    amount: number;
    placedAt: string;
    bidder: {
      id: string;
      displayName: string;
      avatarUrl?: string;
    };
  }[];
}