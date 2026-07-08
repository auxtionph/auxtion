import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { formatPHP } from '@auxtion/utils';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AdminScreen, AdminHeader, Card, Badge, Tab, FilterChip, Mono } from '../../src/theme/AdminUI';
import { A, AdminStatusTone } from '../../src/theme/admin';

type OrderStatus = 'PENDING_PAYMENT' | 'PENDING_MANUAL_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

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

const STATUS_TONE: Record<OrderStatus, AdminStatusTone> = {
  PENDING_PAYMENT: 'amber',
  PENDING_MANUAL_PAYMENT: 'amber',
  PAID: 'accent',
  SHIPPED: 'violet',
  DELIVERED: 'emerald',
  COMPLETED: 'emerald',
  CANCELLED: 'neutral',
  DISPUTED: 'red',
};

const CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PENDING_MANUAL_PAYMENT', 'PAID', 'SHIPPED', 'DISPUTED'];

export default function AdminOrdersScreen() {
  const router = useRouter();
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
    async (status: OrderStatus | undefined, userId: string | undefined, pageNum: number, append: boolean) => {
      try {
        const res = await apiClient.get('/admin/orders', { params: { status, userId, page: pageNum, limit: 20 } });
        const data = res.data.data ?? res.data;
        const items = (data?.items ?? []) as AdminOrder[];
        setOrders(prev => (append ? [...prev, ...items] : items));
        setHasMore(data?.meta?.hasMore ?? false);
        setPage(pageNum);
      } catch { if (!append) setOrders([]); }
      finally { setLoading(false); setLoadingMore(false); }
    }, []);

  useEffect(() => { setLoading(true); void fetchOrders(filter.value, userFilter?.id, 1, false); }, [filter, userFilter, fetchOrders]);
  const onEndReached = () => { if (hasMore && !loadingMore && !loading) { setLoadingMore(true); void fetchOrders(filter.value, userFilter?.id, page + 1, true); } };

  const forceCancel = (order: AdminOrder) => {
    Alert.alert('Force Cancel Order', `Cancel order for "${order.item.title}" (${formatPHP(order.amount)})? This returns the item to available and cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Force Cancel', style: 'destructive', onPress: async () => {
        setActioningId(order.id);
        try {
          await apiClient.patch(`/admin/orders/${order.id}/force-cancel`, {});
          setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'CANCELLED' as OrderStatus } : o)));
        } catch (error: unknown) {
          const err = error as { response?: { data?: { message?: string | string[] } } };
          const msg = Array.isArray(err.response?.data?.message) ? err.response!.data!.message!.join('\n') : err.response?.data?.message ?? 'Failed to cancel order';
          Alert.alert('Error', msg);
        } finally { setActioningId(null); }
      }},
    ]);
  };

  if (me?.role !== 'ADMIN') {
    return (
      <AdminScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: A.space.lg }}>
          <Text style={{ color: A.color.ink, fontSize: 17, fontWeight: '600', marginBottom: 8 }}>Not authorized</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: A.color.accent, borderRadius: A.radius.md, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen>
      <AdminHeader
        title="Orders"
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={() => router.push('/admin/user-picker' as any)}>
            <Text style={{ color: A.color.accent, fontSize: 13, fontWeight: '600' }}>Filter</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: A.space.lg, gap: 8 }}>
        {FILTERS.map(f => (
          <Tab key={f.label} label={f.label} on={filter.label === f.label} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {userFilter && (
        <View style={{ paddingHorizontal: A.space.lg, paddingTop: A.space.sm }}>
          <FilterChip label={userFilter.name} onClear={() => setUserFilter(null)} />
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={A.color.accent} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: A.space.lg, paddingTop: 12, paddingBottom: 32 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Text style={{ color: A.color.ink3 }}>No orders found.</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={A.color.accent} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            const canCancel = CANCELLABLE.includes(item.status);
            return (
              <View style={{ marginBottom: A.space.sm }}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: A.color.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{item.item.title}</Text>
                      <Mono style={{ fontSize: 14, color: A.color.ink2, marginTop: 3 }}>{formatPHP(item.amount)}</Mono>
                    </View>
                    <Badge text={item.status.replace(/_/g, ' ')} tone={STATUS_TONE[item.status]} />
                  </View>
                  <View style={{ marginTop: 13, gap: 5 }}>
                    <Text style={{ color: A.color.ink3, fontSize: 12 }}>
                      Buyer:{' '}
                      <Text style={{ color: A.color.accentText }} onPress={() => setUserFilter({ id: item.buyer.id, name: item.buyer.displayName })}>
                        {item.buyer.displayName}
                      </Text>
                    </Text>
                    <Text style={{ color: A.color.ink3, fontSize: 12 }}>
                      Seller:{' '}
                      <Text style={{ color: A.color.accentText }} onPress={() => setUserFilter({ id: item.seller.id, name: item.seller.displayName })}>
                        {item.seller.displayName}
                      </Text>
                    </Text>
                    <Mono style={{ fontSize: 11, color: A.color.ink3 }}>
                      {new Date(item.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                    </Mono>
                  </View>
                  {canCancel && (
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => forceCancel(item)}
                      style={{ marginTop: 13, borderRadius: A.radius.md, paddingVertical: 10, alignItems: 'center', backgroundColor: A.color.raised, borderWidth: 1, borderColor: A.color.red + '50' }}
                    >
                      {busy ? <ActivityIndicator color={A.color.red} /> : <Text style={{ color: A.color.red, fontWeight: '600', fontSize: 13 }}>Force cancel</Text>}
                    </TouchableOpacity>
                  )}
                </Card>
              </View>
            );
          }}
        />
      )}
    </AdminScreen>
  );
}
