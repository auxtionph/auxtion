import { useState, useEffect } from 'react';
import { apiClient } from '../services/api/client';

interface FollowState {
  following: boolean;
  followerCount: number;
  loading: boolean;
  toggle: () => Promise<void>;
}

export function useSellerFollow(sellerId: string, myId?: string): FollowState {
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sellerId || !myId || sellerId === myId) return;
    void apiClient.get(`/sellers/${sellerId}/follow-status`)
      .then(res => {
        const d = res.data.data as { following: boolean; followerCount: number };
        setFollowing(d.following);
        setFollowerCount(d.followerCount);
      })
      .catch(() => {});
  }, [sellerId, myId]);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await apiClient.post(`/sellers/${sellerId}/follow`);
      const d = res.data.data as { following: boolean };
      setFollowing(d.following);
      setFollowerCount(prev => d.following ? prev + 1 : prev - 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return { following, followerCount, loading, toggle };
}

export function useAuctionFollow(auctionId: string, myId?: string): FollowState {
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auctionId || !myId) return;
    void apiClient.get(`/auctions/${auctionId}/follow-status`)
      .then(res => {
        const d = res.data.data as { following: boolean; followerCount: number };
        setFollowing(d.following);
        setFollowerCount(d.followerCount);
      })
      .catch(() => {});
  }, [auctionId, myId]);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await apiClient.post(`/auctions/${auctionId}/follow`);
      const d = res.data.data as { following: boolean };
      setFollowing(d.following);
      setFollowerCount(prev => d.following ? prev + 1 : prev - 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return { following, followerCount, loading, toggle };
}