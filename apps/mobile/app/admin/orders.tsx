import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPHP } from '@auxtion/utils';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';

type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_MANUAL_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

interface AdminOrder {
  id: string;
  amount: number;
  status: OrderStatus;
  payoutStatus: string;
  createdAt: string;
  buyer: { id: string; displayName: string; email: string };
  seller: { id: string; displayName: string; email: string };
  item: { id: string; title: string };
}

const FILTERS: { label: string; value?: OrderStatus }[] = [
  { label: 'All' },
  { label: 'Disputed', value: 'DISPUTED' },
  { label: 'Unpaid', value: 'PENDING_PAYMENT' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING_PAYMENT: '#F59E0B',
  PENDING_MANUAL_PAYMENT: '#F59E0B',
  PAID: '#60A5FA',
  SHIPPED: '#A78BFA',
  DELIVERED: '#10B981',
  COMPLETED: '#10B981',
  CANCELLED: '#6B7280',
  DISPUTED: '#EF4444',
};

const CANCELLABLE: OrderStatus[] = [
  'PENDING_PAYMENT',
  'PENDING_MANUAL_PAYMENT',
  'PAID',
  'SHIPPED',
  'DISPUTED',
];

export default function AdminOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuthStore();

  const [filter, setFilter] = useState<{ label: string; value?: OrderStatus }>(FILTERS[0]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(null);
  const params = useLocalSearchParams<{ filterUserId?: string; filterUserName?: string }>();

  useEffect(() => {
    if (params.filterUserId && params.filterUserName) {
      setUserFilter({ id: params.filterUserId, name: params.filterUserName });
    }
  }, [params.filterUserId, params.filterUserName]);

  const fetchOrders = useCallback(
    async (
      status: OrderStatus | undefined,
      userId: string | undefined,
      pageNum: number,
      append: boolean,
    ) => {
      try {
        const res = await apiClient.get('/admin/orders', {
          params: { status, userId, page: pageNum, limit: 20 },
        });
        const data = res.data.data ?? res.data;
        const items = (data?.items ?? []) as AdminOrder[];
        setOrders(prev => (append ? [...prev, ...items] : items));
        setHasMore(data?.meta?.hasMore ?? false);
        setPage(pageNum);
      } catch {
        if (!append) setOrders([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );
  useEffect(() => {
    setLoading(true);
    void fetchOrders(filter.value, userFilter?.id, 1, false);
  }, [filter, userFilter, fetchOrders]);
  const onEndReached = () => {
    if (hasMore && !loadingMore && !loading) {
      setLoadingMore(true);
      void fetchOrders(filter.value, userFilter?.id, page + 1, true);
    }
  };

  const forceCancel = (order: AdminOrder) => {
    Alert.alert(
      'Force Cancel Order',
      `Cancel order for "${order.item.title}" (${formatPHP(order.amount)})? This returns the item to available and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force Cancel',
          style: 'destructive',
          onPress: async () => {
            setActioningId(order.id);
            try {
              await apiClient.patch(`/admin/orders/${order.id}/force-cancel`, {});
              setOrders(prev =>
                prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELLED' as OrderStatus } : o)),
              );
            } catch (error: unknown) {
              const err = error as { response?: { data?: { message?: string | string[] } } };
              const msg = Array.isArray(err.response?.data?.message)
                ? err.response!.data!.message!.join('\n')
                : err.response?.data?.message ?? 'Failed to cancel order';
              Alert.alert('Error', msg);
            } finally {
              setActioningId(null);
            }
          },
        },
      ],
    );
  };

  if (me?.role !== 'ADMIN') {
    return (
      <View
        className="flex-1 bg-[#0D1117] items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-white text-lg font-semibold mb-2">Not authorized</Text>
        <TouchableOpacity onPress={() => router.back()} className="bg-[#1A56DB] rounded-xl px-6 py-3 mt-4">
          <Text className="text-white font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0D1117]" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-2 pb-3 flex-row items-center gap-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">Orders</Text>
        <View className="flex-1" />
        <TouchableOpacity
          onPress={() => router.push('/admin/user-picker' as any)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-[#1A56DB] text-sm font-semibold">Filter by user</Text>
        </TouchableOpacity>
      </View>

      <View style={{ maxHeight: 44 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.label}
              onPress={() => setFilter(f)}
              className={`rounded-full px-4 py-2 ${
                filter.label === f.label ? 'bg-[#1A56DB]' : 'bg-gray-900 border border-gray-700'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  filter.label === f.label ? 'text-white' : 'text-gray-400'
                }`}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {userFilter && (
        <View className="px-6 pb-2">
          <TouchableOpacity
            onPress={() => setUserFilter(null)}
            className="self-start flex-row items-center bg-[#1A56DB22] border border-[#1A56DB55] rounded-full px-3 py-1.5"
          >
            <Text className="text-[#60A5FA] text-xs font-semibold mr-1">
              {userFilter.name}
            </Text>
            <Text className="text-[#60A5FA] text-xs font-bold">✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">No orders found.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="#1A56DB" style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            const canCancel = CANCELLABLE.includes(item.status);
            return (
              <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-white font-semibold text-base" numberOfLines={1}>
                      {item.item.title}
                    </Text>
                    <Text className="text-gray-500 text-sm mt-0.5">{formatPHP(item.amount)}</Text>
                  </View>
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ backgroundColor: STATUS_COLOR[item.status] + '22' }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: STATUS_COLOR[item.status] }}>
                      {item.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 gap-1">
                  <Text className="text-gray-500 text-xs">
                    Buyer:{' '}
                    <Text
                      className="text-[#60A5FA]"
                      onPress={() => setUserFilter({ id: item.buyer.id, name: item.buyer.displayName })}
                    >
                      {item.buyer.displayName}
                    </Text>
                  </Text>
                  <Text className="text-gray-500 text-xs">
                    Seller:{' '}
                    <Text
                      className="text-[#60A5FA]"
                      onPress={() => setUserFilter({ id: item.seller.id, name: item.seller.displayName })}
                    >
                      {item.seller.displayName}
                    </Text>
                  </Text>
                  <Text className="text-gray-600 text-xs">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                {canCancel && (
                  <TouchableOpacity
                    disabled={busy}
                    onPress={() => forceCancel(item)}
                    className="mt-3 rounded-xl py-2.5 items-center bg-gray-800 border border-red-800/50"
                  >
                    {busy ? (
                      <ActivityIndicator color="#EF4444" />
                    ) : (
                      <Text className="text-red-400 font-semibold text-sm">Force Cancel</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
