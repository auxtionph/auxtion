import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';

type Tab = 'orders' | 'bids' | 'offers';

interface Order {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  courier?: string;
  trackingNumber?: string;
  item: {
    id: string;
    title: string;
    photos: { url: string; publicId: string; width?: number; height?: number }[];
  };
  seller: {
    id: string;
    displayName: string;
  };
}

interface Bid {
  id: string;
  amount: number;
  isWinning: boolean;
  placedAt: string;
  item: {
    id: string;
    title: string;
    photos: { url: string; publicId: string; width?: number; height?: number }[];
  };
  auction: {
    id: string;
    title: string;
    status: string;
  };
}

interface Offer {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  item: {
    id: string;
    title: string;
    photos: { url: string; publicId: string; width?: number; height?: number }[];
    price: number;
  };
  seller: {
    id: string;
    displayName: string;
  };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: '#F59E0B',
  PAID: '#3B82F6',
  SHIPPED: '#8B5CF6',
  DELIVERED: '#10B981',
  COMPLETED: '#059669',
  CANCELLED: '#6B7280',
  PENDING: '#F59E0B',
  ACCEPTED: '#10B981',
  DECLINED: '#DC2626',
  EXPIRED: '#6B7280',
  PENDING_MANUAL_PAYMENT: '#F59E0B',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting Payment',
  PENDING_MANUAL_PAYMENT: 'Awaiting GCash',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};

export default function ActivityScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, bidsRes, offersRes] = await Promise.all([
        apiClient.get('/orders/buying'),
        apiClient.get('/bids/my-bids').catch(() => ({ data: { data: [] } })),
        apiClient.get('/offers/my-offers'),
      ]);
      setOrders(ordersRes.data.data as Order[]);
      setBids(bidsRes.data.data as Bid[]);
      setOffers(offersRes.data.data as Offer[]);
    } catch {
      // fail silently — empty states handle it
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'orders', label: 'Orders', count: orders.length },
    { key: 'bids', label: 'Bids', count: bids.length },
    { key: 'offers', label: 'Offers', count: offers.length },
  ];

  const StatusBadge = ({ status }: { status: string }) => (
    <View
      style={{ backgroundColor: (STATUS_COLORS[status] ?? '#6B7280') + '22' }}
      className="rounded-full px-2 py-0.5"
    >
      <Text
        style={{ color: STATUS_COLORS[status] ?? '#6B7280' }}
        className="text-xs font-semibold"
      >
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );

  const EmptyState = ({ tab }: { tab: Tab }) => (
    <View className="flex-1 items-center justify-center py-20">
      <Text className="text-4xl mb-4">
        {tab === 'orders' ? '📦' : tab === 'bids' ? '🔨' : '💬'}
      </Text>
      <Text className="text-white font-bold text-lg mb-2">
        No {tab === 'orders' ? 'Orders' : tab === 'bids' ? 'Bids' : 'Offers'} Yet
      </Text>
      <Text className="text-gray-500 text-sm text-center px-8">
        {tab === 'orders'
          ? 'Items you win at auction will appear here'
          : tab === 'bids'
          ? 'Your bids on live auctions will appear here'
          : 'Offers you make on Buy Now items will appear here'}
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-[#1E2A3A]">
      {/* Header */}
      <View className="pt-14 pb-4 px-6">
        <Text className="text-white text-2xl font-bold">Activity</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row px-6 mb-4 gap-2">
        {tabs.map(({ key, label, count }) => (
          <TouchableOpacity
            key={key}
            className={`px-4 py-2 rounded-full flex-row items-center gap-1.5 ${
              activeTab === key ? 'bg-[#1A56DB]' : 'bg-gray-800'
            }`}
            onPress={() => setActiveTab(key)}
          >
            <Text className={`text-sm font-semibold ${
              activeTab === key ? 'text-white' : 'text-gray-400'
            }`}>
              {label}
            </Text>
            {count > 0 && (
              <View className={`rounded-full w-4 h-4 items-center justify-center ${
                activeTab === key ? 'bg-white/30' : 'bg-gray-700'
              }`}>
                <Text className="text-white text-xs">{count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : (
        <>
          {/* ── Orders Tab ── */}
          {activeTab === 'orders' && (
            <FlatList
              data={orders}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />
              }
              ListEmptyComponent={<EmptyState tab="orders" />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4"
                  onPress={() => router.push(`/order/${item.id}`)}
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <Text className="text-white font-semibold text-sm mb-1" numberOfLines={1}>
                        {item.item.title}
                      </Text>
                      <Text className="text-gray-500 text-xs">
                        From {item.seller.displayName}
                      </Text>
                    </View>
                    <StatusBadge status={item.status} />
                  </View>

                  <View className="flex-row items-center justify-between">
                    <Text className="text-[#F59E0B] font-bold">
                      {formatPHP(item.amount)}
                    </Text>
                    <Text className="text-gray-600 text-xs">
                      {new Date(item.createdAt).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  </View>

                  {item.trackingNumber && (
                    <View className="mt-3 pt-3 border-t border-gray-800 flex-row items-center gap-2">
                      <Text className="text-gray-500 text-xs">📦 {item.courier}</Text>
                      <Text className="text-[#1A56DB] text-xs font-semibold">
                        {item.trackingNumber}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          {/* ── Bids Tab ── */}
          {activeTab === 'bids' && (
            <FlatList
              data={bids}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />
              }
              ListEmptyComponent={<EmptyState tab="bids" />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4"
                  onPress={() => router.push(`/auction/${item.auction.id}`)}
                >
                  <View className="flex-row items-start justify-between mb-2">
                    <Text className="text-white font-semibold text-sm flex-1 mr-2" numberOfLines={1}>
                      {item.item.title}
                    </Text>
                    {item.isWinning ? (
                      <View className="bg-green-900/50 rounded-full px-2 py-0.5">
                        <Text className="text-green-400 text-xs font-bold">🏆 Winning</Text>
                      </View>
                    ) : (
                      <View className="bg-gray-800 rounded-full px-2 py-0.5">
                        <Text className="text-gray-500 text-xs">Outbid</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-gray-500 text-xs mb-2">{item.auction.title}</Text>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[#F59E0B] font-bold">{formatPHP(item.amount)}</Text>
                    <Text className="text-gray-600 text-xs">
                      {new Date(item.placedAt).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric',
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          {/* ── Offers Tab ── */}
          {activeTab === 'offers' && (
            <FlatList
              data={offers}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />
              }
              ListEmptyComponent={<EmptyState tab="offers" />}
              renderItem={({ item }) => (
                <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                  <View className="flex-row items-start justify-between mb-2">
                    <Text className="text-white font-semibold text-sm flex-1 mr-2" numberOfLines={1}>
                      {item.item.title}
                    </Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text className="text-gray-500 text-xs mb-3">
                    From {item.seller.displayName}
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-gray-500 text-xs">Your offer</Text>
                      <Text className="text-[#F59E0B] font-bold">{formatPHP(item.amount)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-gray-500 text-xs">Listed price</Text>
                      <Text className="text-gray-400 text-sm">{formatPHP(item.item.price)}</Text>
                    </View>
                  </View>
                  {item.status === 'PENDING' && (
                    <View className="mt-3 pt-3 border-t border-gray-800">
                      <Text className="text-gray-600 text-xs">
                        Expires {new Date(item.expiresAt).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}