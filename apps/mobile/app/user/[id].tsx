import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../src/stores/auth.store';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 10) / 2;

interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  sellerTier: string;
  totalSales: number;
  role: string;
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

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: '#1F2937', text: '#9CA3AF' },
  ESTABLISHED: { bg: '#1E3A5F', text: '#60A5FA' },
  POWER: { bg: '#3B1F5F', text: '#C084FC' },
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('shows');
  const [following, setFollowing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const [profileRes, auctionsRes] = await Promise.all([
        apiClient.get(`/users/${id}`),
        apiClient.get(`/auctions/seller/${id}`).catch(() => ({ data: { data: [] } })),
      ]);
      const p = profileRes.data.data as UserProfile;
      const auctions = auctionsRes.data.data as UserProfile['auctions'];
      setProfile({ ...p, auctions: auctions ?? [] });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void fetchProfile();
  }, [fetchProfile]));

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
      <View style={{ flex: 1, backgroundColor: '#0D1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6B7280', fontSize: 16 }}>User not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#1A56DB' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isSeller = profile.role === 'SELLER';
  const shows = profile.auctions.filter(a => a.status === 'LIVE' || a.status === 'SCHEDULED');
  const shopItems = profile.auctions
    .flatMap(a => a.shopItems)
    .filter(i => i.status === 'AVAILABLE' || i.status === 'QUEUED');

  const showRows: typeof shows[number][][] = [];
  for (let i = 0; i < shows.length; i += 2) showRows.push(shows.slice(i, i + 2));

  const shopRows: typeof shopItems[number][][] = [];
  for (let i = 0; i < shopItems.length; i += 2) shopRows.push(shopItems.slice(i, i + 2));

  const isOwnProfile = user?.id === id;
  const tierStyle = TIER_COLORS[profile.sellerTier] ?? TIER_COLORS.NEW;

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void fetchProfile(); }}
            tintColor="#1A56DB"
          />
        }
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={{ backgroundColor: '#111827', paddingBottom: 0 }}>
          {/* Back */}
          <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 15 }}>← Back</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar + Info */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <View style={{
                width: 88, height: 88, borderRadius: 44,
                backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center',
                borderWidth: 3, borderColor: '#1F2937',
              }}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={{ width: 88, height: 88, borderRadius: 44 }} />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>
                    {profile.displayName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, paddingTop: 4 }}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>
                  {profile.displayName}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  {isSeller ? (
                    <View style={{ backgroundColor: tierStyle.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: tierStyle.text, fontSize: 11, fontWeight: '700' }}>
                        {profile.sellerTier} SELLER
                      </Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#1F2937', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700' }}>BUYER</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Stats — only for sellers */}
            {isSeller && (
              <View style={{ flexDirection: 'row', backgroundColor: '#1F2937', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
                {[
                  { label: 'Shows', value: shows.length },
                  { label: 'Items Sold', value: profile.totalSales },
                  { label: 'Rating', value: '5.0 ⭐' },
                ].map((stat, i) => (
                  <View key={stat.label} style={{
                    flex: 1, alignItems: 'center', paddingVertical: 14,
                    borderRightWidth: i < 2 ? 1 : 0, borderRightColor: '#374151',
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{stat.value}</Text>
                    <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action buttons */}
            {!isOwnProfile ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{
                    flex: 1, backgroundColor: following ? '#1F2937' : '#1A56DB',
                    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
                    borderWidth: following ? 1 : 0, borderColor: '#374151',
                  }}
                  onPress={() => setFollowing(f => !f)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    {following ? 'Following ✓' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={{
                  flex: 1, backgroundColor: '#1F2937', borderRadius: 12,
                  paddingVertical: 13, alignItems: 'center',
                  borderWidth: 1, borderColor: '#374151',
                }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>💬 Message</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={{ backgroundColor: '#1F2937', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#374151' }}
                onPress={() => router.push('/(main)/profile')}
              >
                <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 14 }}>✏️ Edit Profile</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tabs — only for sellers */}
          {isSeller && (
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#1F2937' }}>
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
                    fontWeight: activeTab === tab ? '700' : '500', fontSize: 14,
                  }}>
                    {tab === 'shows' ? `📺 Shows (${shows.length})` : `🛍️ Shop (${shopItems.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Tab Content */}
        <View style={{ padding: 16 }}>

          {/* Buyer — no shows */}
          {!isSeller && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>👤</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17, marginBottom: 8 }}>
                {profile.displayName}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center' }}>
                This user is a buyer on Auxtion
              </Text>
            </View>
          )}

          {/* Shows Tab */}
          {isSeller && activeTab === 'shows' && (
            shows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📺</Text>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>No shows yet</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>Check back soon</Text>
              </View>
            ) : (
              showRows.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {row.map(auction => {
                    const isLive = auction.status === 'LIVE';
                    const firstPhoto = auction.shopItems[0]?.photos?.[0];
                    const isWide = row.length === 1;
                    return (
                      <TouchableOpacity
                        key={auction.id}
                        style={{
                          width: isWide ? SCREEN_WIDTH - 32 : CARD_WIDTH,
                          backgroundColor: '#1F2937', borderRadius: 16, overflow: 'hidden',
                          borderWidth: isLive ? 1.5 : 0, borderColor: '#DC2626',
                        }}
                        onPress={() => router.push(`/auction/${auction.id}`)}
                        activeOpacity={0.85}
                      >
                        <View style={{ height: isWide ? 200 : 150, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                          {firstPhoto ? (
                            <Image source={{ uri: firstPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: isWide ? 48 : 36 }}>📦</Text>
                          )}
                          <View style={{ position: 'absolute', top: 10, left: 10 }}>
                            {isLive ? (
                              <View style={{ backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>LIVE</Text>
                              </View>
                            ) : (
                              <View style={{ backgroundColor: 'rgba(0,0,0,0.80)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{formatSchedule(auction.startTime)}</Text>
                              </View>
                            )}
                          </View>
                          {auction.shopItems.length > 0 && (
                            <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: '#fff', fontSize: 10 }}>{auction.shopItems.length} items</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ padding: 12 }}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 }} numberOfLines={1}>{auction.title}</Text>
                          {isLive ? (
                            <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '600' }}>🔴 Happening now</Text>
                          ) : (
                            <Text style={{ color: '#6B7280', fontSize: 11 }}>{formatSchedule(auction.startTime)}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
                </View>
              ))
            )
          )}

          {/* Shop Tab */}
          {isSeller && activeTab === 'shop' && (
            shopItems.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🛍️</Text>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>No items listed</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>This seller hasn't listed any items yet</Text>
              </View>
            ) : (
              shopRows.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {row.map(item => (
                    <View key={item.id} style={{ width: CARD_WIDTH, backgroundColor: '#1F2937', borderRadius: 16, overflow: 'hidden' }}>
                      <View style={{ height: 150, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                        {item.photos[0] ? (
                          <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: 36 }}>📦</Text>
                        )}
                      </View>
                      <View style={{ padding: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 }} numberOfLines={1}>{item.title}</Text>
                        <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700' }}>{formatPHP(item.price)}</Text>
                      </View>
                    </View>
                  ))}
                  {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
                </View>
              ))
            )
          )}
        </View>
      </ScrollView>
    </View>
  );
}
