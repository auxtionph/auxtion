import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';
import { SymbolView, SFSymbol } from 'expo-symbols';

function Icon({ symbol, fallback, size = 16, tint = '#fff' }: {
  symbol: SFSymbol; fallback: string; size?: number; tint?: string;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={symbol} size={size} tintColor={tint} weight="semibold" />;
  }
  return <Text style={{ fontSize: size - 2, color: tint }}>{fallback}</Text>;
}

interface OrderDetail {
  id: string;
  amount: number;
  status: string;
  mode?: string;
  createdAt: string;
  courier?: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  autoConfirmAt?: string;
  paymentDeadline?: string;
  cancelReason?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingLine1?: string;
  shippingCity?: string;
  shippingProvince?: string;
  shippingPostalCode?: string;
  item: {
    id: string;
    title: string;
    description: string;
    photos: { url: string; publicId: string; width?: number; height?: number }[];
  };
  seller: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  buyer: {
    id: string;
    displayName: string;
  };
  payment?: {
    status: string;
    paymongoRef?: string;
  };
}

const STATUS_STEPS: {
  key: string;
  label: string;
  sub: string;
  icon: SFSymbol;
  fallback: string;
  color: string;
}[] = [
  { key: 'PENDING_PAYMENT',        label: 'Awaiting Payment',  sub: 'Pay to confirm your order',           icon: 'creditcard.fill',      fallback: '💳', color: '#F59E0B' },
  { key: 'PENDING_MANUAL_PAYMENT', label: 'Awaiting GCash',    sub: 'Send payment to seller',              icon: 'creditcard.fill',      fallback: '💳', color: '#F59E0B' },
  { key: 'PAID',                   label: 'Payment Received',  sub: 'Seller is preparing your item',       icon: 'checkmark.seal.fill',  fallback: '✅', color: '#3B82F6' },
  { key: 'SHIPPED',                label: 'Shipped',           sub: 'Your item is on its way',             icon: 'shippingbox.fill',     fallback: '📦', color: '#8B5CF6' },
  { key: 'DELIVERED',              label: 'Delivered',         sub: 'Confirm you received your item',      icon: 'house.fill',           fallback: '🏠', color: '#10B981' },
  { key: 'COMPLETED',              label: 'Completed',         sub: 'Order complete. Enjoy your item!',    icon: 'party.popper.fill',    fallback: '🎉', color: '#059669' },
];

const COURIER_LABELS: Record<string, string> = {
  JT_EXPRESS:    'J&T Express',
  LBC:           'LBC',
  NINJA_VAN:     'Ninja Van',
  FLASH_EXPRESS: 'Flash Express',
  GRAB_EXPRESS:  'Grab Express',
  OTHER:         'Other',
};

const COURIER_URLS: Record<string, (tracking: string) => string> = {
  JT_EXPRESS:    t => `https://www.jtexpress.ph/trajectoryQuery?bills=${t}`,
  LBC:           t => `https://www.lbcexpress.com/track/?tracking_no=${t}`,
  NINJA_VAN:     t => `https://www.ninjavan.co/en-ph/tracking?id=${t}`,
  FLASH_EXPRESS: t => `https://www.flashexpress.ph/tracking/?se=${t}`,
  GRAB_EXPRESS:  _t => `https://food.grab.com/ph/en/`,
  OTHER:         t => `https://track.aftership.com/${t}`,
};

