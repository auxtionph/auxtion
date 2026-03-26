import { useEffect, useCallback } from 'react';
import { auctionsApi } from '../services/api/auctions.api';
import { useAuctionStore } from '../stores/auction.store';

export const useAuctionFeed = () => {
  const { feed, isLoading, error, setFeed, setLoading, setError } =
    useAuctionStore();

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auctionsApi.getFeed();
      setFeed(data);
    } catch {
      setError('Failed to load auctions');
    } finally {
      setLoading(false);
    }
  }, [setFeed, setLoading, setError]);

  useEffect(() => {
    void fetchFeed();
  }, [fetchFeed]);

  return { feed, isLoading, error, refetch: fetchFeed };
};