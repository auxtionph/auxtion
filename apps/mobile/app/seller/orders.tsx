import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';

type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_MANUAL_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

type CourierKey =
  | 'JT_EXPRESS'
  | 'LBC'
  | 'NINJA_VAN'
  | 'FLASH_EXPRESS'
  | 'GRAB_EXPRESS'
  | 'OTHER';

interface SellerOrder {
  id: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
  shippedAt?: string;
  courier?: CourierKey;
  trackingNumber?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingLine1?: string;
  shippingCity?: string;
  shippingProvince?: string;
  shippingPostalCode?: string;
  mode: string;
  item: {
    id: string;
    title: string;
    photos: { url: string }[];
  };
  buyer: {
    id: string;
    displayName: string;
  };
  payment?: {
    status: string;
    paymongoRef?: string;
  };
  auction?: {
    id: string;
    title: string;
    actualStartTime?: string;
    startTime: string;
  };
}

interface AuctionGroup {
  auctionId: string;
  auctionTitle: string;
  date: string;
  orders: SellerOrder[];
  isExpanded: boolean;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING_PAYMENT:        { label: 'Awaiting Payment',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  PENDING_MANUAL_PAYMENT: { label: 'Awaiting GCash/Bank', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  PAID:            { label: 'Paid — Ship Now',  color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  SHIPPED:         { label: 'Shipped',           color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  DELIVERED:       { label: 'Delivered',         color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  COMPLETED:       { label: 'Completed',         color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  CANCELLED:       { label: 'Cancelled',         color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  DISPUTED:        { label: 'Disputed',          color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
};

const AVATAR_COLORS = [
  '#1A56DB', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#7C3AED', // violet
  '#EF4444', // red
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#8B5CF6', // purple
  '#F97316', // orange
  '#14B8A6', // teal
];

const colorForId = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const COURIERS: { key: CourierKey; label: string }[] = [
  { key: 'JT_EXPRESS',    label: 'J&T Express' },
  { key: 'LBC',           label: 'LBC' },
  { key: 'NINJA_VAN',     label: 'Ninja Van' },
  { key: 'FLASH_EXPRESS', label: 'Flash Express' },
  { key: 'GRAB_EXPRESS',  label: 'Grab Express' },
  { key: 'OTHER',         label: 'Other' },
];

type FilterTab = 'all' | 'PAID' | 'SHIPPED' | 'COMPLETED';

export default function SellerOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Ship modal state
  const [showShipModal, setShowShipModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<CourierKey | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shipping, setShipping] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get('/orders/selling');
      const data = res.data.data as SellerOrder[];
      setOrders(data);
      // Auto-expand groups with PAID orders
      setExpandedGroups(prev => {
        const next = new Set(prev);
        data.forEach(o => {
          if (o.status === 'PAID' && o.auction?.id) next.add(o.auction.id);
        });
        return next;
      });
    } catch {
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void fetchOrders();
  }, [fetchOrders]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchOrders();
  }, [fetchOrders]);

  const handleMarkShipped = async () => {
    if (!selectedOrder || !selectedCourier || !trackingNumber.trim()) {
      Alert.alert('Missing Info', 'Select a courier and enter a tracking number.');
      return;
    }
    setShipping(true);
    try {
      await apiClient.patch(`/orders/${selectedOrder.id}/ship`, {
        courier: selectedCourier,
        trackingNumber: trackingNumber.trim(),
      });
      setShowShipModal(false);
      setSelectedOrder(null);
      setSelectedCourier(null);
      setTrackingNumber('');
      Alert.alert('📦 Shipped!', 'The buyer has been notified.');
      void fetchOrders();
    } catch {
      Alert.alert('Error', 'Failed to mark as shipped. Try again.');
    } finally {
      setShipping(false);
    }
  };

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const filtered = orders.filter(o => {
    if (filterTab === 'all') return true;
    return o.status === filterTab;
  });

  const grouped: AuctionGroup[] = (() => {
    const map = new Map<string, AuctionGroup>();
    filtered.forEach(order => {
      const key = order.auction?.id ?? 'no-auction';
      const title = order.auction?.title ?? 'Direct Sale';
      const rawDate = order.auction?.actualStartTime ?? order.auction?.startTime ?? order.createdAt;
      const date = new Date(rawDate).toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      if (!map.has(key)) {
        map.set(key, {
          auctionId: key,
          auctionTitle: title,
          date,
          orders: [],
          isExpanded: expandedGroups.has(key) || key === 'no-auction',
        });
      }
      map.get(key)!.orders.push(order);
    });
    // Sort orders within each group newest first
    map.forEach(group => {
      group.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return Array.from(map.values()).sort((a, b) => {
      const aDate = a.orders[0]?.auction?.actualStartTime ?? a.orders[0]?.auction?.startTime ?? a.orders[0]?.createdAt ?? '';
      const bDate = b.orders[0]?.auction?.actualStartTime ?? b.orders[0]?.auction?.startTime ?? b.orders[0]?.createdAt ?? '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  })();

  const toggleGroup = (auctionId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(auctionId)) next.delete(auctionId);
      else next.add(auctionId);
      return next;
    });
  };

  // Auto-expand groups with PAID orders
  const paidCount = orders.filter(o => o.status === 'PAID').length;

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all',       label: 'All',       count: orders.length },
    { key: 'PAID',      label: 'To Ship',   count: paidCount },
    { key: 'SHIPPED',   label: 'Shipped' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  const renderOrder = ({ item: order }: { item: SellerOrder }) => {
    const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.CANCELLED;
    const isPaid = order.status === 'PAID';

    return (
      <View style={{
        backgroundColor: '#111827',
        borderRadius: 0,
        borderWidth: 0,
        overflow: 'hidden',
      }}>
        {/* Paid urgency banner */}
        {isPaid && (
          <View style={{
            backgroundColor: 'rgba(16,185,129,0.12)',
            paddingHorizontal: 14, paddingVertical: 6,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
            <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>
              Payment received — ready to ship
            </Text>
          </View>
        )}
        {order.status === 'PENDING_MANUAL_PAYMENT' && (
          <View style={{
            backgroundColor: 'rgba(245,158,11,0.12)',
            paddingHorizontal: 14, paddingVertical: 6,
            flexDirection: 'row', alignItems: 'center', gap: 6,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} />
            <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>
              Awaiting GCash / bank payment
            </Text>
          </View>
        )}

        <View style={{ padding: 14 }}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{
              width: 48, height: 48, borderRadius: 10,
              backgroundColor: '#1F2937', marginRight: 10,
              overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
            }}>
              {order.item.photos?.[0]?.url ? (
                <Image source={{ uri: order.item.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 22 }}>📦</Text>
              )}
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                {order.item.title}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                {order.buyer.displayName} · {new Date(order.createdAt).toLocaleDateString('en-PH', {
                  month: 'short', day: 'numeric',
                })} · {new Date(order.createdAt).toLocaleTimeString('en-PH', {
                  hour: 'numeric', minute: '2-digit',
                })}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 15 }}>
                {formatPHP(order.amount)}
              </Text>
              <View style={{ backgroundColor: cfg.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>
                  {cfg.label}
                </Text>
              </View>
            </View>
          </View>

          {/* Shipping address — show when paid or shipped */}
          {(isPaid || order.status === 'SHIPPED') && order.shippingName && (
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 10,
              padding: 10, marginBottom: 12,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700', marginBottom: 4 }}>
                SHIP TO
              </Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                {order.shippingName}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                {order.shippingPhone}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>
                {order.shippingLine1}, {order.shippingCity}, {order.shippingProvince} {order.shippingPostalCode}
              </Text>
            </View>
          )}

          {/* No shipping address warning */}
          {isPaid && !order.shippingName && (
            <View style={{
              backgroundColor: 'rgba(245,158,11,0.08)',
              borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
              borderRadius: 10, padding: 10, marginBottom: 12,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            }}>
              <Text style={{ fontSize: 16 }}>⚠️</Text>
              <Text style={{ color: '#F59E0B', fontSize: 12, flex: 1 }}>
                Buyer hasn't added shipping address yet. Contact them before shipping.
              </Text>
            </View>
          )}

          {/* Tracking info — show when shipped */}
          {order.status === 'SHIPPED' && order.trackingNumber && (
            <View style={{
              backgroundColor: 'rgba(59,130,246,0.08)',
              borderRadius: 10, padding: 10, marginBottom: 12,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700', marginBottom: 4 }}>
                TRACKING
              </Text>
              <Text style={{ color: '#60A5FA', fontWeight: '700', fontSize: 13 }}>
                {COURIERS.find(c => c.key === order.courier)?.label ?? order.courier}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                {order.trackingNumber}
              </Text>
            </View>
          )}

          {/* Order ID */}
          <TouchableOpacity
            onLongPress={() => {
              // Optional: copy full ID to clipboard for support tickets
              // import * as Clipboard from 'expo-clipboard';
              // void Clipboard.setStringAsync(order.id);
            }}
            style={{ marginBottom: 12 }}
          >
            <Text style={{ color: '#4B5563', fontSize: 10, fontFamily: 'monospace' }}>
              #{order.id.slice(-6).toUpperCase()}
            </Text>
          </TouchableOpacity>

          {/* CTA */}
          {order.status === 'PENDING_MANUAL_PAYMENT' && (
            <TouchableOpacity
              style={{
                backgroundColor: '#F59E0B',
                borderRadius: 12, paddingVertical: 12,
                alignItems: 'center', marginBottom: 8,
              }}
              onPress={() => {
                Alert.alert(
                  'Mark as Paid?',
                  `Confirm that ${order.buyer.displayName} has paid ${formatPHP(order.amount)} via GCash or bank transfer.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Confirm Payment',
                      onPress: async () => {
                        try {
                          await apiClient.patch(`/orders/${order.id}/mark-paid`);
                          void fetchOrders();
                        } catch {
                          Alert.alert('Error', 'Failed to mark as paid. Try again.');
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>
                💰 Mark as Paid
              </Text>
            </TouchableOpacity>
          )}
          {isPaid && (
            <TouchableOpacity
              style={{
                backgroundColor: '#10B981',
                borderRadius: 12, paddingVertical: 12,
                alignItems: 'center',
              }}
              onPress={() => {
                setSelectedOrder(order);
                setSelectedCourier(null);
                setTrackingNumber('');
                setShowShipModal(true);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                📦 Mark as Shipped
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderColor: '#1F2937',
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: '#1F2937',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, flex: 1 }}>
          Orders
        </Text>
        {paidCount > 0 && (
          <View style={{
            backgroundColor: '#10B981', borderRadius: 999,
            paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {paidCount} to ship
            </Text>
          </View>
        )}
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={{
              paddingHorizontal: 14, paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: filterTab === tab.key ? '#1A56DB' : '#1F2937',
              flexDirection: 'row', alignItems: 'center', gap: 5,
            }}
            onPress={() => setFilterTab(tab.key)}
          >
            <Text style={{
              color: filterTab === tab.key ? '#fff' : '#6B7280',
              fontSize: 12, fontWeight: '600',
            }}>
              {tab.label}
            </Text>
            {tab.count !== undefined && tab.count > 0 && (
              <View style={{
                backgroundColor: filterTab === tab.key ? 'rgba(255,255,255,0.25)' : '#374151',
                borderRadius: 999, minWidth: 18, height: 18,
                paddingHorizontal: 4,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : grouped.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📦</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8 }}>
            No orders yet
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
            {filterTab === 'PAID'
              ? 'No paid orders waiting to ship'
              : 'Orders from your auctions will appear here'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56DB" />
          }
          showsVerticalScrollIndicator={false}
        >
          {grouped.map(group => {
            const isExpanded = expandedGroups.has(group.auctionId);
            const groupPaidCount = group.orders.filter(o => o.status === 'PAID').length;
            return (
              <View key={group.auctionId} style={{ marginBottom: 16 }}>
                {/* Group header */}
                <TouchableOpacity
                  onPress={() => toggleGroup(group.auctionId)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#111827',
                    borderRadius: isExpanded ? 16 : 16,
                    borderBottomLeftRadius: isExpanded ? 0 : 16,
                    borderBottomRightRadius: isExpanded ? 0 : 16,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: groupPaidCount > 0 ? 'rgba(16,185,129,0.3)' : '#1F2937',
                    gap: 10,
                  }}
                  activeOpacity={0.8}
                >
                  {/* Auction badge — deterministic color per auction, first letter of title */}
                  <View style={{
                    width: 44, height: 44, borderRadius: 12,
                    backgroundColor: colorForId(group.auctionId),
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: colorForId(group.auctionId),
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                    elevation: 3,
                  }}>
                    <Text style={{
                      color: '#fff',
                      fontWeight: '800',
                      fontSize: 20,
                      letterSpacing: -0.5,
                    }}>
                      {group.auctionTitle.trim().charAt(0).toUpperCase() || '·'}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                      {group.auctionTitle}
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                      {group.date} · {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {groupPaidCount > 0 && (
                    <View style={{
                      backgroundColor: '#10B981', borderRadius: 999,
                      paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                        {groupPaidCount} to ship
                      </Text>
                    </View>
                  )}
                  <Text style={{ color: '#6B7280', fontSize: 16 }}>
                    {isExpanded ? '▾' : '▸'}
                  </Text>
                </TouchableOpacity>

                {/* Orders in group */}
                {isExpanded && (
                  <View style={{
                    borderWidth: 1, borderTopWidth: 0,
                    borderColor: groupPaidCount > 0 ? 'rgba(16,185,129,0.3)' : '#1F2937',
                    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                    overflow: 'hidden',
                  }}>
                    {group.orders.map((order, idx) => (
                      <View key={order.id} style={{
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: '#1F2937',
                      }}>
                        {renderOrder({ item: order })}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Ship Modal ── */}
      <Modal
        visible={showShipModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowShipModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
            activeOpacity={1}
            onPress={() => setShowShipModal(false)}
          />
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: insets.bottom + 24,
            borderTopWidth: 1, borderColor: '#1F2937',
          }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Mark as Shipped</Text>
              {selectedOrder && (
                <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }} numberOfLines={1}>
                  {selectedOrder.item.title} → {selectedOrder.buyer.displayName}
                </Text>
              )}
            </View>

            {/* Courier picker */}
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              COURIER
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 16 }}
            >
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {COURIERS.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: selectedCourier === c.key ? '#1A56DB' : '#1F2937',
                      borderWidth: 1,
                      borderColor: selectedCourier === c.key ? '#1A56DB' : '#374151',
                    }}
                    onPress={() => setSelectedCourier(c.key)}
                  >
                    <Text style={{
                      color: selectedCourier === c.key ? '#fff' : '#9CA3AF',
                      fontWeight: '600', fontSize: 13,
                    }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Tracking number */}
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              TRACKING NUMBER
            </Text>
            <TextInput
              style={{
                backgroundColor: '#1F2937',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: trackingNumber ? '#1A56DB' : '#374151',
                padding: 14,
                color: '#fff',
                fontSize: 15,
                fontWeight: '600',
                marginBottom: 24,
                letterSpacing: 0.5,
              }}
              placeholder="e.g. 123456789012"
              placeholderTextColor="#4B5563"
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {/* Confirm */}
            <TouchableOpacity
              style={{
                backgroundColor: shipping || !selectedCourier || !trackingNumber.trim()
                  ? '#1F2937' : '#10B981',
                borderRadius: 14, paddingVertical: 16,
                alignItems: 'center',
                opacity: shipping ? 0.6 : 1,
              }}
              onPress={() => void handleMarkShipped()}
              disabled={shipping || !selectedCourier || !trackingNumber.trim()}
            >
              {shipping ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  📦 Confirm Shipment
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}