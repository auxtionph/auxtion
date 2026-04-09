import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { auctionsApi, AuctionDetail } from '../../src/services/api/auctions.api';
import { formatPHP } from '@auxtion/utils';

export default function AuctionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchAuction();
  }, [id]);

  useFocusEffect(useCallback(() => {
    void fetchAuction();
  }, [id]));

  const fetchAuction = async () => {
    try {
      setLoading(true);
      const data = await auctionsApi.getById(id);
      setAuction(data);
    } catch {
      setError('Failed to load auction');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#1E2A3A] items-center justify-center">
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (error || !auction) {
    return (
      <View className="flex-1 bg-[#1E2A3A] items-center justify-center px-6">
        <Text className="text-4xl mb-4">⚠️</Text>
        <Text className="text-white font-bold text-lg mb-2">Auction Not Found</Text>
        <TouchableOpacity
          className="bg-[#1A56DB] rounded-xl px-6 py-3 mt-4"
          onPress={() => router.back()}
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLive = auction.status === 'LIVE';
  const isScheduled = auction.status === 'SCHEDULED';

  return (
    <View className="flex-1 bg-[#1E2A3A]">
      {/* Header */}
      <View className="pt-14 px-6 pb-4 flex-row items-center gap-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">←</Text>
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg flex-1" numberOfLines={1}>
          {auction.title}
        </Text>
        {isLive && (
          <View className="bg-red-600 rounded-full px-3 py-1 flex-row items-center gap-1">
            <View className="w-1.5 h-1.5 rounded-full bg-white" />
            <Text className="text-white text-xs font-bold">LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Thumbnail */}
        <View className="w-full h-56 bg-gray-800 items-center justify-center">
          {auction.shopItems[0]?.photos?.[0] ? (
            <Image
              source={{ uri: auction.shopItems[0].photos[0] }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <Text className="text-6xl">📦</Text>
          )}
        </View>

        <View className="px-6 pt-6">

          {/* Seller Info */}
          <View className="flex-row items-center gap-3 mb-6 bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <View className="w-12 h-12 rounded-full bg-[#1A56DB] items-center justify-center">
              <Text className="text-white text-lg font-bold">
                {auction.seller.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-base">
                {auction.seller.displayName}
              </Text>
              <Text className="text-gray-500 text-sm">
                {auction.seller.sellerTier} Seller •{' '}
                {auction.seller.totalSales} sales
              </Text>
            </View>
            <TouchableOpacity className="bg-gray-800 rounded-full px-4 py-2">
              <Text className="text-white text-sm font-semibold">Follow</Text>
            </TouchableOpacity>
          </View>

          {/* Auction Info */}
          <View className="mb-6">
            <Text className="text-white font-bold text-xl mb-1">
              {auction.title}
            </Text>
            {isScheduled && (
              <Text className="text-[#F59E0B] text-sm">
                Starts{' '}
                {new Date(auction.startTime).toLocaleDateString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Manila',
                })}
              </Text>
            )}
          </View>

          {/* Items in Queue */}
          {auction.shopItems.length > 0 && (
            <View className="mb-6">
              <Text className="text-white font-bold text-base mb-3">
                Items ({auction.shopItems.length})
              </Text>
              {auction.shopItems.map((item, index) => (
                <View
                  key={item.id}
                  className="flex-row items-center gap-3 bg-gray-900 rounded-xl p-3 mb-2 border border-gray-800"
                >
                  <View className="w-12 h-12 rounded-xl bg-gray-800 items-center justify-center overflow-hidden">
                    {item.photos?.[0] ? (
                      <Image
                        source={{ uri: item.photos[0] }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <Text className="text-xl">📦</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-sm font-semibold" numberOfLines={1}>
                      {index + 1}. {item.title}
                    </Text>
                    <Text className="text-[#F59E0B] text-xs">
                      {formatPHP(item.price)}
                    </Text>
                  </View>
                  {item.status === 'LIVE' && (
                    <View className="bg-red-600 rounded-full px-2 py-0.5">
                      <Text className="text-white text-xs font-bold">NOW</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Recent Bids */}
          {auction.bids.length > 0 && (
            <View className="mb-6">
              <Text className="text-white font-bold text-base mb-3">
                Recent Bids
              </Text>
              {auction.bids.slice(0, 5).map((bid) => (
                <View
                  key={bid.id}
                  className="flex-row items-center justify-between py-3 border-b border-gray-800"
                >
                  <View className="flex-row items-center gap-2">
                    <View className="w-8 h-8 rounded-full bg-gray-700 items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {bid.bidder.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="text-gray-300 text-sm">
                      {bid.bidder.displayName}
                    </Text>
                  </View>
                  <Text className="text-[#F59E0B] font-semibold text-sm">
                    {formatPHP(bid.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View className="h-32" />
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View className="absolute bottom-0 left-0 right-0 px-6 pb-10 pt-4 bg-[#1E2A3A] border-t border-gray-800">
        {isLive ? (
          <TouchableOpacity
            className="bg-red-600 rounded-2xl py-5 items-center"
            onPress={() => router.push(`/auction/${id}/live`)}
          >
            <Text className="text-white font-bold text-lg">🔴 Join Live Auction</Text>
            <Text className="text-red-200 text-xs mt-1">Tap to watch and bid</Text>
          </TouchableOpacity>
        ) : isScheduled ? (
          <TouchableOpacity className="bg-[#F59E0B] rounded-2xl py-5 items-center">
            <Text className="text-black font-bold text-lg">⏰ Set Reminder</Text>
            <Text className="text-yellow-800 text-xs mt-1">
              Get notified when this goes live
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="bg-gray-800 rounded-2xl py-5 items-center">
            <Text className="text-gray-500 font-bold text-lg">Auction Ended</Text>
          </View>
        )}
      </View>
    </View>
  );
}