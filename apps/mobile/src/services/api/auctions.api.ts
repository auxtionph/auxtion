import { apiClient } from './client';
import { ShopItemPhoto } from './shop-items.api';

export interface SellerAuction {
  id: string;
  title: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  startTime: string;
  coverImageUrl?: string | null;
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

  create: async (data: { title: string; startTime: string; coverImageUrl?: string }) => {
    const response = await apiClient.post('/auctions', data);
    return response.data.data as AuctionDetail;
  },

  getSellerAuctions: async (sellerId: string) => {
    const response = await apiClient.get(`/auctions/seller/${sellerId}`);
    return response.data.data as SellerAuction[];
    
  },
  
  getScheduledSlots: async (sellerId: string, date: string) => {
    const response = await apiClient.get(
      `/auctions/seller/${sellerId}/scheduled-slots?date=${date}`
    );
    return response.data.data as { startTime: string; hour: number; minute: number; title: string }[];
  },

  cancelAuction: async (id: string) => {
    const response = await apiClient.patch(`/auctions/${id}/cancel`);
    return response.data.data;
  },

  getActive: async (): Promise<{
    id: string;
    title: string;
    streamUrl: string;
    coverImageUrl: string | null;
    startTime: string;
    shopItems: { id: string; title: string; status: string }[];
  } | null> => {
    try {
      const response = await apiClient.get('/auctions/active');
      return response.data.data ?? null;
    } catch {
      return null;
    }
  },
};

export interface AuctionFeedItem {
  id: string;
  title: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  startTime: string;
  streamUrl?: string;
  coverImageUrl?: string | null;
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
    description?: string;
    photos: ShopItemPhoto[];
    price: number;
    type: string;
    status: string;
    queueOrder: number;
    minimumOffer: number;
    mode: 'auction' | 'chat';
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