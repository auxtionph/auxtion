import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Image,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';

type Tab = 'orders' | 'offers';

interface Order {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  courier?: string;
  trackingNumber?: string;
  mode?: string;
  paymentDeadline?: string;
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

const MODE_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  auction: { emoji: '🔨', label: 'Swipe',   color: '#60A5FA' },
  chat:    { emoji: '💬', label: 'Chat',    color: '#A78BFA' },
  buynow:  { emoji: '🏷️', label: 'Buy Now', color: '#10B981' },
};

function Icon({ symbol, fallback, size = 14, tint = '#9CA3AF' }: {
  symbol: SFSymbol; fallback: string; size?: number; tint?: string;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={symbol} size={size} tintColor={tint} />;
  }
  return <Text style={{ fontSize: size, color: tint }}>{fallback}</Text>;
}

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [winsFilter, setWinsFilter] = useState<'all' | 'topay' | 'pending' | 'transit' | 'delivered' | 'completed'>('all');
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month' | 'year'>('all');
  const [timeFilterOpen, setTimeFilterOpen] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const formatCountdown = (deadline?: string): { label: string; urgent: boolean } | null => {
    if (!deadline) return null;
    const diffMs = new Date(deadline).getTime() - now;
    if (diffMs <= 0) return { label: 'EXPIRED', urgent: true };
    const totalSec = Math.floor(diffMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return {
      label: `${min}:${sec.toString().padStart(2, '0')}`,
      urgent: totalSec <= 300, // last 5 min
    };
  };
  const fetchData = useCallback(async () => {
    setLoading(true);
    setOrdersPage(1);
    try {
      const [ordersRes, offersRes] = await Promise.all([
        apiClient.get('/orders/buying', {
          params: {
            page: 1, limit: 20,
            search: ordersSearch || undefined,
            status: winsFilter !== 'all' ? winsFilter : undefined,
            timeRange: timeFilter !== 'all' ? timeFilter : undefined,
          },
        }),
        apiClient.get('/offers/my-offers'),
      ]);
      const ordersData = ordersRes.data.data as { items: Order[]; meta: { hasMore: boolean } };
      setOrders(ordersData.items ?? []);
      setOrdersHasMore(ordersData.meta?.hasMore ?? false);
      setOffers((offersRes.data.data as Offer[]) ?? []);
    } catch {
      // fail silently — empty states handle it
    } finally {
      setLoading(false);
    }
  }, [ordersSearch, winsFilter, timeFilter]);

  // Lightweight refetch for search/status/time-filter changes — deliberately
  // does NOT touch `loading`, since that gates the whole screen (including
  // the search bar and filter chips themselves). Touching it here would
  // unmount/remount the TextInput on every keystroke and drop focus.
  // Accepts explicit overrides rather than reading state directly, since
  // state setters (setWinsFilter/setTimeFilter) haven't applied yet in the
  // same tick they're called from.
  const refetchOrdersLight = useCallback(async (overrides: { search?: string; status?: string; timeRange?: string } = {}) => {
    setSearchLoading(true);
    setOrdersPage(1);
    const effectiveSearch = overrides.search ?? ordersSearch;
    const effectiveStatus = overrides.status ?? winsFilter;
    const effectiveTimeRange = overrides.timeRange ?? timeFilter;
    try {
      const res = await apiClient.get('/orders/buying', {
        params: {
          page: 1, limit: 20,
          search: effectiveSearch || undefined,
          status: effectiveStatus !== 'all' ? effectiveStatus : undefined,
          timeRange: effectiveTimeRange !== 'all' ? effectiveTimeRange : undefined,
        },
      });
      const data = res.data.data as { items: Order[]; meta: { hasMore: boolean } };
      setOrders(data.items ?? []);
      setOrdersHasMore(data.meta?.hasMore ?? false);
    } catch {
      // silently fail — keep showing whatever was already on screen
    } finally {
      setSearchLoading(false);
    }
  }, [ordersSearch, winsFilter, timeFilter]);

  const loadMoreOrders = useCallback(async () => {
    if (!ordersHasMore || loadingMoreOrders) return;
    setLoadingMoreOrders(true);
    try {
      const nextPage = ordersPage + 1;
      const res = await apiClient.get('/orders/buying', {
        params: {
          page: nextPage, limit: 20,
          search: ordersSearch || undefined,
          status: winsFilter !== 'all' ? winsFilter : undefined,
          timeRange: timeFilter !== 'all' ? timeFilter : undefined,
        },
      });
      const data = res.data.data as { items: Order[]; meta: { hasMore: boolean } };
      setOrders(prev => [...prev, ...(data.items ?? [])]);
      setOrdersHasMore(data.meta?.hasMore ?? false);
      setOrdersPage(nextPage);
    } catch {
      // silently fail — user can pull-to-refresh to retry
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [ordersPage, ordersHasMore, ordersSearch, winsFilter, timeFilter, loadingMoreOrders]);

  const onSearchChange = useCallback((q: string) => {
    setOrdersSearch(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void refetchOrdersLight({ search: q });
    }, 400);
  }, [refetchOrdersLight]);

  useEffect(() => {
    void fetchData();
    // Intentionally run once on mount only — fetchData's identity changes
    // whenever ordersSearch changes, and re-running this effect on every
    // keystroke would bypass the debounce in onSearchChange entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const confirmReceipt = useCallback(async (orderId: string) => {
    Alert.alert(
      'Confirm Receipt',
      'Confirm that you have received this item? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await apiClient.patch(`/orders/${orderId}/confirm-receipt`);
              void fetchData();
            } catch {
              Alert.alert('Already Confirmed', 'This order has already been confirmed.');
              void fetchData();
            }
          },
        },
      ],
    );
  }, [fetchData]);

  const matchesTimeFilter = (createdAt: string): boolean => {
    if (timeFilter === 'all') return true;
    const now = new Date();
    const d = new Date(createdAt);
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (timeFilter === 'week') return daysAgo <= 7;
    if (timeFilter === 'month') return daysAgo <= 31;
    if (timeFilter === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  };

  const filteredOrders = orders.filter(o => {
    if (!matchesTimeFilter(o.createdAt)) return false;
    if (winsFilter === 'all') return true;
    if (winsFilter === 'topay') return o.status === 'PENDING_PAYMENT' || o.status === 'PENDING_MANUAL_PAYMENT';
    if (winsFilter === 'pending') return o.status === 'PAID';
    if (winsFilter === 'transit') return o.status === 'SHIPPED';
    if (winsFilter === 'delivered') return o.status === 'DELIVERED';
    if (winsFilter === 'completed') return o.status === 'COMPLETED' || o.status === 'CANCELLED';
    return true;
  });

  const ACTIONABLE_STATUSES = ['PENDING_PAYMENT', 'PENDING_MANUAL_PAYMENT', 'DELIVERED'];

  const groupOrdersByDate = (items: Order[]): { title: string; data: Order[] }[] => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`;

    const groups = new Map<string, { title: string; data: Order[] }>();
    for (const order of items) {
      const d = new Date(order.createdAt);
      const daysAgo = Math.floor((startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let title: string;
      if (daysAgo <= 0) title = 'Today';
      else if (daysAgo === 1) title = 'Yesterday';
      else if (daysAgo <= 6) title = 'This Week';
      else if (daysAgo <= 13) title = 'Last Week';
      else if (key === thisMonthKey) title = 'This Month';
      else if (key === lastMonthKey) title = 'Last Month';
      else if (d.getFullYear() === now.getFullYear()) title = 'Earlier This Year';
      else title = String(d.getFullYear());

      if (!groups.has(title)) groups.set(title, { title, data: [] });
      groups.get(title)!.data.push(order);
    }

    const priority = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'Earlier This Year'];
    const titles = Array.from(groups.keys()).sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return Number(b) - Number(a);
    });
    return titles.map(t => groups.get(t)!);
  };

  const orderSections = useMemo(() => {
    if (winsFilter !== 'all') {
      return groupOrdersByDate(filteredOrders);
    }
    const actionable = filteredOrders.filter(o => ACTIONABLE_STATUSES.includes(o.status));
    const rest = filteredOrders.filter(o => !ACTIONABLE_STATUSES.includes(o.status));
    const dateSections = groupOrdersByDate(rest);
    return actionable.length > 0
      ? [{ title: 'Needs Your Attention', data: actionable }, ...dateSections]
      : dateSections;
  }, [filteredOrders, winsFilter, timeFilter]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'orders', label: 'Wins', count: orders.length },
    { key: 'offers', label: 'Offers', count: offers.length },
  ];

  const StatusBadge = ({ status }: { status: string }) => (
    <View style={{
      backgroundColor: (STATUS_COLORS[status] ?? '#6B7280') + '22',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    }}>
      <Text style={{
        color: STATUS_COLORS[status] ?? '#6B7280',
        fontSize: 11,
        fontWeight: '600',
      }}>
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );

  const EmptyState = ({ tab }: { tab: Tab }) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
      <Text style={{ fontSize: 40, marginBottom: 16 }}>
        {tab === 'orders' ? '📦' : '💬'}
      </Text>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 6 }}>
        No {tab === 'orders' ? 'Wins' : 'Offers'} Yet
      </Text>
      <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
        {tab === 'orders'
          ? 'Items you win at auction will appear here'
          : 'Offers you make on Buy Now items will appear here'}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 24, letterSpacing: -0.5 }}>
          Activity
        </Text>
      </View>

      {/* Segmented control */}
      <View style={{
        flexDirection: 'row',
        marginHorizontal: 20, marginBottom: 14,
        backgroundColor: '#111827',
        borderRadius: 12, padding: 3,
        borderWidth: 1, borderColor: '#1F2937',
      }}>
        {tabs.map(({ key, label, count }) => {
          const active = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveTab(key)}
              style={{
                flex: 1,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                paddingVertical: 9, borderRadius: 9,
                backgroundColor: active ? '#1A56DB' : 'transparent',
              }}
            >
              <Text style={{
                color: active ? '#fff' : '#9CA3AF',
                fontSize: 13, fontWeight: '700',
              }}>{label}</Text>
              {count > 0 && (
                <View style={{
                  minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
                  backgroundColor: active ? 'rgba(255,255,255,0.25)' : '#374151',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : (
        <>
          {/* ── Orders Tab ── */}
          {activeTab === 'orders' && (
            <View style={{ flex: 1 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: '#111827', borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 10,
                marginHorizontal: 20, marginBottom: 12,
                borderWidth: 1, borderColor: '#1F2937',
              }}>
                <Text style={{ color: '#6B7280', fontSize: 14 }}>🔍</Text>
                <TextInput
                  style={{ flex: 1, color: '#fff', fontSize: 14 }}
                  placeholder="Search by item or seller..."
                  placeholderTextColor="#4B5563"
                  value={ordersSearch}
                  onChangeText={onSearchChange}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {searchLoading && (
                  <ActivityIndicator size="small" color="#6B7280" />
                )}
                {!searchLoading && ordersSearch.length > 0 && (
                  <TouchableOpacity onPress={() => onSearchChange('')}>
                    <Text style={{ color: '#6B7280', fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ maxHeight: 44, marginBottom: 12 }}
                  contentContainerStyle={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingLeft: 20, paddingRight: 20,
                  }}
                >
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                      height: 34,
                      backgroundColor: timeFilter !== 'all' ? '#1A56DB22' : '#374151',
                      borderWidth: 1, borderColor: timeFilter !== 'all' ? '#1A56DB' : '#4B5563',
                      borderRadius: 999, paddingHorizontal: 12,
                    }}
                    onPress={() => setTimeFilterOpen(true)}
                  >
                    <Icon symbol="calendar" fallback="📅" size={12} tint={timeFilter !== 'all' ? '#60A5FA' : '#9CA3AF'} />
                    <Text style={{
                      color: timeFilter !== 'all' ? '#60A5FA' : '#9CA3AF',
                      fontSize: 13, fontWeight: '600',
                    }}>
                      {timeFilter === 'all' ? 'All time'
                        : timeFilter === 'week' ? 'This week'
                        : timeFilter === 'month' ? 'This month'
                        : 'This year'}
                    </Text>
                    <Icon symbol="chevron.down" fallback="▾" size={10} tint="#6B7280" />
                  </TouchableOpacity>

                  <View style={{ width: 1, height: 20, backgroundColor: '#374151', marginHorizontal: 10 }} />

                {([
                    { key: 'all',       label: 'All' },
                    { key: 'topay',     label: 'Pending' },
                    { key: 'pending',   label: 'Paid' },
                    { key: 'transit',   label: 'In Transit' },
                    { key: 'delivered', label: 'Delivered' },
                    { key: 'completed', label: 'Completed' },
                  ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => { setWinsFilter(opt.key); void refetchOrdersLight({ status: opt.key }); }}
                    style={{
                      height: 34,
                      paddingHorizontal: 14,
                      borderRadius: 999, marginRight: 8,
                      backgroundColor: winsFilter === opt.key ? '#1A56DB' : '#374151',
                      borderWidth: 1,
                      borderColor: winsFilter === opt.key ? '#1A56DB' : '#4B5563',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <SectionList
                style={{ flex: 1, marginTop: 12 }}
                sections={orderSections}
                keyExtractor={item => item.id}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />
                }
                onEndReachedThreshold={0.4}
                onEndReached={() => void loadMoreOrders()}
                ListFooterComponent={loadingMoreOrders ? (
                  <ActivityIndicator color="#1A56DB" style={{ paddingVertical: 16 }} />
                ) : null}
                ListEmptyComponent={<EmptyState tab="orders" />}
                renderSectionHeader={({ section }) => (
                  <View style={{ backgroundColor: '#0D1117', paddingTop: 14, paddingBottom: 8 }}>
                    <Text style={{
                      color: section.title === 'Needs Your Attention' ? '#F59E0B' : '#6B7280',
                      fontSize: 12, fontWeight: '800', letterSpacing: 0.4,
                    }}>
                      {section.title.toUpperCase()}
                    </Text>
                  </View>
                )}
                renderItem={({ item }) => {
                  const isActionable = item.status === 'PENDING_PAYMENT' || item.status === 'PENDING_MANUAL_PAYMENT' || item.status === 'DELIVERED';
                  const accentColor = STATUS_COLORS[item.status] ?? '#1F2937';
                  const mode = MODE_BADGES[item.mode ?? 'auction'] ?? MODE_BADGES.auction;
                  return (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        backgroundColor: '#111827',
                        borderWidth: 1,
                        borderColor: isActionable ? accentColor : '#1F2937',
                        borderRadius: 16,
                        overflow: 'hidden',
                        marginBottom: 12,
                        opacity: item.status === 'COMPLETED' || item.status === 'CANCELLED' ? 0.7 : 1,
                      }}
                      onPress={() => router.push(`/order/${item.id}`)}
                    >
                      {/* Accent strip */}
                      {isActionable && (
                        <View style={{ width: 4, backgroundColor: accentColor }} />
                      )}

                      {/* Photo */}
                      <View style={{ width: 96, backgroundColor: '#1F2937' }}>
                        {item.item.photos[0]?.url ? (
                          <Image source={{ uri: item.item.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 28 }}>📦</Text>
                          </View>
                        )}
                      </View>

                      {/* Info */}
                      <View style={{ flex: 1, padding: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 }} numberOfLines={1}>
                              {item.item.title}
                            </Text>
                            <Text style={{ color: '#6B7280', fontSize: 11 }}>
                              From {item.seller.displayName}
                            </Text>
                          </View>
                          <StatusBadge status={item.status} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 15 }}>
                              {formatPHP(item.amount)}
                            </Text>
                            <View style={{
                              flexDirection: 'row', alignItems: 'center', gap: 3,
                              backgroundColor: 'rgba(255,255,255,0.05)',
                              borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                            }}>
                              <Text style={{ fontSize: 9 }}>{mode.emoji}</Text>
                              <Text style={{ color: mode.color, fontSize: 10, fontWeight: '700' }}>{mode.label}</Text>
                            </View>
                          </View>
                          <Text style={{ color: '#4B5563', fontSize: 11 }}>
                            {new Date(item.createdAt).toLocaleDateString('en-PH', {
                              month: 'short', day: 'numeric',
                            })}
                          </Text>
                        </View>
                        {item.trackingNumber && (
                          <View style={{
                            marginTop: 8, paddingTop: 8,
                            borderTopWidth: 1, borderTopColor: '#1F2937',
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                          }}>
                            <Text style={{ color: '#6B7280', fontSize: 11 }}>📦 {item.courier}</Text>
                            <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '700' }}>
                              {item.trackingNumber}
                            </Text>
                          </View>
                        )}
                        {item.status === 'DELIVERED' && (
                          <TouchableOpacity
                            style={{
                              marginTop: 10,
                              backgroundColor: '#10B981',
                              borderRadius: 10, paddingVertical: 8,
                              alignItems: 'center',
                            }}
                            onPress={() => confirmReceipt(item.id)}
                          >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                              ✓ Confirm Receipt
                            </Text>
                          </TouchableOpacity>
                        )}
                        {item.status === 'PENDING_MANUAL_PAYMENT' && (
                          <TouchableOpacity
                            style={{
                              marginTop: 10,
                              backgroundColor: '#7C3AED',
                              borderRadius: 10, paddingVertical: 8,
                              alignItems: 'center',
                            }}
                            onPress={() => router.push(`/order/${item.id}`)}
                          >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                              💬 View Payment Details
                            </Text>
                          </TouchableOpacity>
                        )}
                        {item.status === 'PENDING_PAYMENT' && (() => {
                          const countdown = formatCountdown(item.paymentDeadline);
                          const expired = countdown?.label === 'EXPIRED';
                          const urgent = countdown?.urgent ?? false;
                          return (
                            <TouchableOpacity
                              style={{
                                marginTop: 10,
                                backgroundColor: expired ? '#6B7280' : urgent ? '#DC2626' : '#F59E0B',
                                borderRadius: 10, paddingVertical: 8,
                                alignItems: 'center',
                              }}
                              onPress={() => router.push(`/order/${item.id}`)}
                              disabled={expired}
                            >
                              <Text style={{
                                color: urgent || expired ? '#fff' : '#000',
                                fontSize: 12, fontWeight: '700',
                              }}>
                                {expired ? 'Order expired' : countdown ? `Pay Now · ${countdown.label}` : 'Pay Now →'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}

          {/* ── Offers Tab ── */}
          {activeTab === 'offers' && (
            <FlatList
              data={offers}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, paddingBottom: insets.bottom + 100 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />
              }
              ListEmptyComponent={<EmptyState tab="offers" />}
              renderItem={({ item }) => (
                <View style={{
                  backgroundColor: '#111827',
                  borderWidth: 1, borderColor: '#1F2937',
                  borderRadius: 16, padding: 14,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {item.item.title}
                    </Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 12 }}>
                    From {item.seller.displayName}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ color: '#6B7280', fontSize: 10 }}>Your offer</Text>
                      <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 15 }}>{formatPHP(item.amount)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: '#6B7280', fontSize: 10 }}>Listed price</Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>{formatPHP(item.item.price)}</Text>
                    </View>
                  </View>
                  {item.status === 'PENDING' && (
                    <View style={{
                      marginTop: 10, paddingTop: 10,
                      borderTopWidth: 1, borderTopColor: '#1F2937',
                    }}>
                      <Text style={{ color: '#4B5563', fontSize: 11 }}>
                        Expires {new Date(item.expiresAt).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  )}

                  {item.status === 'ACCEPTED' && (
                    <View style={{
                      marginTop: 10, paddingTop: 10,
                      borderTopWidth: 1, borderTopColor: '#1F2937',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>Accepted by seller</Text>
                      </View>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#10B981',
                          borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
                        }}
                        onPress={() => router.push(`/order/${item.id}`)}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Pay Now →</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </>
      )}

      {/* Time filter picker */}
      <Modal
        visible={timeFilterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeFilterOpen(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setTimeFilterOpen(false)}
        >
          <View
            style={{
              backgroundColor: '#13192A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
            {([
              { key: 'all', label: 'All time' },
              { key: 'week', label: 'This week' },
              { key: 'month', label: 'This month' },
              { key: 'year', label: 'This year' },
            ] as const).map((opt, i) => (
              <TouchableOpacity
                key={opt.key}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 14,
                  borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)',
                }}
                onPress={() => { setTimeFilter(opt.key); setTimeFilterOpen(false); void refetchOrdersLight({ timeRange: opt.key }); }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: timeFilter === opt.key ? '700' : '400' }}>
                  {opt.label}
                </Text>
                {timeFilter === opt.key && (
                  <Icon symbol="checkmark" fallback="✓" size={15} tint="#60A5FA" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}