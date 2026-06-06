import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
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

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [winsFilter, setWinsFilter] = useState<'all' | 'topay' | 'pending' | 'transit' | 'delivered' | 'completed'>('all');
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, offersRes] = await Promise.all([
        apiClient.get('/orders/buying'),
        apiClient.get('/offers/my-offers'),
      ]);
      setOrders(ordersRes.data.data as Order[]);
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

  const filteredOrders = orders.filter(o => {
    if (winsFilter === 'all') return true;
    if (winsFilter === 'topay') return o.status === 'PENDING_PAYMENT' || o.status === 'PENDING_MANUAL_PAYMENT';
    if (winsFilter === 'pending') return o.status === 'PAID';
    if (winsFilter === 'transit') return o.status === 'SHIPPED';
    if (winsFilter === 'delivered') return o.status === 'DELIVERED';
    if (winsFilter === 'completed') return o.status === 'COMPLETED' || o.status === 'CANCELLED';
    return true;
  });

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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ maxHeight: 44 }}
                contentContainerStyle={{
                  flexDirection: 'row',
                  paddingLeft: 20, paddingRight: 20,
                }}
              >
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
                    onPress={() => setWinsFilter(opt.key)}
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
              <FlatList
                style={{ flex: 1, marginTop: 12 }}
                data={filteredOrders}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: insets.bottom + 100 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />
                }
                ListEmptyComponent={<EmptyState tab="orders" />}
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
                        {(item.status === 'PENDING_PAYMENT' || item.status === 'PENDING_MANUAL_PAYMENT') && (
                          <TouchableOpacity
                            style={{
                              marginTop: 10,
                              backgroundColor: '#F59E0B',
                              borderRadius: 10, paddingVertical: 8,
                              alignItems: 'center',
                            }}
                            onPress={() => router.push(`/order/${item.id}`)}
                          >
                            <Text style={{ color: '#000', fontSize: 12, fontWeight: '700' }}>
                              Pay Now →
                            </Text>
                          </TouchableOpacity>
                        )}
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
    </View>
  );
}