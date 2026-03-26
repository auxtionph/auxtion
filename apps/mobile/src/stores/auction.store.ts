import { create } from 'zustand';
import { AuctionFeedItem } from '../services/api/auctions.api';

interface AuctionState {
  feed: AuctionFeedItem[];
  isLoading: boolean;
  error: string | null;
  setFeed: (feed: AuctionFeedItem[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuctionStore = create<AuctionState>((set) => ({
  feed: [],
  isLoading: false,
  error: null,
  setFeed: (feed) => set({ feed }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));