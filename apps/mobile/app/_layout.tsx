import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/stores/auth.store';
import { apiClient } from '../src/services/api/client';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

LogBox.ignoreLogs([
  'Invalid prop `style` supplied to `React.Fragment`',
  'setupPIP',
]);

export default function RootLayout() {
  const { setAuth, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    void restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) { setLoading(false); return; }
      const response = await apiClient.get('/users/me');
      const storedRefresh = (await SecureStore.getItemAsync('refreshToken')) ?? '';
      await setAuth(response.data.data as Parameters<typeof setAuth>[0], token, storedRefresh);
    } catch {
      await clearAuth();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="auction/[id]" />
      </Stack>
    </SafeAreaProvider>
  );
}