const MODE_LABELS: Record<string, string> = {
  auction: 'Swipe Auction',
  chat:    'Chat Bid',
  buynow:  'Buy Now',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const countdown = (() => {
    if (!order?.paymentDeadline) return null;
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PENDING_MANUAL_PAYMENT') return null;
    const diffMs = new Date(order.paymentDeadline).getTime() - now;
    if (diffMs <= 0) return { label: 'EXPIRED', urgent: true, expired: true };
    const totalSec = Math.floor(diffMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return {
      label: `${min}:${sec.toString().padStart(2, '0')}`,
      urgent: totalSec <= 300,
      expired: false,
    };
  })();

  useEffect(() => { void fetchOrder(); }, [id]);

  const fetchOrder = async () => {
    try {
      const response = await apiClient.get(`/orders/${id}`);
      setOrder(response.data.data as OrderDetail);
    } catch {
      Alert.alert('Error', 'Failed to load order');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async () => {
    setPaying(true);
    try {
      const res = await apiClient.post(`/payments/${id}/initiate`);
      const { checkoutUrl } = res.data.data as { checkoutUrl: string };
      await Linking.openURL(checkoutUrl);
      setTimeout(() => void fetchOrder(), 3000);
    } catch {
      Alert.alert('Error', 'Failed to initiate payment. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const handleConfirmReceipt = () => {
    Alert.alert(
      'Confirm Receipt',
      'Have you received your item? This will release payment to the seller.',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, I received it',
          onPress: async () => {
            setConfirming(true);
            try {
              await apiClient.patch(`/orders/${id}/confirm-receipt`);
              Alert.alert('✅ Confirmed!', 'Payment will be released to the seller.');
              void fetchOrder();
            } catch {
              Alert.alert('Error', 'Failed to confirm receipt. Try again.');
            } finally {
              setConfirming(false);
            }
          },
        },
      ],
    );
  };

  const handleTrackPackage = () => {
    if (!order?.trackingNumber || !order?.courier) return;
    const urlFn = COURIER_URLS[order.courier] ?? COURIER_URLS.OTHER;
    void Linking.openURL(urlFn(order.trackingNumber));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (!order) return null;

  const isPendingPayment = order.status === 'PENDING_PAYMENT' || order.status === 'PENDING_MANUAL_PAYMENT';
  const isDelivered = order.status === 'DELIVERED';
  const hasCTA = isPendingPayment || isDelivered;

  // Build stepper — collapse PENDING_PAYMENT and PENDING_MANUAL_PAYMENT into one
  const steps = order.status === 'PENDING_MANUAL_PAYMENT'
    ? STATUS_STEPS.filter(s => s.key !== 'PENDING_PAYMENT')
    : STATUS_STEPS.filter(s => s.key !== 'PENDING_MANUAL_PAYMENT');

  const currentStepIndex = steps.findIndex(s => s.key === order.status);

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20, paddingBottom: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: 1, borderColor: '#1F2937',
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: '#1F2937',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon symbol="chevron.left" fallback="←" size={16} tint="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18, flex: 1 }}>
          Order Details
        </Text>
        <Text style={{ color: '#4B5563', fontSize: 11, fontFamily: 'monospace' }}>
          #{order.id.slice(-6).toUpperCase()}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: hasCTA ? insets.bottom + 100 : insets.bottom + 32,
        }}
      >
        {/* Item photo + title hero */}
        <View style={{
          backgroundColor: '#111827',
          borderRadius: 16, overflow: 'hidden',
          borderWidth: 1, borderColor: '#1F2937',
          marginBottom: 16,
        }}>
          {order.item.photos[0]?.url ? (
            <Image
              source={{ uri: order.item.photos[0].url }}
              style={{ width: '100%', height: 200 }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ width: '100%', height: 160, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' }}>
              <Icon symbol="shippingbox.fill" fallback="📦" size={48} tint="#374151" />
            </View>
          )}
          <View style={{ padding: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18, marginBottom: 4 }}>
              {order.item.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 22 }}>
                {formatPHP(order.amount)}
              </Text>
              {order.mode && (
                <View style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '600' }}>
                    {MODE_LABELS[order.mode] ?? order.mode}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Status stepper */}
        {order.status !== 'CANCELLED' && (
          <View style={{
            backgroundColor: '#111827',
            borderRadius: 16, padding: 20,
            borderWidth: 1, borderColor: '#1F2937',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 16, letterSpacing: 0.5 }}>
              ORDER PROGRESS
            </Text>
            {steps.map((step, index) => {
              const isDone = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isLast = index === steps.length - 1;
              return (
                <View key={step.key} style={{ flexDirection: 'row', gap: 14 }}>
                  {/* Timeline */}
                  <View style={{ alignItems: 'center', width: 32 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: isDone ? step.color : '#1F2937',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: isCurrent ? 2 : 0,
                      borderColor: isCurrent ? step.color : 'transparent',
                    }}>
                      {isDone ? (
                        <Icon symbol={step.icon} fallback={step.fallback} size={14} tint="#fff" />
                      ) : (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#374151' }} />
                      )}
                    </View>
                    {!isLast && (
                      <View style={{
                        width: 2, flex: 1, minHeight: 20,
                        backgroundColor: isDone ? step.color : '#1F2937',
                        marginVertical: 4,
                      }} />
                    )}
                  </View>
                  {/* Label */}
                  <View style={{ flex: 1, paddingTop: 6, paddingBottom: isLast ? 0 : 16 }}>
                    <Text style={{
                      color: isCurrent ? '#fff' : isDone ? '#D1D5DB' : '#4B5563',
                      fontWeight: isCurrent ? '700' : '600',
                      fontSize: 14,
                    }}>
                      {step.label}
                    </Text>
                    {isCurrent && (
                      <Text style={{ color: step.color, fontSize: 11, marginTop: 2 }}>
                        {step.sub}
                      </Text>
                    )}
                    {isCurrent && step.key === 'DELIVERED' && order.autoConfirmAt && (
                      <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                        Auto-completes {new Date(order.autoConfirmAt).toLocaleDateString('en-PH', {
                          month: 'short', day: 'numeric',
                        })} if not confirmed
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Cancelled */}
        {order.status === 'CANCELLED' && (
          <View style={{
            backgroundColor: 'rgba(220,38,38,0.1)',
            borderWidth: 1, borderColor: 'rgba(220,38,38,0.3)',
            borderRadius: 16, padding: 16, marginBottom: 16,
          }}>
            <Text style={{ color: '#F87171', fontWeight: '700', fontSize: 14, marginBottom: 4 }}>
              Order Cancelled
            </Text>
            {order.cancelReason && (
              <Text style={{ color: '#FCA5A5', fontSize: 13 }}>{order.cancelReason}</Text>
            )}
          </View>
        )}

        {/* Seller */}
        <View style={{
          backgroundColor: '#111827',
          borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: '#1F2937',
          flexDirection: 'row', alignItems: 'center', gap: 12,
          marginBottom: 16,
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: '#1A56DB',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>
              {order.seller.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600' }}>SELLER</Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginTop: 2 }}>
              {order.seller.displayName}
            </Text>
          </View>
          <Icon symbol="chevron.right" fallback="›" size={16} tint="#4B5563" />
        </View>

        {/* Shipping info */}
        {order.trackingNumber && (
          <View style={{
            backgroundColor: '#111827',
            borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: '#1F2937',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 12 }}>
              SHIPPING
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Courier</Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                {COURIER_LABELS[order.courier ?? 'OTHER'] ?? order.courier}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Tracking #</Text>
              <Text style={{ color: '#60A5FA', fontSize: 13, fontWeight: '700' }}>
                {order.trackingNumber}
              </Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
                borderRadius: 12, paddingVertical: 12,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onPress={handleTrackPackage}
            >
              <Icon symbol="location.fill" fallback="📍" size={14} tint="#60A5FA" />
              <Text style={{ color: '#60A5FA', fontWeight: '700', fontSize: 14 }}>
                Track Package
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Shipping address */}
        {order.shippingName && (
          <View style={{
            backgroundColor: '#111827',
            borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: '#1F2937',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 12 }}>
              SHIP TO
            </Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{order.shippingName}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 2 }}>{order.shippingPhone}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 2 }}>
              {order.shippingLine1}, {order.shippingCity}, {order.shippingProvince} {order.shippingPostalCode}
            </Text>
          </View>
        )}

        {/* Order meta */}
        <View style={{
          backgroundColor: '#111827',
          borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: '#1F2937',
        }}>
          <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 12 }}>
            ORDER INFO
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Order ID</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, fontFamily: 'monospace' }}>
              #{order.id.slice(-8).toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Placed on</Text>
            <Text style={{ color: '#fff', fontSize: 13 }}>
              {new Date(order.createdAt).toLocaleDateString('en-PH', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>
          {order.mode && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Won via</Text>
              <Text style={{ color: '#fff', fontSize: 13 }}>
                {MODE_LABELS[order.mode] ?? order.mode}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pay Now CTA */}
      {isPendingPayment && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16,
          backgroundColor: '#0D1117',
          borderTopWidth: 1, borderColor: '#1F2937',
        }}>
          {/* Countdown banner */}
          {countdown && (
            <View style={{
              backgroundColor: countdown.expired
                ? 'rgba(107,114,128,0.15)'
                : countdown.urgent
                  ? 'rgba(220,38,38,0.15)'
                  : 'rgba(245,158,11,0.12)',
              borderWidth: 1,
              borderColor: countdown.expired
                ? 'rgba(107,114,128,0.4)'
                : countdown.urgent
                  ? 'rgba(220,38,38,0.5)'
                  : 'rgba(245,158,11,0.4)',
              borderRadius: 12,
              paddingVertical: 10, paddingHorizontal: 14,
              marginBottom: 10,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Icon
                symbol={countdown.expired ? 'xmark.circle.fill' : 'clock.fill'}
                fallback={countdown.expired ? '✕' : '⏱'}
                size={16}
                tint={countdown.expired ? '#9CA3AF' : countdown.urgent ? '#F87171' : '#F59E0B'}
              />
              <View style={{ flex: 1 }}>
                <Text style={{
                  color: countdown.expired ? '#9CA3AF' : countdown.urgent ? '#F87171' : '#F59E0B',
                  fontSize: 13, fontWeight: '700',
                }}>
                  {countdown.expired
                    ? 'Payment window expired'
                    : countdown.urgent
                      ? `Pay within ${countdown.label} or order is cancelled`
                      : `Pay within ${countdown.label}`}
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 1 }}>
                  {countdown.expired
                    ? 'This order has been cancelled. The item may be relisted.'
                    : 'Unpaid orders are auto-cancelled and the item is relisted.'}
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={{
              backgroundColor: countdown?.expired ? '#374151' : '#1A56DB',
              borderRadius: 16, paddingVertical: 16,
              alignItems: 'center',
              opacity: paying || countdown?.expired ? 0.6 : 1,
            }}
            onPress={() => void handlePayNow()}
            disabled={paying || countdown?.expired}
          >
            {paying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  {countdown?.expired ? 'Order expired' : `Pay ${formatPHP(order.amount)}`}
                </Text>
                {!countdown?.expired && (
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
                    via GCash / QR Ph / Card
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Confirm Receipt CTA */}
      {isDelivered && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16,
          backgroundColor: '#0D1117',
          borderTopWidth: 1, borderColor: '#1F2937',
        }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#10B981',
              borderRadius: 16, paddingVertical: 16,
              alignItems: 'center',
              opacity: confirming ? 0.6 : 1,
            }}
            onPress={handleConfirmReceipt}
            disabled={confirming}
          >
            {confirming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  Confirm Receipt
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
                  Tap when you receive your item
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}