import {
  View, Text, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ordersApi, Order, OrderStatus } from '../../src/services/api/orders.api';
import { formatPHP } from '@auxtion/utils';

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  PENDING_PAYMENT:        { label: 'Awaiting Payment',  color: '#F59E0B' },
  PENDING_MANUAL_PAYMENT: { label: 'Awaiting Payment',  color: '#F59E0B' },
  PAID:                   { label: 'Paid',              color: '#60A5FA' },
  SHIPPED:                { label: 'Shipped',           color: '#A78BFA' },
  DELIVERED:              { label: 'Delivered',         color: '#34D399' },
  COMPLETED:              { label: 'Completed',         color: '#10B981' },
  DISPUTED:               { label: 'Disputed',          color: '#EF4444' },
  CANCELLED:              { label: 'Cancelled',         color: '#6B7280' },
};

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'buying' | 'selling'>('buying');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetch = tab === 'buying' ? ordersApi.listBuying : ordersApi.listSelling;
    fetch().then(setOrders).finally(() => setLoading(false));
  }, [tab]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0F172A', paddingTop: insets.top }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16, gap: 12,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20 }}>Orders</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 }}>
        {(['buying', 'selling'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={{
              flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
              backgroundColor: tab === t ? '#1A56DB' : '#1F2937',
              borderWidth: 1, borderColor: tab === t ? '#1A56DB' : '#374151',
            }}
            onPress={() => setTab(t)}
          >
            <Text style={{
              color: tab === t ? '#fff' : '#6B7280',
              fontWeight: '700', fontSize: 13,
            }}>
              {t === 'buying' ? '🛍️ Purchases' : '🏪 Sales'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#1A56DB" style={{ marginTop: 40 }} />
      ) : orders.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📦</Text>
          <Text style={{ color: '#4B5563', fontSize: 15 }}>No orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            const photo = item.item.photos[0]?.url;
            return (
              <TouchableOpacity
                style={{
                  flexDirection: 'row', gap: 12,
                  backgroundColor: '#1E293B', borderRadius: 16,
                  padding: 14, marginBottom: 10,
                  borderWidth: 1, borderColor: '#334155',
                }}
                onPress={() => router.push({ pathname: '/orders/[id]', params: { id: item.id } })}
                activeOpacity={0.8}
              >
                <View style={{
                  width: 56, height: 56, borderRadius: 12,
                  backgroundColor: '#0F172A', overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {photo
                    ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontSize: 24 }}>📦</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                    {item.item.title}
                  </Text>
                  <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>
                    {tab === 'buying'
                      ? `Seller: ${item.seller.displayName}`
                      : `Buyer: ${item.buyer.displayName}`}
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'space-between', marginTop: 6,
                  }}>
                    <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 13 }}>
                      {formatPHP(item.amount)}
                    </Text>
                    <View style={{
                      backgroundColor: `${meta.color}22`,
                      borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
                      borderWidth: 1, borderColor: `${meta.color}55`,
                    }}>
                      <Text style={{ color: meta.color, fontSize: 10, fontWeight: '700' }}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={{ color: '#475569', alignSelf: 'center' }}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
