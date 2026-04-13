import { apiClient } from './client';

export interface SellerAuction {
  id: string;
  title: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  startTime: string;
  shopItems: { id: string; title: string; status: string }[];
}

export const auctionsApi = {
  getFeed: async () => {
    const response = await apiClient.get('/auctions/feed');
    return response.data.data as AuctionFeedItem[];
  },

  getById: async (id: string) => {
    const response = await apiClient.get(`/auctions/${id}`);
    return response.data.data as AuctionDetail;
  },

  goLive: async (id: string) => {
    const response = await apiClient.patch(`/auctions/${id}/go-live`);
    return response.data.data as AuctionDetail;
  },

  end: async (id: string) => {
    const response = await apiClient.patch(`/auctions/${id}/end`);
    return response.data.data as AuctionDetail;
  },

  create: async (data: { title: string; startTime: string }) => {
    const response = await apiClient.post('/auctions', data);
    return response.data.data as AuctionDetail;
  },

  getSellerAuctions: async (sellerId: string) => {
    const response = await apiClient.get(`/auctions/seller/${sellerId}`);
    return response.data.data as SellerAuction[];
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
    totalSales: number;
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