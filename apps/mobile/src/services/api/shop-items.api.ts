import { apiClient } from './client';

export interface ShopItemPhoto {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
}

export interface ShopItem {
  id: string;
  sellerId: string;
  auctionId: string | null;
  title: string;
  description: string;
  photos: ShopItemPhoto[];
  price: number;
  minimumOffer: number;
  type: 'AUCTION' | 'BUY_NOW' | 'GIVEAWAY';
  status: 'AVAILABLE' | 'QUEUED' | 'LIVE' | 'LIVE_BUYNOW' | 'SOLD' | 'CANCELLED';
  queueOrder: number | null;
  originalPrice: number;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShopItemPayload {
  title: string;
  description?: string;
  photos?: ShopItemPhoto[];
  price: number;
  type?: 'AUCTION' | 'BUY_NOW' | 'GIVEAWAY';
  auctionId?: string;
  queueOrder?: number;
}

export interface UpdateShopItemPayload {
  title?: string;
  description?: string;
  photos?: ShopItemPhoto[];
  price?: number;
  queueOrder?: number;
}

export const shopItemsApi = {
  create: async (payload: CreateShopItemPayload): Promise<ShopItem> => {
    const response = await apiClient.post('/shop-items', payload);
    return response.data.data as ShopItem;
  },

  getSellerShop: async (sellerId: string): Promise<ShopItem[]> => {
    const response = await apiClient.get(`/shop-items/seller/${sellerId}`);
    return response.data.data as ShopItem[];
  },

  getById: async (id: string): Promise<ShopItem> => {
    const response = await apiClient.get(`/shop-items/${id}`);
    return response.data.data as ShopItem;
  },

  update: async (id: string, payload: UpdateShopItemPayload): Promise<ShopItem> => {
    const response = await apiClient.patch(`/shop-items/${id}`, payload);
    return response.data.data as ShopItem;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/shop-items/${id}`);
  },

  reorderQueue: async (itemIds: string[]): Promise<void> => {
    await apiClient.patch('/shop-items/queue/reorder', { itemIds });
  },

  assignToAuction: async (
    itemId: string,
    auctionId: string,
    queueOrder: number,
  ): Promise<ShopItem> => {
    const response = await apiClient.patch(`/shop-items/${itemId}`, {
      auctionId,
      queueOrder,
    });
    return response.data.data as ShopItem;
  },
};