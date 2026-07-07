import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://auxtion-production.up.railway.app/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Request: attach access token ──────────────────────────────────
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response: silent token refresh on 401 ────────────────────────
interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

let isRefreshing = false;
let refreshQueue: QueuedRequest[] = [];

const resolveQueue = (token: string) => {
  refreshQueue.forEach(({ resolve }) => resolve(token));
  refreshQueue = [];
};

// On refresh failure, every parked request MUST be settled — otherwise the
// queued promises never resolve/reject and their screens hang on a spinner
// forever (common on app-resume when several 401s fire at once).
const rejectQueue = (err: unknown) => {
  refreshQueue.forEach(({ reject }) => reject(err));
  refreshQueue = [];
};

// Force a re-login without a top-level import cycle (auth.store imports this
// module). By the time this runs, the store module is already loaded.
const forceLogout = async () => {
  try {
    const { useAuthStore } = require('../../stores/auth.store') as {
      useAuthStore: { getState: () => { clearAuth: () => Promise<void> } };
    };
    await useAuthStore.getState().clearAuth();
  } catch {
    // Store not available — tokens are already cleared below.
  }
};

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      // Queue this request until refresh completes (or fails).
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        },
      );

      const newAccessToken: string = data.data.accessToken;
      const newRefreshToken: string = data.data.refreshToken;
      await SecureStore.setItemAsync('refreshToken', newRefreshToken);
      await SecureStore.setItemAsync('accessToken', newAccessToken);

      resolveQueue(newAccessToken);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch {
      // Refresh failed — settle every parked request, clear tokens, and force
      // re-login so the app doesn't keep rendering authed UI that 401s.
      rejectQueue(error);
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      await forceLogout();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);