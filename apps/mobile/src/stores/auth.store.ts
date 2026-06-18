import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../services/api/client';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  isVerified: boolean;
  avatarUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
    set({ user, accessToken, isAuthenticated: true });
    // Register push token — fire and forget, never block login
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        const { data: token } = await Notifications.getExpoPushTokenAsync();
        await apiClient.post('/users/me/push-token', { token });
      }
    } catch {
      // non-fatal — push notifications degrade gracefully
    }
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));