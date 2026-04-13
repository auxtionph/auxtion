import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';

export default function SellScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSeller = user?.role === 'SELLER';
  const [loading, setLoading] = useState(false);

  const handleGoLive = async () => {
    setLoading(true);
    try {
      // Create auction
      const auctionRes = await apiClient.post('/auctions', {
        title: `${user?.displayName ?? 'Seller'}'s Live Auction`,
        startTime: new Date().toISOString(),
      });
      const auctionId = (auctionRes.data.data as { id: string }).id;

      // Go live — creates 100ms room
      await apiClient.patch(`/auctions/${auctionId}/go-live`);

      // Navigate directly to live room as broadcaster
      router.push(`/auction/${auctionId}/live?role=broadcaster`);
    } catch {
      Alert.alert('Error', 'Failed to start live auction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isSeller) {
    return (
      <View className="flex-1 bg-[#1E2A3A] pt-14 px-6">
        <Text className="text-white text-2xl font-bold mb-2">Sell</Text>
        <Text className="text-gray-500 text-sm mb-8">
          Manage your auctions and shop
        </Text>

        <TouchableOpacity
          className={`bg-[#1A56DB] rounded-2xl p-6 mb-4 flex-row items-center gap-4 ${loading ? 'opacity-60' : ''}`}
          onPress={() => void handleGoLive()}
          disabled={loading}
        >
          <Text className="text-4xl">🔴</Text>
          <View className="flex-1">
            <Text className="text-white font-bold text-lg">Go Live</Text>
            <Text className="text-blue-200 text-sm">
              Start a live auction stream
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white text-xl">→</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex-row items-center gap-4"
          onPress={() => router.push('/auction/create')}
        >
          <Text className="text-4xl">🏷️</Text>
          <View className="flex-1">
            <Text className="text-white font-bold text-lg">Create Auction</Text>
            <Text className="text-gray-400 text-sm">
              Set up an auction room and add items
            </Text>
          </View>
          <Text className="text-gray-400 text-xl">→</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#1E2A3A]" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 pt-14 px-6 pb-10">
        <Text className="text-white text-2xl font-bold mb-2">Become a Seller</Text>
        <Text className="text-gray-500 text-sm mb-8">
          Apply to sell on Auxtion and reach thousands of buyers
        </Text>
        {[
          { icon: '🔴', title: 'Go Live & Sell', desc: 'Host live auction streams and sell items in real-time' },
          { icon: '💰', title: 'Earn Money', desc: 'Get paid directly to your GCash or bank account' },
          { icon: '🛍️', title: 'Manage Your Shop', desc: 'List items with Buy Now pricing or auction format' },
          { icon: '⭐', title: 'Build Your Brand', desc: 'Grow your follower base and get repeat buyers' },
        ].map(({ icon, title, desc }) => (
          <View key={title} className="flex-row items-start gap-4 mb-6">
            <Text className="text-3xl">{icon}</Text>
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{title}</Text>
              <Text className="text-gray-500 text-sm">{desc}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity
          className="bg-[#1A56DB] rounded-2xl py-5 items-center mt-4"
          onPress={() => router.push('/seller-application')}
        >
          <Text className="text-white font-bold text-base">Apply to Sell</Text>
          <Text className="text-blue-200 text-xs mt-1">
            Free to apply • Admin reviews within 48 hours
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}