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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPHP } from '@auxtion/utils';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';

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

const FILTERS: { label: string; value?: DisputeStatus }[] = [
  { label: 'Open', value: 'OPEN' },
  { label: 'For Buyer', value: 'RESOLVED_BUYER' },
  { label: 'For Seller', value: 'RESOLVED_SELLER' },
];

const STATUS_COLOR: Record<DisputeStatus, string> = {
  OPEN: '#EF4444',
  RESOLVED_BUYER: '#10B981',
  RESOLVED_SELLER: '#60A5FA',
};

export default function AdminDisputesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuthStore();

  const [filter, setFilter] = useState<{ label: string; value?: DisputeStatus }>(FILTERS[0]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchDisputes = useCallback(
    async (status: DisputeStatus | undefined, pageNum: number, append: boolean) => {
      try {
        const res = await apiClient.get('/admin/disputes', {
          params: { status, page: pageNum, limit: 20 },
        });
        const data = res.data.data ?? res.data;
        const items = (data?.items ?? []) as AdminDispute[];
        setDisputes(prev => (append ? [...prev, ...items] : items));
        setHasMore(data?.meta?.hasMore ?? false);
        setPage(pageNum);
      } catch {
        if (!append) setDisputes([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    void fetchDisputes(filter.value, 1, false);
  }, [filter, fetchDisputes]);

  const onEndReached = () => {
    if (hasMore && !loadingMore && !loading) {
      setLoadingMore(true);
      void fetchDisputes(filter.value, page + 1, true);
    }
  };

  const resolve = (dispute: AdminDispute, inFavorOf: 'BUYER' | 'SELLER') => {
    const outcome =
      inFavorOf === 'SELLER'
        ? 'Order will be COMPLETED and the seller payout RELEASED.'
        : 'Order will be CANCELLED and the payout FROZEN for manual refund review.';
    Alert.alert(
      `Resolve for ${inFavorOf === 'SELLER' ? 'Seller' : 'Buyer'}`,
      `${outcome}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            setActioningId(dispute.id);
            try {
              await apiClient.patch(`/admin/disputes/${dispute.id}/resolve`, { inFavorOf });
              setDisputes(prev => prev.filter(d => d.id !== dispute.id));
            } catch (error: unknown) {
              const err = error as { response?: { data?: { message?: string | string[] } } };
              const msg = Array.isArray(err.response?.data?.message)
                ? err.response!.data!.message!.join('\n')
                : err.response?.data?.message ?? 'Failed to resolve dispute';
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
        <Text className="text-white font-bold text-lg">Disputes</Text>
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

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">No disputes here.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="#1A56DB" style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            const isOpen = item.status === 'OPEN';
            return (
              <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-white font-semibold text-base" numberOfLines={1}>
                      {item.order.item.title}
                    </Text>
                    <Text className="text-gray-500 text-sm mt-0.5">{formatPHP(item.order.amount)}</Text>
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

                <View className="bg-red-900/15 border border-red-800/30 rounded-xl p-3 mt-3">
                  <Text className="text-gray-400 text-xs mb-1">Reason</Text>
                  <Text className="text-gray-200 text-sm">{item.reason}</Text>
                </View>

                <View className="mt-3 gap-1">
                  <Text className="text-gray-500 text-xs">
                    Buyer: <Text className="text-gray-300">{item.order.buyer.displayName}</Text>
                  </Text>
                  <Text className="text-gray-500 text-xs">
                    Seller: <Text className="text-gray-300">{item.order.seller.displayName}</Text>
                  </Text>
                  <Text className="text-gray-600 text-xs">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                {isOpen && (
                  <View className="flex-row gap-3 mt-3">
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => resolve(item, 'BUYER')}
                      className="flex-1 rounded-xl py-2.5 items-center bg-gray-800 border border-green-800/50"
                    >
                      {busy ? (
                        <ActivityIndicator color="#10B981" />
                      ) : (
                        <Text className="text-green-400 font-semibold text-sm">For Buyer</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => resolve(item, 'SELLER')}
                      className="flex-1 rounded-xl py-2.5 items-center bg-gray-800 border border-blue-800/50"
                    >
                      {busy ? (
                        <ActivityIndicator color="#60A5FA" />
                      ) : (
                        <Text className="text-blue-400 font-semibold text-sm">For Seller</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
