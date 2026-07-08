import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { formatPHP } from '@auxtion/utils';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AdminScreen, AdminHeader, Card, Badge, Tab, Mono } from '../../src/theme/AdminUI';
import { A, AdminStatusTone } from '../../src/theme/admin';

type DisputeStatus = 'OPEN' | 'RESOLVED_BUYER' | 'RESOLVED_SELLER';

interface AdminDispute {
  id: string;
  reason: string;
  status: DisputeStatus;
  raisedBy: string;
  createdAt: string;
  order: {
    id: string;
    amount: number;
    status: string;
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    item: { id: string; title: string };
  };
}

const FILTERS: { label: string; value: DisputeStatus }[] = [
  { label: 'Open', value: 'OPEN' },
  { label: 'For Buyer', value: 'RESOLVED_BUYER' },
  { label: 'For Seller', value: 'RESOLVED_SELLER' },
];

const STATUS_TONE: Record<DisputeStatus, AdminStatusTone> = {
  OPEN: 'red',
  RESOLVED_BUYER: 'emerald',
  RESOLVED_SELLER: 'accent',
};

export default function AdminDisputesScreen() {
  const router = useRouter();
  const { user: me } = useAuthStore();
  const [filter, setFilter] = useState(FILTERS[0]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchDisputes = useCallback(
    async (status: DisputeStatus | undefined, pageNum: number, append: boolean) => {
      try {
        const res = await apiClient.get('/admin/disputes', { params: { status, page: pageNum, limit: 20 } });
        const data = res.data.data ?? res.data;
        const items = (data?.items ?? []) as AdminDispute[];
        setDisputes(prev => (append ? [...prev, ...items] : items));
        setHasMore(data?.meta?.hasMore ?? false);
        setPage(pageNum);
      } catch { if (!append) setDisputes([]); }
      finally { setLoading(false); setLoadingMore(false); }
    }, []);

  useEffect(() => { setLoading(true); void fetchDisputes(filter.value, 1, false); }, [filter, fetchDisputes]);
  const onEndReached = () => { if (hasMore && !loadingMore && !loading) { setLoadingMore(true); void fetchDisputes(filter.value, page + 1, true); } };

  const resolve = (dispute: AdminDispute, inFavorOf: 'BUYER' | 'SELLER') => {
    const outcome = inFavorOf === 'SELLER'
      ? 'Order will be COMPLETED and the seller payout RELEASED.'
      : 'Order will be CANCELLED and the payout FROZEN for manual refund review.';
    Alert.alert(`Resolve for ${inFavorOf === 'SELLER' ? 'Seller' : 'Buyer'}`, `${outcome}\n\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: async () => {
        setActioningId(dispute.id);
        try {
          await apiClient.patch(`/admin/disputes/${dispute.id}/resolve`, { inFavorOf });
          setDisputes(prev => prev.filter(d => d.id !== dispute.id));
        } catch (error: unknown) {
          const err = error as { response?: { data?: { message?: string | string[] } } };
          const msg = Array.isArray(err.response?.data?.message) ? err.response!.data!.message!.join('\n') : err.response?.data?.message ?? 'Failed to resolve dispute';
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
      <AdminHeader title="Disputes" onBack={() => router.back()} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: A.space.lg, gap: 8 }}>
        {FILTERS.map(f => (
          <Tab key={f.label} label={f.label} on={filter.label === f.label} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={A.color.accent} />
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: A.space.lg, paddingTop: 12, paddingBottom: 32 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Text style={{ color: A.color.ink3 }}>No disputes here.</Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={A.color.accent} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            const isOpen = item.status === 'OPEN';
            return (
              <View style={{ marginBottom: A.space.sm }}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: A.color.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{item.order.item.title}</Text>
                      <Mono style={{ fontSize: 14, color: A.color.ink2, marginTop: 3 }}>{formatPHP(item.order.amount)}</Mono>
                    </View>
                    <Badge text={item.status.replace(/_/g, ' ')} tone={STATUS_TONE[item.status]} />
                  </View>
                  <View style={{ backgroundColor: A.color.red + '15', borderWidth: 1, borderColor: A.color.red + '30', borderRadius: A.radius.md, padding: 12, marginTop: 12 }}>
                    <Text style={{ color: A.color.ink3, fontSize: 11, marginBottom: 4 }}>Reason</Text>
                    <Text style={{ color: A.color.ink2, fontSize: 13 }}>{item.reason}</Text>
                  </View>
                  <View style={{ marginTop: 12, gap: 5 }}>
                    <Text style={{ color: A.color.ink3, fontSize: 12 }}>Buyer: <Text style={{ color: A.color.ink2 }}>{item.order.buyer.displayName}</Text></Text>
                    <Text style={{ color: A.color.ink3, fontSize: 12 }}>Seller: <Text style={{ color: A.color.ink2 }}>{item.order.seller.displayName}</Text></Text>
                    <Mono style={{ fontSize: 11, color: A.color.ink3 }}>{new Date(item.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</Mono>
                  </View>
                  {isOpen && (
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                      <TouchableOpacity
                        disabled={busy}
                        onPress={() => resolve(item, 'BUYER')}
                        style={{ flex: 1, borderRadius: A.radius.md, paddingVertical: 10, alignItems: 'center', backgroundColor: A.color.raised, borderWidth: 1, borderColor: A.color.emerald + '50' }}
                      >
                        {busy ? <ActivityIndicator color={A.color.emerald} /> : <Text style={{ color: A.color.emerald, fontWeight: '600', fontSize: 13 }}>For Buyer</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={busy}
                        onPress={() => resolve(item, 'SELLER')}
                        style={{ flex: 1, borderRadius: A.radius.md, paddingVertical: 10, alignItems: 'center', backgroundColor: A.color.raised, borderWidth: 1, borderColor: A.color.accent + '50' }}
                      >
                        {busy ? <ActivityIndicator color={A.color.accent} /> : <Text style={{ color: A.color.accentText, fontWeight: '600', fontSize: 13 }}>For Seller</Text>}
                      </TouchableOpacity>
                    </View>
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
