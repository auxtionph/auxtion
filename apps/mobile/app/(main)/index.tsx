import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAuctionFeed } from '../../src/hooks/useAuction';
import { AuctionFeedItem } from '../../src/services/api/auctions.api';
import { formatPHP } from '@auxtion/utils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 12) / 2;

function LiveBadge() {
  return (
    <View style={{
      backgroundColor: '#DC2626', borderRadius: 999,
      paddingHorizontal: 8, paddingVertical: 3,
      flexDirection: 'row', alignItems: 'center', gap: 4,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>LIVE</Text>
    </View>
  );
}

function AuctionCard({ item, onPress, wide = false }: {
  item: AuctionFeedItem;
  onPress: () => void;
  wide?: boolean;
}) {
  const firstPhoto = item.shopItems[0]?.photos?.[0];
  const lowestPrice = item.shopItems.length > 0
    ? Math.min(...item.shopItems.map(i => i.price))
    : 0;
  const isLive = item.status === 'LIVE';
  const cardWidth = wide ? SCREEN_WIDTH - 32 : CARD_WIDTH;
  const imageHeight = wide ? 200 : 140;

  return (
    <TouchableOpacity
      style={{
        width: cardWidth,
        backgroundColor: '#1F2937',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: isLive ? 1 : 0,
        borderColor: '#DC2626',
        marginBottom: 12,
      }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ width: '100%', height: imageHeight, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
        {firstPhoto ? (
          <Image source={{ uri: firstPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: wide ? 48 : 32 }}>📦</Text>
        )}
        <View style={{ position: 'absolute', top: 8, left: 8 }}>
          {isLive && <LiveBadge />}
        </View>
        {item.shopItems.length > 0 && (
          <View style={{
            position: 'absolute', bottom: 8, right: 8,
            backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 999,
            paddingHorizontal: 8, paddingVertical: 2,
          }}>
            <Text style={{ color: '#fff', fontSize: 10 }}>
              {item.shopItems.length} item{item.shopItems.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: wide ? 15 : 13, marginBottom: 4 }} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <View style={{
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
              {item.seller.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: '#9CA3AF', fontSize: 11 }} numberOfLines={1}>
            {item.seller.displayName}
          </Text>
        </View>
        {lowestPrice > 0 && (
          <Text style={{ color: '#F59E0B', fontWeight: '600', fontSize: 12 }}>
            Starts {formatPHP(lowestPrice)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function EmptyFeed({ searching }: { searching: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>{searching ? '🔍' : '📭'}</Text>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
        {searching ? 'No Results' : 'No Live Auctions'}
      </Text>
      <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
        {searching ? 'Try a different search term' : 'Check back soon for live auctions.'}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { feed, isLoading, error, refetch } = useAuctionFeed();
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading && feed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
        <Text style={{ color: '#6B7280', marginTop: 16 }}>Loading auctions...</Text>
      </View>
    );
  }

  if (error && feed.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Connection Error</Text>
        <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>{error}</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#1A56DB', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          onPress={() => void refetch()}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const liveAuctions = feed.filter(a => a.status === 'LIVE');
  const scheduledAuctions = feed.filter(a => a.status === 'SCHEDULED');
  const displayAuctions = searchQuery.trim()
    ? [...liveAuctions, ...scheduledAuctions].filter(a =>
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.seller.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : liveAuctions;

  const rows: AuctionFeedItem[][] = [];
  for (let i = 0; i < displayAuctions.length; i += 2) {
    rows.push(displayAuctions.slice(i, i + 2));
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#111827' }}>
      {/* Top Bar */}
      <View style={{
        paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
        {!searchOpen ? (
          <>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', flex: 1 }}>Auxtion</Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#1F2937', borderRadius: 999,
                paddingHorizontal: 16, paddingVertical: 8,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}
              onPress={() => setSearchOpen(true)}
            >
              <Text style={{ color: '#6B7280', fontSize: 13 }}>🔍 Search</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: '#1F2937', borderRadius: 14,
              paddingHorizontal: 14, paddingVertical: 10,
              borderWidth: 1, borderColor: '#1A56DB',
            }}>
              <Text style={{ color: '#6B7280', fontSize: 14 }}>🔍</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 14 }}
                placeholder="Search live auctions..."
                placeholderTextColor="#4B5563"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 10, fontWeight: '700' }}>✕</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => { setSearchOpen(false); setSearchQuery(''); }}>
              <Text style={{ color: '#1A56DB', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(_, i) => `row-${i}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#1A56DB"
          />
        }
        ListHeaderComponent={
          displayAuctions.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                {searchQuery ? '🔍 Results' : '🔴 Live Now'}
              </Text>
              <View style={{ backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{displayAuctions.length}</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyFeed searching={searchQuery.length > 0} />}
        renderItem={({ item: row }) => (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {row.map(auction => (
              <AuctionCard
                key={auction.id}
                item={auction}
                wide={row.length === 1}
                onPress={() => router.push(`/auction/${auction.id}`)}
              />
            ))}
            {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
          </View>
        )}
      />
    </View>
  );
}