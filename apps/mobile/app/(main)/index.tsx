import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAuctionFeed } from '../../src/hooks/useAuction';
import { AuctionFeedItem } from '../../src/services/api/auctions.api';
import { formatPHP } from '@auxtion/utils';

function LiveBadge() {
  return (
    <View className="bg-red-600 rounded-full px-2 py-0.5 flex-row items-center gap-1">
      <View className="w-1.5 h-1.5 rounded-full bg-white" />
      <Text className="text-white text-xs font-bold">LIVE</Text>
    </View>
  );
}

function ScheduledBadge({ startTime }: { startTime: string }) {
  const date = new Date(startTime);
  const timeStr = date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
  const dateStr = date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
  return (
    <View className="bg-[#F59E0B] rounded-full px-2 py-0.5">
      <Text className="text-black text-xs font-bold">{dateStr} {timeStr}</Text>
    </View>
  );
}

function AuctionCard({ item, onPress }: { item: AuctionFeedItem; onPress: () => void }) {
  const firstItem = item.shopItems[0];
  const firstPhoto = firstItem?.photos?.[0];
  const lowestPrice = item.shopItems.length > 0
    ? Math.min(...item.shopItems.map(i => i.price))
    : 0;

  return (
    <TouchableOpacity
      className="bg-gray-900 rounded-2xl mb-4 overflow-hidden border border-gray-800"
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Thumbnail */}
      <View className="w-full h-48 bg-gray-800 items-center justify-center">
        {firstPhoto ? (
          <Image
            source={{ uri: firstPhoto }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <Text className="text-4xl">📦</Text>
        )}

        {/* Status Badge */}
        <View className="absolute top-3 left-3">
          {item.status === 'LIVE' ? (
            <LiveBadge />
          ) : (
            <ScheduledBadge startTime={item.startTime} />
          )}
        </View>

        {/* Item Count */}
        {item.shopItems.length > 0 && (
          <View className="absolute bottom-3 right-3 bg-black/70 rounded-full px-2 py-0.5">
            <Text className="text-white text-xs">
              {item.shopItems.length} item{item.shopItems.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View className="p-4">
        <Text className="text-white font-bold text-base mb-1" numberOfLines={1}>
          {item.title}
        </Text>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="w-6 h-6 rounded-full bg-[#1A56DB] items-center justify-center">
              <Text className="text-white text-xs font-bold">
                {item.seller.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text className="text-gray-400 text-sm">
              {item.seller.displayName}
            </Text>
          </View>

          {lowestPrice > 0 && (
            <Text className="text-[#F59E0B] font-semibold text-sm">
              Starts {formatPHP(lowestPrice)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyFeed() {
  return (
    <View className="flex-1 items-center justify-center py-20">
      <Text className="text-5xl mb-4">📭</Text>
      <Text className="text-white text-lg font-bold mb-2">No Auctions Yet</Text>
      <Text className="text-gray-500 text-sm text-center px-8">
        Check back soon for live auctions and upcoming sales.
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { feed, isLoading, error, refetch } = useAuctionFeed();
  const [refreshing, setRefreshing] = useState(false);

  const liveAuctions = feed.filter(a => a.status === 'LIVE');
  const scheduledAuctions = feed.filter(a => a.status === 'SCHEDULED');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading && feed.length === 0) {
    return (
      <View className="flex-1 bg-[#1E2A3A] items-center justify-center">
        <ActivityIndicator size="large" color="#1A56DB" />
        <Text className="text-gray-500 mt-4">Loading auctions...</Text>
      </View>
    );
  }

  if (error && feed.length === 0) {
    return (
      <View className="flex-1 bg-[#1E2A3A] items-center justify-center px-6">
        <Text className="text-4xl mb-4">⚠️</Text>
        <Text className="text-white text-lg font-bold mb-2">Connection Error</Text>
        <Text className="text-gray-500 text-sm text-center mb-6">{error}</Text>
        <TouchableOpacity
          className="bg-[#1A56DB] rounded-xl px-6 py-3"
          onPress={() => void refetch()}
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  type FeedSection =
  | { type: 'header'; id: string; title: string; count: number }
  | { type: 'auction'; id: string; auction: AuctionFeedItem };

    const sections: FeedSection[] = [
    ...(liveAuctions.length > 0 ? [{
        type: 'header' as const,
        id: 'live-header',
        title: '🔴 Live Now',
        count: liveAuctions.length,
    }] : []),
    ...liveAuctions.map(a => ({
        type: 'auction' as const,
        id: a.id,
        auction: a,
    })),
    ...(scheduledAuctions.length > 0 ? [{
        type: 'header' as const,
        id: 'scheduled-header',
        title: '⏰ Starting Soon',
        count: scheduledAuctions.length,
    }] : []),
    ...scheduledAuctions.map(a => ({
        type: 'auction' as const,
        id: a.id,
        auction: a,
    })),
    ];

  return (
    <View className="flex-1 bg-[#1E2A3A]">
      {/* Top Bar */}
      <View className="pt-14 pb-4 px-6 flex-row items-center justify-between">
        <Text className="text-white text-2xl font-bold">Auxtion</Text>
        <TouchableOpacity
          onPress={() => router.push('/explore')}
          className="bg-gray-800 rounded-full px-4 py-2"
        >
          <Text className="text-gray-400 text-sm">🔍 Search</Text>
        </TouchableOpacity>
      </View>

      {/* Feed */}
      <FlatList
        data={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#1A56DB"
          />
        }
        ListEmptyComponent={<EmptyFeed />}
        renderItem={({ item }) => {
            if (item.type === 'header') {
                return (
                <View className="flex-row items-center gap-2 mb-3 mt-2">
                    <Text className="text-white font-bold text-lg">{item.title}</Text>
                    <View className="bg-gray-700 rounded-full px-2 py-0.5">
                    <Text className="text-gray-300 text-xs">{item.count}</Text>
                    </View>
                </View>
                );
            }
            return (
                <AuctionCard
                item={item.auction}
                onPress={() => router.push(`/auction/${item.auction.id}`)}
                />
            );
        }}
      />
    </View>
  );
}