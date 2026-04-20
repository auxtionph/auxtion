import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { usePathname } from 'expo-router';
import { auctionsApi } from '../services/api/auctions.api';
import { useRejoinStore } from '../stores/rejoin.store';
import { useAuthStore } from '../stores/auth.store';

export const useRejoinCheck = () => {
  const { user } = useAuthStore();
  const { setActiveAuction } = useRejoinStore();
  const appState = useRef(AppState.currentState);
  const pathname = usePathname();

  const checkActiveAuction = async () => {
    if (!user || user.role !== 'SELLER') return;
    if (pathname.includes('/live')) return; // already in live room — skip
    const auction = await auctionsApi.getActive();
    setActiveAuction(auction);
  };

  useEffect(() => {
    void checkActiveAuction();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        void checkActiveAuction();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [user, pathname]); // ← add pathname to deps so guard updates with navigation
};