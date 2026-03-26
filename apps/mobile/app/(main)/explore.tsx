import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';
import { AuctionFeedItem } from '../../src/services/api/auctions.api';
import { formatPHP } from '@auxtion/utils';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3;

const CATEGORIES = [
  { id: 'fashion', label: "Men's Fashion", emoji: '👔', color: '#1A56DB' },
  { id: 'sneakers', label: 'Sneakers & Shoes', emoji: '👟', color: '#7C3AED' },
  { id: 'electronics', label: 'Electronics', emoji: '📱', color: '#059669' },
  { id: 'collectibles', label: 'Collectibles', emoji: '🏆', color: '#D97706' },
  { id: 'beauty', label: 'Beauty', emoji: '💄', color: '#DB2777' },
  { id: 'trading-cards', label: 'Trading Cards', emoji: '🃏', color: '#DC2626' },
  { id: 'jewelry', label: 'Jewelry & Watches', emoji: '💍', color: '#B45309' },
  { id: 'toys', label: 'Toys & Hobbies', emoji: '🧸', color: '#7C3AED' },
  { id: 'sports', label: 'Sports', emoji: '⚽', color: '#059669' },
  { id: 'womens', label: "Women's Fashion", emoji: '👗', color: '#DB2777' },
  { id: 'comics', label: 'Comics & Anime', emoji: '📚', color: '#1A56DB' },
  { id: 'food', label: 'Food & Drink', emoji: '🍜', color: '#D97706' },
];

type ViewMode = 'categories' | 'search';

export default function ExploreScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [auctions, setAuctions] = useState<AuctionFeedItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/auctions/feed');
      setAuctions(response.data.data as AuctionFeedItem[]);
    } catch {
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'search') {
      void fetchAuctions();
    }
  }, [viewMode, fetchAuctions]);

  const handleSearchFocus = () => {
    setViewMode('search');
    void fetchAuctions();
  };

  const handleSearchBlur = () => {
    if (!search.trim()) setViewMode('categories');
  };

  const filtered = auctions.filter(a =>
    search.trim() === '' ||
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.seller.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <View className="flex-1 bg-[#1E2A3A]">

      {/* Header */}
      <View className="pt-14 px-4 pb-3">
        <View className="bg-gray-900 border border-gray-700 rounded-2xl flex-row items-center px-4 py-3 gap-3">
          <Text className="text-gray-500 text-lg">🔍</Text>
          <TextInput
            className="flex-1 text-white text-base"
            placeholder="Search auctions or sellers..."
            placeholderTextColor="#4B5563"
            value={search}
            onChangeText={setSearch}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearch('');
              setViewMode('categories');
            }}>
              <Text className="text-gray-500 text-lg">✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {viewMode === 'categories' ? (
        /* ── Category Grid ── */
        <FlatList
          data={CATEGORIES}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          columnWrapperStyle={{ gap: 8 }}
          ListHeaderComponent={
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Browse Categories
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ width: CARD_WIDTH }}
              className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
              activeOpacity={0.8}
              onPress={() => {
                setSearch(item.label);
                setViewMode('search');
                void fetchAuctions();
              }}
            >
              {/* Color block with emoji */}
              <View
                className="w-full items-center justify-center py-5"
                style={{ backgroundColor: item.color + '22' }}
              >
                <Text style={{ fontSize: 32 }}>{item.emoji}</Text>
              </View>
              <View className="p-2">
                <Text
                  className="text-white text-xs font-semibold text-center"
                  numberOfLines={2}
                >
                  {item.label}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        /* ── Search Results ── */
        <View className="flex-1">
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#1A56DB" />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListHeaderComponent={
                filtered.length > 0 ? (
                  <Text className="text-gray-400 text-sm mb-2">
                    {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                    {search ? ` for "${search}"` : ''}
                  </Text>
                ) : null
              }
              ListEmptyComponent={
                <View className="items-center justify-center py-20">
                  <Text className="text-4xl mb-4">🔍</Text>
                  <Text className="text-white font-bold text-lg mb-2">
                    No Results
                  </Text>
                  <Text className="text-gray-500 text-sm text-center px-8">
                    {search
                      ? `No auctions found for "${search}"`
                      : 'No auctions available'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden flex-row"
                  onPress={() => router.push(`/auction/${item.id}`)}
                  activeOpacity={0.8}
                >
                  <View className="w-24 h-24 bg-gray-800 items-center justify-center">
                    {item.shopItems[0]?.photos?.[0] ? (
                      <Image
                        source={{ uri: item.shopItems[0].photos[0] }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <Text className="text-3xl">📦</Text>
                    )}
                  </View>
                  <View className="flex-1 p-3 justify-between">
                    <View>
                      <View className="flex-row items-center gap-2 mb-1">
                        {item.status === 'LIVE' && (
                          <View className="bg-red-600 rounded-full px-2 py-0.5 flex-row items-center gap-1">
                            <View className="w-1 h-1 rounded-full bg-white" />
                            <Text className="text-white text-xs font-bold">LIVE</Text>
                          </View>
                        )}
                        {item.status === 'SCHEDULED' && (
                          <View className="bg-[#F59E0B] rounded-full px-2 py-0.5">
                            <Text className="text-black text-xs font-bold">UPCOMING</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-white font-semibold text-sm" numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-gray-500 text-xs">
                        {item.seller.displayName}
                      </Text>
                      {item.shopItems.length > 0 && (
                        <Text className="text-[#F59E0B] text-xs font-semibold">
                          {formatPHP(Math.min(...item.shopItems.map(i => i.price)))}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}