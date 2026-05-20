import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';

interface OrderDetail {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  courier?: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  autoConfirmAt?: string;
  cancelReason?: string;
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

const STATUS_STEPS = [
  { key: 'PENDING_PAYMENT', label: 'Payment Pending', icon: '💳' },
  { key: 'PAID', label: 'Payment Received', icon: '✅' },
  { key: 'SHIPPED', label: 'Shipped', icon: '📦' },
  { key: 'DELIVERED', label: 'Delivered', icon: '🏠' },
  { key: 'COMPLETED', label: 'Completed', icon: '🎉' },
];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void fetchOrder();
  }, [id]);

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
              Alert.alert('Error', 'Failed to confirm receipt');
            } finally {
              setConfirming(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#1E2A3A] items-center justify-center">
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (!order) return null;

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);

  return (
    <View className="flex-1 bg-[#1E2A3A]">
      {/* Header */}
      <View className="pt-14 px-6 pb-4 flex-row items-center gap-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">←</Text>
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg flex-1">Order Details</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-6">

          {/* Order Status Progress */}
          {order.status !== 'CANCELLED' && (
            <View className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
              <Text className="text-white font-bold text-base mb-4">Order Status</Text>
              {STATUS_STEPS.map((step, index) => {
                const isDone = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                return (
                  <View key={step.key} className="flex-row items-start gap-3 mb-3">
                    <View className="items-center">
                      <View className={`w-8 h-8 rounded-full items-center justify-center ${
                        isDone ? 'bg-[#1A56DB]' : 'bg-gray-800'
                      }`}>
                        <Text className="text-sm">{isDone ? step.icon : '○'}</Text>
                      </View>
                      {index < STATUS_STEPS.length - 1 && (
                        <View className={`w-0.5 h-6 mt-1 ${isDone ? 'bg-[#1A56DB]' : 'bg-gray-700'}`} />
                      )}
                    </View>
                    <View className="flex-1 pt-1">
                      <Text className={`text-sm font-semibold ${
                        isCurrent ? 'text-white' : isDone ? 'text-gray-300' : 'text-gray-600'
                      }`}>
                        {step.label}
                      </Text>
                      {isCurrent && (
                        <Text className="text-[#1A56DB] text-xs mt-0.5">Current status</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Cancelled state */}
          {order.status === 'CANCELLED' && (
            <View className="bg-red-900/30 border border-red-800 rounded-2xl p-4 mb-4">
              <Text className="text-red-400 font-bold mb-1">Order Cancelled</Text>
              {order.cancelReason && (
                <Text className="text-red-300 text-sm">{order.cancelReason}</Text>
              )}
            </View>
          )}

          {/* Item Info */}
          <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
            <Text className="text-gray-500 text-xs mb-2">ITEM</Text>
            <Text className="text-white font-bold text-base mb-1">{order.item.title}</Text>
            <Text className="text-[#F59E0B] font-bold text-lg">{formatPHP(order.amount)}</Text>
          </View>

          {/* Seller Info */}
          <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-[#1A56DB] items-center justify-center">
              <Text className="text-white font-bold">
                {order.seller.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text className="text-gray-500 text-xs">Seller</Text>
              <Text className="text-white font-semibold">{order.seller.displayName}</Text>
            </View>
          </View>

          {/* Shipping Info */}
          {order.trackingNumber && (
            <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
              <Text className="text-gray-500 text-xs mb-2">SHIPPING</Text>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-gray-400 text-sm">Courier</Text>
                <Text className="text-white text-sm font-semibold">{order.courier}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-400 text-sm">Tracking</Text>
                <Text className="text-[#1A56DB] text-sm font-semibold">{order.trackingNumber}</Text>
              </View>
              {order.autoConfirmAt && order.status === 'SHIPPED' && (
                <View className="mt-3 pt-3 border-t border-gray-800">
                  <Text className="text-gray-600 text-xs">
                    Auto-confirms on {new Date(order.autoConfirmAt).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Order ID */}
          <View className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
            <Text className="text-gray-500 text-xs mb-1">ORDER ID</Text>
            <Text className="text-gray-400 text-xs font-mono">{order.id}</Text>
            <Text className="text-gray-500 text-xs mt-2">
              Placed {new Date(order.createdAt).toLocaleDateString('en-PH', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          <View className="h-32" />
        </View>
      </ScrollView>

      {/* Confirm Receipt CTA */}
      {order.status === 'SHIPPED' && (
        <View className="absolute bottom-0 left-0 right-0 px-6 pb-10 pt-4 bg-[#1E2A3A] border-t border-gray-800">
          <TouchableOpacity
            className={`bg-green-600 rounded-2xl py-4 items-center ${confirming ? 'opacity-60' : ''}`}
            onPress={handleConfirmReceipt}
            disabled={confirming}
          >
            {confirming ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text className="text-white font-bold text-base">✅ Confirm Receipt</Text>
                <Text className="text-green-200 text-xs mt-0.5">
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