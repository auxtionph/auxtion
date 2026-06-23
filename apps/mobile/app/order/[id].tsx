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
  Modal,
  KeyboardAvoidingView,
  TextInput,
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
  paymentReference?: string;
  paymentProofUrl?: string;
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

// Fuzzy name match — checks if any word in gcash name appears in seller display name
const namesSeem = (gcashName: string, sellerName: string): boolean => {
  if (!gcashName || !sellerName) return true; // can't check, don't warn
  const gcashWords = gcashName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const sellerLower = sellerName.toLowerCase();
  return gcashWords.some(word => sellerLower.includes(word));
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [sellerPaymentInfo, setSellerPaymentInfo] = useState<{
    gcash: { number: string; name: string } | null;
    bank: { name: string; accountNumber: string; accountName: string } | null;
  } | null>(null);
  const [loadingPaymentInfo, setLoadingPaymentInfo] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [submittingRef, setSubmittingRef] = useState(false);
  const [verifiedName, setVerifiedName] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [proofUrl, setProofUrl] = useState<string>('');
  const [uploadingProof, setUploadingProof] = useState(false);

  const handlePickScreenshot = async () => {
    try {
      const { status } = await import('expo-image-picker').then(m =>
        m.requestMediaLibraryPermissionsAsync()
      );
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo access to attach a screenshot.');
        return;
      }
      const result = await (await import('expo-image-picker')).launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: false,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploadingProof(true);
      const { uploadPhotoToCloudinary } = await import('../../src/lib/cloudinary');
      const uploaded = await uploadPhotoToCloudinary(result.assets[0].uri, 'payment-proof');
      setProofUrl(uploaded.url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload screenshot. Try again.');
    } finally {
      setUploadingProof(false);
    }
  };
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const countdown = (() => {
    if (!order?.paymentDeadline) return null;
    if (order.status !== 'PENDING_PAYMENT') return null;
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

  const isPendingPayment = order.status === 'PENDING_PAYMENT';
  const isPendingManual = order.status === 'PENDING_MANUAL_PAYMENT';
  const isDelivered = order.status === 'DELIVERED';
  const hasCTA = isPendingPayment || isPendingManual || isDelivered;

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
          paddingBottom: hasCTA ? insets.bottom + 220 : insets.bottom + 32,
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

      {/* Pay Now CTA — PayMongo (swipe auction only) */}
      {isPendingPayment && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16,
          backgroundColor: '#0D1117',
          borderTopWidth: 1, borderColor: '#1F2937',
        }}>
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

      {/* Chat Bid Payment CTA — manual GCash/bank */}
      {isPendingManual && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16,
          backgroundColor: '#0D1117',
          borderTopWidth: 1, borderColor: '#1F2937',
        }}>
          {order.paymentReference || order.paymentProofUrl ? (
            // ── Proof already submitted ──────────────────────────────
            <>
              <View style={{
                backgroundColor: 'rgba(16,185,129,0.1)',
                borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
                borderRadius: 12, padding: 14, marginBottom: 12,
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              }}>
                <Text style={{ fontSize: 20 }}>✅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                    Proof submitted — waiting for seller
                  </Text>
                  {order.paymentReference && (
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      Ref: <Text style={{ color: '#fff', fontWeight: '600' }}>{order.paymentReference}</Text>
                    </Text>
                  )}
                  {order.paymentProofUrl && (
                    <TouchableOpacity
                      style={{ marginTop: 8 }}
                      onPress={() => setViewingProof(true)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: order.paymentProofUrl }}
                        style={{ width: '100%', height: 100, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' }}
                        resizeMode="cover"
                      />
                      <View style={{
                        position: 'absolute', bottom: 6, left: 8,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>📸 Tap to view full screen</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={{
                backgroundColor: '#1F2937',
                borderRadius: 16, paddingVertical: 14,
                alignItems: 'center', gap: 2,
              }}>
                <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 14 }}>
                  Waiting for {order.seller.displayName} to confirm
                </Text>
                <Text style={{ color: '#4B5563', fontSize: 12 }}>
                  You'll be notified once payment is received
                </Text>
              </View>
            </>
          ) : (
            // ── Not yet submitted ────────────────────────────────────
            <>
              <View style={{
                backgroundColor: 'rgba(124,58,237,0.1)',
                borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
                borderRadius: 12, padding: 14, marginBottom: 12,
              }}>
                <Text style={{ color: '#A78BFA', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                  💬 Chat Bid — Manual Payment
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 12, lineHeight: 18 }}>
                  Send {formatPHP(order.amount)} to the seller via GCash or bank transfer, then share your proof.
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: '#7C3AED',
                  borderRadius: 16, paddingVertical: 16,
                  alignItems: 'center',
                }}
                onPress={async () => {
                  setShowPaymentSheet(true);
                  setLoadingPaymentInfo(true);
                  setPaymentReference('');
                  setPaymentMethod('');
                  setProofUrl('');
                  setVerifiedName(false);
                  try {
                    const res = await apiClient.get(`/sellers/${order.seller.id}/payment-info`);
                    setSellerPaymentInfo(res.data.data as typeof sellerPaymentInfo);
                  } catch {
                    // show sheet anyway
                  } finally {
                    setLoadingPaymentInfo(false);
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  View Payment Details
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
                  Get seller's GCash / bank info
                </Text>
              </TouchableOpacity>
            </>
          )}
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
    {/* ── Chat Bid Payment Sheet ── */}
      <Modal
        visible={showPaymentSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentSheet(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setShowPaymentSheet(false)}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: insets.bottom + 24,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ fontSize: 28, marginBottom: 8 }}>💬</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
                Send Payment
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>
                {order?.item.title} — {formatPHP(order?.amount ?? 0)}
              </Text>
            </View>

            {loadingPaymentInfo ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color="#7C3AED" />
              </View>
            ) : (
              <View style={{ gap: 12, marginBottom: 16 }}>
                {/* Seller identity banner */}
                <View style={{
                  backgroundColor: 'rgba(124,58,237,0.08)',
                  borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)',
                  borderRadius: 12, padding: 12,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: '#7C3AED',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                      {order?.seller.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700' }}>SENDING TO</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                      {order?.seller.displayName}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18 }}>🔒</Text>
                </View>

                {/* Name mismatch warning */}
                {sellerPaymentInfo?.gcash && !namesSeem(sellerPaymentInfo.gcash.name, order?.seller.displayName ?? '') && (
                  <View style={{
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                    borderRadius: 12, padding: 12,
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                  }}>
                    <Text style={{ fontSize: 16 }}>⚠️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 12, marginBottom: 2 }}>
                        Name mismatch detected
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 16 }}>
                        The GCash account name doesn't match the seller's profile name. Verify carefully before sending.
                      </Text>
                    </View>
                  </View>
                )}

                {sellerPaymentInfo?.gcash && (
                  <View style={{
                    backgroundColor: '#1F2937', borderRadius: 14,
                    borderWidth: 1, borderColor: 'rgba(26,86,219,0.3)', padding: 16,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Text style={{ fontSize: 20 }}>📱</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>GCash</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Number</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.gcash.number}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Name</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.gcash.name}</Text>
                    </View>
                  </View>
                )}
                {sellerPaymentInfo?.bank && (
                  <View style={{
                    backgroundColor: '#1F2937', borderRadius: 14,
                    borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', padding: 16,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Text style={{ fontSize: 20 }}>🏦</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{sellerPaymentInfo.bank.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Account Number</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.bank.accountNumber}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Account Name</Text>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.bank.accountName}</Text>
                    </View>
                  </View>
                )}
                {!sellerPaymentInfo?.gcash && !sellerPaymentInfo?.bank && (
                  <View style={{ backgroundColor: '#1F2937', borderRadius: 14, padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                      Seller hasn't added payment details yet.{'\n'}Contact them directly.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Payment method selector */}
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              PAID VIA
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {['GCash', 'Maya', 'BPI', 'BDO', 'Metrobank', 'UnionBank', 'Bank Transfer', 'Other'].map(method => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setPaymentMethod(method)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: paymentMethod === method ? '#7C3AED' : '#1F2937',
                    borderWidth: 1,
                    borderColor: paymentMethod === method ? '#7C3AED' : '#374151',
                  }}
                >
                  <Text style={{
                    color: paymentMethod === method ? '#fff' : '#9CA3AF',
                    fontSize: 13, fontWeight: '600',
                  }}>
                    {method}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Reference number */}
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              REFERENCE NUMBER
            </Text>
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              borderWidth: 1, borderColor: paymentReference ? '#7C3AED' : '#374151',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, marginBottom: 12,
            }}>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 }}
                placeholder="e.g. 1234567890"
                placeholderTextColor="#4B5563"
                value={paymentReference}
                onChangeText={setPaymentReference}
                autoCapitalize="none"
                keyboardType="default"
              />
            </View>
            {/* Screenshot proof */}
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              PAYMENT SCREENSHOT (OPTIONAL)
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#1F2937',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: proofUrl ? '#7C3AED' : '#374151',
                borderStyle: proofUrl ? 'solid' : 'dashed',
                overflow: 'hidden',
                marginBottom: 12,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 80,
              }}
              onPress={() => void handlePickScreenshot()}
              disabled={uploadingProof}
            >
              {uploadingProof ? (
                <View style={{ padding: 20, alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color="#7C3AED" />
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>Uploading...</Text>
                </View>
              ) : proofUrl ? (
                <View style={{ width: '100%' }}>
                  <Image
                    source={{ uri: proofUrl }}
                    style={{ width: '100%', height: 160, borderRadius: 14 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      borderRadius: 999, width: 28, height: 28,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                    onPress={() => setProofUrl('')}
                  >
                    <Text style={{ color: '#fff', fontSize: 12 }}>✕</Text>
                  </TouchableOpacity>
                  <View style={{
                    position: 'absolute', bottom: 8, left: 8,
                    backgroundColor: 'rgba(124,58,237,0.9)',
                    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓ Screenshot attached</Text>
                  </View>
                </View>
              ) : (
                <View style={{ padding: 20, alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 28 }}>📸</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '600' }}>
                    Tap to attach GCash / bank screenshot
                  </Text>
                  <Text style={{ color: '#4B5563', fontSize: 11 }}>
                    JPG or PNG · max 5MB
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Verification checkbox */}
            {(sellerPaymentInfo?.gcash || sellerPaymentInfo?.bank) && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  marginBottom: 12, paddingHorizontal: 2,
                }}
                onPress={() => setVerifiedName(prev => !prev)}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6,
                  borderWidth: 2,
                  borderColor: verifiedName ? '#7C3AED' : '#374151',
                  backgroundColor: verifiedName ? '#7C3AED' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {verifiedName && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={{ color: '#9CA3AF', fontSize: 12, flex: 1, lineHeight: 18 }}>
                  I have verified the account name matches the seller before sending payment
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{
                backgroundColor: (paymentReference.trim() || proofUrl) && paymentMethod && verifiedName ? '#7C3AED' : '#374151',
                borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', marginBottom: 10,
                opacity: submittingRef ? 0.6 : 1,
              }}
              disabled={(!paymentReference.trim() && !proofUrl) || !paymentMethod || submittingRef || uploadingProof || !verifiedName}
              onPress={async () => {
                if (!order || !paymentReference.trim()) return;
                setSubmittingRef(true);
                try {
                  const fullRef = paymentMethod
                    ? `[${paymentMethod}] ${paymentReference.trim()}`
                    : paymentReference.trim();
                  await apiClient.patch(`/orders/${order.id}/payment-reference`, {
                    reference: fullRef || undefined,
                    proofUrl: proofUrl || undefined,
                  });
                  setShowPaymentSheet(false);
                  setPaymentReference('');
                  Alert.alert('✅ Sent!', 'Your reference number has been sent to the seller.');
                  void fetchOrder();
                } catch {
                  Alert.alert('Error', 'Failed to submit. Try again.');
                } finally {
                  setSubmittingRef(false);
                }
              }}
            >
              {submittingRef ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {!paymentMethod ? 'Select payment method above'
                    : !paymentReference.trim() && !proofUrl ? 'Add reference number or screenshot'
                    : 'Submit Proof'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 10, alignItems: 'center' }}
              onPress={() => setShowPaymentSheet(false)}
            >
              <Text style={{ color: '#6B7280', fontSize: 13 }}>I'll do this later</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    {/* ── Proof Full-screen Viewer ── */}
      <Modal visible={viewingProof} transparent animationType="fade" onRequestClose={() => setViewingProof(false)} statusBarTranslucent>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => setViewingProof(false)}
        >
          <TouchableOpacity
            style={{
              position: 'absolute', top: insets.top + 16, right: 16,
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }}
            onPress={() => setViewingProof(false)}
          >
            <Text style={{ color: '#fff', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
          <View style={{ position: 'absolute', top: insets.top + 16, left: 16, zIndex: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>📸 Payment Proof</Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Tap anywhere to close</Text>
          </View>
          {order?.paymentProofUrl && (
            <Image source={{ uri: order.paymentProofUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}