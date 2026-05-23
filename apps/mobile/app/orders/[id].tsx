import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ordersApi, Order, OrderStatus, CourierKey,
  COURIER_LABELS, COURIER_KEYS,
} from '../../src/services/api/orders.api';
import { useAuthStore } from '../../src/stores/auth.store';
import { formatPHP } from '@auxtion/utils';

const STATUS_STEPS: Record<OrderStatus, number> = {
  PENDING_PAYMENT: 0,
  PENDING_MANUAL_PAYMENT: 0,
  PAID: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  COMPLETED: 3,
  DISPUTED: 2,
  CANCELLED: -1,
};

function StatusTimeline({ status }: { status: OrderStatus }) {
  const step = STATUS_STEPS[status] ?? 0;
  const steps = ['Payment', 'Shipping', 'Delivered'];
  const isDisputed = status === 'DISPUTED';
  const isCancelled = status === 'CANCELLED';

  if (isCancelled) {
    return (
      <View style={{
        backgroundColor: 'rgba(107,114,128,0.1)', borderRadius: 12,
        padding: 12, marginBottom: 20, alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(107,114,128,0.3)',
      }}>
        <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 13 }}>Order Cancelled</Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
      {steps.map((label, i) => {
        const done = i < step;
        const active = i === step && !isDisputed;
        const disputed = isDisputed && i === step;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              {i > 0 && (
                <View style={{ flex: 1, height: 2, backgroundColor: done ? '#1A56DB' : '#1F2937' }} />
              )}
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: disputed ? '#EF4444' : done ? '#1A56DB' : active ? '#1A56DB' : '#1F2937',
                borderWidth: 2,
                borderColor: disputed ? '#EF4444' : done || active ? '#1A56DB' : '#374151',
              }}>
                {done
                  ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                  : disputed
                    ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>!</Text>
                    : <View style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: active ? '#fff' : '#374151',
                      }} />
                }
              </View>
              {i < steps.length - 1 && (
                <View style={{ flex: 1, height: 2, backgroundColor: done ? '#1A56DB' : '#1F2937' }} />
              )}
            </View>
            <Text style={{
              color: disputed ? '#EF4444' : done || active ? '#fff' : '#4B5563',
              fontSize: 10, fontWeight: '600', marginTop: 6, textAlign: 'center',
            }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShipModal, setShowShipModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<CourierKey | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  const refresh = async () => {
    const updated = await ordersApi.getById(id);
    setOrder(updated);
  };

  useEffect(() => {
    ordersApi.getById(id)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !order) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#1A56DB" />
      </View>
    );
  }

  const isBuyer = order.buyerId === user?.id;
  const isSeller = order.sellerId === user?.id;

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
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, flex: 1 }} numberOfLines={1}>
          {order.item.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        <StatusTimeline status={order.status} />

        <View style={{
          backgroundColor: '#1E293B', borderRadius: 16, padding: 16,
          marginBottom: 12, borderWidth: 1, borderColor: '#334155',
        }}>
          <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 12, fontWeight: '600', letterSpacing: 0.5 }}>
            ORDER SUMMARY
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#94A3B8', fontSize: 13 }}>Item</Text>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{formatPHP(order.amount)}</Text>
          </View>
          {order.commissionAmount > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#94A3B8', fontSize: 13 }}>Platform fee (5%)</Text>
              <Text style={{ color: '#94A3B8', fontSize: 13 }}>−{formatPHP(order.commissionAmount)}</Text>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: '#334155', marginVertical: 8 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {isSeller ? 'Your payout' : 'Total'}
            </Text>
            <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 16 }}>
              {formatPHP(isSeller ? order.sellerPayout : order.amount)}
            </Text>
          </View>
          <Text style={{ color: '#4B5563', fontSize: 11, marginTop: 8 }}>
            {isSeller ? `Buyer: ${order.buyer.displayName}` : `Seller: ${order.seller.displayName}`}
          </Text>
        </View>

        {order.shippingLine1 && (
          <View style={{
            backgroundColor: '#1E293B', borderRadius: 16, padding: 16,
            marginBottom: 12, borderWidth: 1, borderColor: '#334155',
          }}>
            <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 10, letterSpacing: 0.5 }}>
              SHIP TO
            </Text>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{order.shippingName}</Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 2 }}>{order.shippingPhone}</Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 2 }}>
              {order.shippingLine1}, {order.shippingCity}, {order.shippingProvince} {order.shippingPostalCode}
            </Text>
          </View>
        )}

        {order.trackingNumber && (
          <View style={{
            backgroundColor: '#1E293B', borderRadius: 16, padding: 16,
            marginBottom: 12, borderWidth: 1, borderColor: '#334155',
          }}>
            <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 10, letterSpacing: 0.5 }}>
              TRACKING
            </Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {order.courier ? COURIER_LABELS[order.courier] : order.courier}
            </Text>
            <Text style={{ color: '#60A5FA', fontSize: 14, marginTop: 4, fontWeight: '600' }}>
              {order.trackingNumber}
            </Text>
            {order.autoConfirmAt && order.status === 'SHIPPED' && (
              <Text style={{ color: '#4B5563', fontSize: 11, marginTop: 8 }}>
                Auto-confirms {new Date(order.autoConfirmAt).toLocaleDateString('en-PH', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })} if not confirmed
              </Text>
            )}
          </View>
        )}

        {order.dispute && (
          <View style={{
            backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 16, padding: 16,
            marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
          }}>
            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14, marginBottom: 6 }}>
              ⚠️ Order Disputed
            </Text>
            <Text style={{ color: '#FCA5A5', fontSize: 13 }}>{order.dispute.reason}</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 8 }}>
              Our team will review and resolve within 3–5 business days.
            </Text>
          </View>
        )}

        {isSeller && (
          <View style={{ gap: 10, marginTop: 8 }}>
            {order.status === 'PENDING_MANUAL_PAYMENT' && (
              <TouchableOpacity
                style={{ backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
                onPress={() => Alert.alert(
                  'Mark as Paid?',
                  `Confirm that ${order.buyer.displayName} has paid ${formatPHP(order.amount)}.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Confirm', onPress: async () => { await ordersApi.markPaid(order.id); await refresh(); } },
                  ]
                )}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✅ Mark as Paid</Text>
              </TouchableOpacity>
            )}
            {order.status === 'PAID' && (
              <TouchableOpacity
                style={{ backgroundColor: '#1A56DB', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
                onPress={() => setShowShipModal(true)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>📦 Add Tracking</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isBuyer && order.status === 'SHIPPED' && (
          <View style={{ gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
              onPress={() => Alert.alert(
                'Confirm Delivery?',
                'This releases payment to the seller. Only confirm if you received the item.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Confirm', onPress: async () => { await ordersApi.confirmReceipt(order.id); await refresh(); } },
                ]
              )}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✅ Item Received</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                borderWidth: 1, borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)',
              }}
              onPress={() => setShowDisputeModal(true)}
            >
              <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 14 }}>⚠️ Report an Issue</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={showShipModal} transparent animationType="slide" onRequestClose={() => setShowShipModal(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowShipModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Add Tracking</Text>
            </View>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 }}>COURIER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {COURIER_KEYS.map(key => (
                  <TouchableOpacity
                    key={key}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                      backgroundColor: selectedCourier === key ? '#1A56DB' : '#1F2937',
                      borderWidth: 1, borderColor: selectedCourier === key ? '#1A56DB' : '#374151',
                    }}
                    onPress={() => setSelectedCourier(key)}
                  >
                    <Text style={{ color: selectedCourier === key ? '#fff' : '#6B7280', fontWeight: '600', fontSize: 13 }}>
                      {COURIER_LABELS[key]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 }}>TRACKING NUMBER</Text>
            <TextInput
              style={{
                backgroundColor: '#1F2937', borderRadius: 12,
                borderWidth: 1, borderColor: trackingInput ? '#1A56DB' : '#374151',
                paddingHorizontal: 14, paddingVertical: 14,
                color: '#fff', fontSize: 15, marginBottom: 20,
              }}
              placeholder="e.g. JT1234567890"
              placeholderTextColor="#4B5563"
              value={trackingInput}
              onChangeText={setTrackingInput}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={{
                backgroundColor: selectedCourier && trackingInput.length >= 6 && !submitting ? '#1A56DB' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              disabled={!selectedCourier || trackingInput.length < 6 || submitting}
              onPress={async () => {
                if (!selectedCourier) return;
                setSubmitting(true);
                try {
                  await ordersApi.ship(order.id, selectedCourier, trackingInput);
                  setShowShipModal(false);
                  await refresh();
                } catch {
                  Alert.alert('Error', 'Failed to save tracking. Try again.');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Confirm Shipment</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showDisputeModal} transparent animationType="slide" onRequestClose={() => setShowDisputeModal(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDisputeModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Report an Issue</Text>
              <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                Describe the problem. Our team reviews within 3–5 business days.
              </Text>
            </View>
            <TextInput
              style={{
                backgroundColor: '#1F2937', borderRadius: 12,
                borderWidth: 1, borderColor: disputeReason ? '#EF4444' : '#374151',
                paddingHorizontal: 14, paddingVertical: 14,
                color: '#fff', fontSize: 14, minHeight: 120,
                marginBottom: 20, textAlignVertical: 'top',
              }}
              placeholder="e.g. Wrong item received, item damaged, empty box..."
              placeholderTextColor="#4B5563"
              value={disputeReason}
              onChangeText={setDisputeReason}
              multiline
            />
            <TouchableOpacity
              style={{
                backgroundColor: disputeReason.trim().length > 10 && !submitting ? '#EF4444' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              disabled={disputeReason.trim().length <= 10 || submitting}
              onPress={async () => {
                setSubmitting(true);
                try {
                  await ordersApi.dispute(order.id, disputeReason.trim());
                  setShowDisputeModal(false);
                  await refresh();
                } catch {
                  Alert.alert('Error', 'Failed to submit dispute. Try again.');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Submit Report</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
