import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  FlatList,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../src/stores/auth.store';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 12) / 2;

interface SellerProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  sellerTier: string;
  totalSales: number;
  auctions: {
    id: string;
    title: string;
    status: 'SCHEDULED' | 'LIVE' | 'ENDED';
    startTime: string;
    shopItems: {
      id: string;
      title: string;
      photos: string[];
      price: number;
      status: string;
    }[];
  }[];
}

type Tab = 'shows' | 'shop';

export default function SellerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('shows');

  const fetchSeller = useCallback(async () => {
    try {
      const [profileRes, auctionsRes] = await Promise.all([
        apiClient.get(`/users/${id}`),
        apiClient.get(`/auctions/seller/${id}`),
      ]);
      const profile = profileRes.data.data as SellerProfile;
      const auctions = auctionsRes.data.data as SellerProfile['auctions'];
      setSeller({ ...profile, auctions });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void fetchSeller();
  }, [fetchSeller]));

  const onRefresh = () => {
    setRefreshing(true);
    void fetchSeller();
  };

  const formatSchedule = (startTime: string) => {
    const d = new Date(startTime);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (isToday) return `Today, ${time}`;
    if (isTomorrow) return `Tomorrow, ${time}`;
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + `, ${time}`;
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (!seller) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>Seller not found</Text>
      </View>
    );
  }

  const shows = seller.auctions.filter(a => a.status === 'LIVE' || a.status === 'SCHEDULED');
  const shopItems = seller.auctions.flatMap(a => a.shopItems).filter(i => i.status === 'AVAILABLE' || i.status === 'QUEUED');

  // Build 2-column rows for shows
  const showRows: typeof shows[number][][] = [];
  for (let i = 0; i < shows.length; i += 2) {
    showRows.push(shows.slice(i, i + 2));
  }

  const isOwnProfile = user?.id === id;

  return (
    <View style={{ flex: 1, backgroundColor: '#111827' }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56DB" />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
            <Text style={{ color: '#1A56DB', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>

          {/* Avatar + Name */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center',
            }}>
              {seller.avatarUrl ? (
                <Image source={{ uri: seller.avatarUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
              ) : (
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>
                  {seller.displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{seller.displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <View style={{ backgroundColor: '#1F2937', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '600' }}>{seller.sellerTier}</Text>
                </View>
                <Text style={{ color: '#6B7280', fontSize: 12 }}>{seller.totalSales} sales</Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <View style={{ flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{shows.length}</Text>
              <Text style={{ color: '#6B7280', fontSize: 11 }}>Shows</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{seller.totalSales}</Text>
              <Text style={{ color: '#6B7280', fontSize: 11 }}>Sold</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{seller.sellerTier}</Text>
              <Text style={{ color: '#6B7280', fontSize: 11 }}>Tier</Text>
            </View>
          </View>

          {/* Action buttons */}
          {!isOwnProfile && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={{
                flex: 1, backgroundColor: '#1A56DB',
                borderRadius: 12, paddingVertical: 12, alignItems: 'center',
              }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Follow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{
                flex: 1, backgroundColor: '#1F2937',
                borderRadius: 12, paddingVertical: 12, alignItems: 'center',
              }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Message</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#1F2937', marginBottom: 16 }}>
          {(['shows', 'shop'] as Tab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={{
                flex: 1, paddingVertical: 14, alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab ? '#1A56DB' : 'transparent',
              }}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={{
                color: activeTab === tab ? '#fff' : '#6B7280',
                fontWeight: activeTab === tab ? '700' : '400',
                fontSize: 14,
                textTransform: 'capitalize',
              }}>
                {tab === 'shows' ? '📺 Shows' : '🛍️ Shop'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'shows' && (
          <View style={{ paddingHorizontal: 16 }}>
            {shows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📺</Text>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, marginBottom: 8 }}>No shows yet</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>Check back soon for live auctions</Text>
              </View>
            ) : (
              showRows.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  {row.map(auction => {
                    const isLive = auction.status === 'LIVE';
                    const firstPhoto = auction.shopItems[0]?.photos?.[0];
                    const cardWidth = row.length === 1 ? SCREEN_WIDTH - 32 : CARD_WIDTH;
                    const imageHeight = row.length === 1 ? 200 : 140;

                    return (
                      <TouchableOpacity
                        key={auction.id}
                        style={{
                          width: cardWidth, backgroundColor: '#1F2937',
                          borderRadius: 14, overflow: 'hidden',
                          borderWidth: isLive ? 1 : 0, borderColor: '#DC2626',
                        }}
                        onPress={() => router.push(`/auction/${auction.id}`)}
                        activeOpacity={0.8}
                      >
                        {/* Image */}
                        <View style={{ height: imageHeight, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                          {firstPhoto ? (
                            <Image source={{ uri: firstPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: 32 }}>📦</Text>
                          )}
                          {/* Badge */}
                          <View style={{ position: 'absolute', top: 8, left: 8 }}>
                            {isLive ? (
                              <View style={{ backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>LIVE</Text>
                              </View>
                            ) : (
                              <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                                  {formatSchedule(auction.startTime)}
                                </Text>
                              </View>
                            )}
                          </View>
                          {/* Item count */}
                          {auction.shopItems.length > 0 && (
                            <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ color: '#fff', fontSize: 10 }}>{auction.shopItems.length} items</Text>
                            </View>
                          )}
                        </View>
                        {/* Info */}
                        <View style={{ padding: 10 }}>
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                            {auction.title}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'shop' && (
          <View style={{ paddingHorizontal: 16 }}>
            {shopItems.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🛍️</Text>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, marginBottom: 8 }}>No items yet</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>This seller hasn't listed any items</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {shopItems.map(item => (
                  <View key={item.id} style={{ width: CARD_WIDTH, backgroundColor: '#1F2937', borderRadius: 14, overflow: 'hidden' }}>
                    <View style={{ height: 140, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                      {item.photos[0] ? (
                        <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: 32 }}>📦</Text>
                      )}
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ color: '#F59E0B', fontSize: 12, marginTop: 2 }}>{formatPHP(item.price)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}