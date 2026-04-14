import { apiClient } from './client';

export interface Offer {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  createdAt: string;
}

export const offersApi = {
  create: async (itemId: string, amount: number): Promise<Offer> => {
    const response = await apiClient.post('/offers', { itemId, amount });
    return response.data.data as Offer;
  },
  getMyOffers: async (): Promise<Offer[]> => {
    const response = await apiClient.get('/offers/my-offers');
    return response.data.data as Offer[];
  },
  cancel: async (id: string): Promise<void> => {
    await apiClient.patch(`/offers/${id}/cancel`);
  },
};
