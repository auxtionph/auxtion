import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useAuthStore } from '../src/stores/auth.store';
import { apiClient } from '../src/services/api/client';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

LogBox.ignoreLogs([
  'Invalid prop `style` supplied to `React.Fragment`',
  'setupPIP',
]);

export default function RootLayout() {
  const { setAuth, clearAuth, setLoading, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
  }, []);

  // ── Register push token after login ────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    void registerPushToken();
  }, [user?.id]);

  // ── Handle notification tap → navigate ─────────────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as {
        screen?: string;
        orderId?: string;
        auctionId?: string;
      };
      if (data.screen === 'order' && data.orderId) {
        router.push(`/order/${data.orderId}`);
      } else if (data.screen === 'live' && data.auctionId) {
        router.push(`/auction/${data.auctionId}/live`);
      } else if (data.screen === 'seller-orders') {
        router.push('/seller/orders');
      }
    });
    return () => sub.remove();
  }, []);

  const registerPushToken = async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      await apiClient.post('/users/me/push-token', { token });
    } catch {
      // Non-fatal — app works without push
    }
  };

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
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="auction/[id]" />
        <Stack.Screen 
          name="seller/[id]" 
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }} 
        />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="seller/orders" />
      </Stack>
    </SafeAreaProvider>
  );
}