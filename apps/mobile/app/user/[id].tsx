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
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../src/stores/auth.store';
import { shopItemsApi, ShopItem } from '../../src/services/api/shop-items.api';
import { offersApi } from '../../src/services/api/offers.api';

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
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showPreBidModal, setShowPreBidModal] = useState(false);
  const [selectedShopItem, setSelectedShopItem] = useState<ShopItem | null>(null);
  const [offerPercent, setOfferPercent] = useState<number | null>(-20);
  const [customOfferInput, setCustomOfferInput] = useState('');
  const [preBidInput, setPreBidInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const [profileRes, auctionsRes, shopRes] = await Promise.all([
        apiClient.get(`/users/${id}`),
        apiClient.get(`/auctions/seller/${id}`).catch(() => ({ data: { data: [] } })),
        shopItemsApi.getSellerShop(id),
      ]);
      const p = profileRes.data.data as UserProfile;
      const auctions = auctionsRes.data.data as UserProfile['auctions'];
      setProfile({ ...p, auctions: auctions ?? [] });
      setShopItems(shopRes.filter(i => i.status === 'AVAILABLE' || i.status === 'QUEUED'));
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
  const isOwnProfile = user?.id === id;
  const tierStyle = TIER_COLORS[profile.sellerTier] ?? TIER_COLORS.NEW;

  const showRows: typeof shows[number][][] = [];
  for (let i = 0; i < shows.length; i += 2) showRows.push(shows.slice(i, i + 2));

  const getOfferAmount = () => {
    if (!selectedShopItem) return 0;
    if (customOfferInput) return parseInt(customOfferInput) * 100;
    if (offerPercent !== null) return Math.round(selectedShopItem.price * (1 + offerPercent / 100));
    return 0;
  };

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
              shopItems.map(item => (
                <View key={item.id} style={{
                  backgroundColor: '#1F2937', borderRadius: 16,
                  marginBottom: 12, overflow: 'hidden',
                  flexDirection: 'row',
                }}>
                  {/* Photo */}
                  <View style={{ width: 100, height: 100, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                    {item.photos[0] ? (
                      <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 32 }}>📦</Text>
                    )}
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={{
                          backgroundColor: item.type === 'BUY_NOW' ? '#064E3B' : '#1E3A5F',
                          borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
                        }}>
                          <Text style={{
                            color: item.type === 'BUY_NOW' ? '#10B981' : '#60A5FA',
                            fontSize: 10, fontWeight: '700',
                          }}>
                            {item.type === 'BUY_NOW' ? 'BUY NOW' : 'AUCTION'}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                        {formatPHP(item.price)}
                      </Text>
                    </View>

                    {/* Action buttons */}
                    {!isOwnProfile && (
                      item.type === 'BUY_NOW' ? (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                          <TouchableOpacity
                            style={{
                              flex: 1, backgroundColor: '#1A56DB',
                              borderRadius: 8, paddingVertical: 7, alignItems: 'center',
                            }}
                            onPress={() => {
                              Alert.alert(
                                'Buy Now',
                                `Purchase ${item.title} for ${formatPHP(item.price)}?`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Confirm', onPress: () => {
                                    Alert.alert('Coming Soon', 'Payment integration coming soon!');
                                  }},
                                ]
                              );
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Buy Now</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{
                              flex: 1, backgroundColor: '#111827',
                              borderRadius: 8, paddingVertical: 7, alignItems: 'center',
                              borderWidth: 1, borderColor: '#374151',
                            }}
                            onPress={() => {
                              setSelectedShopItem(item);
                              setOfferPercent(-20);
                              setCustomOfferInput('');
                              setShowOfferModal(true);
                            }}
                          >
                            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600' }}>Make Offer</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#111827', borderRadius: 8,
                            paddingVertical: 7, alignItems: 'center', marginTop: 8,
                            borderWidth: 1, borderColor: '#374151',
                          }}
                          onPress={() => {
                            setSelectedShopItem(item);
                            setPreBidInput('');
                            setShowPreBidModal(true);
                          }}
                        >
                          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600' }}>🔔 Pre-Bid</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </View>
              ))
            )
          )}
        </View>
      </ScrollView>

      {/* ── Make Offer Modal ── */}
      <Modal visible={showOfferModal} transparent animationType="slide" onRequestClose={() => setShowOfferModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowOfferModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Make Offer</Text>
              <TouchableOpacity onPress={() => setShowOfferModal(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedShopItem && (
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
                Listed at {formatPHP(selectedShopItem.price)}
                {selectedShopItem.minimumOffer > 0 ? ` · Min offer: ${formatPHP(selectedShopItem.minimumOffer)}` : ''}
              </Text>
            )}

            {/* Percent chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[-20, -15, -10, -5].map(pct => {
                const offerAmt = selectedShopItem ? Math.round(selectedShopItem.price * (1 + pct / 100)) : 0;
                const isSelected = offerPercent === pct && customOfferInput === '';
                return (
                  <TouchableOpacity
                    key={pct}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                      backgroundColor: isSelected ? '#fff' : '#1F2937',
                    }}
                    onPress={() => { setOfferPercent(pct); setCustomOfferInput(''); }}
                  >
                    <Text style={{ color: isSelected ? '#000' : '#fff', fontWeight: '700', fontSize: 13 }}>{pct}%</Text>
                    <Text style={{ color: isSelected ? '#374151' : '#6B7280', fontSize: 10, marginTop: 2 }}>{formatPHP(offerAmt)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                  backgroundColor: offerPercent === null ? '#fff' : '#1F2937',
                }}
                onPress={() => { setOfferPercent(null); setCustomOfferInput(''); }}
              >
                <Text style={{ color: offerPercent === null ? '#000' : '#fff', fontWeight: '700', fontSize: 13 }}>Custom</Text>
              </TouchableOpacity>
            </View>

            {/* Custom input */}
            {offerPercent === null && (
              <View style={{
                backgroundColor: '#1F2937', borderRadius: 12,
                borderWidth: 1, borderColor: customOfferInput ? '#1A56DB' : '#374151',
                flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 16,
              }}>
                <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 8 }}>₱</Text>
                <TextInput
                  style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', paddingVertical: 12 }}
                  placeholder="0"
                  placeholderTextColor="#4B5563"
                  value={customOfferInput}
                  onChangeText={setCustomOfferInput}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
            )}

            {/* Offer summary */}
            {selectedShopItem && (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Your offer</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: '#6B7280', fontSize: 13, textDecorationLine: 'line-through' }}>
                      {formatPHP(selectedShopItem.price)}
                    </Text>
                    <Text style={{ color: '#10B981', fontSize: 16, fontWeight: '800' }}>
                      {formatPHP(getOfferAmount())}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                  Seller has 24 hours to respond. You won't be charged unless accepted.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={{
                backgroundColor: submitting || getOfferAmount() === 0 ? '#374151' : '#1A56DB',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              disabled={submitting || getOfferAmount() === 0}
              onPress={async () => {
                if (!selectedShopItem) return;
                const amount = getOfferAmount();
                if (!amount) return;
                if (selectedShopItem.minimumOffer > 0 && amount < selectedShopItem.minimumOffer) {
                  Alert.alert('Offer too low', `Minimum offer is ${formatPHP(selectedShopItem.minimumOffer)}`);
                  return;
                }
                setSubmitting(true);
                try {
                  await offersApi.create(selectedShopItem.id, amount);
                  setShowOfferModal(false);
                  Alert.alert('Offer Sent!', 'The seller will respond within 24 hours.');
                } catch {
                  Alert.alert('Error', 'Failed to send offer. Try again.');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {submitting ? 'Sending...' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Pre-Bid Modal ── */}
      <Modal visible={showPreBidModal} transparent animationType="slide" onRequestClose={() => setShowPreBidModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowPreBidModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>🔔 Pre-Bid</Text>
              <TouchableOpacity onPress={() => setShowPreBidModal(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedShopItem && (
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
                {selectedShopItem.title} · Starting at {formatPHP(selectedShopItem.price)}
              </Text>
            )}
            <View style={{ backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 20, gap: 8 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600' }}>HOW PRE-BID WORKS</Text>
              <Text style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 20 }}>
                Set your maximum bid. When the item goes live, we'll automatically bid on your behalf up to your limit — so you don't have to be there.
              </Text>
            </View>
            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              YOUR MAXIMUM BID (₱)
            </Text>
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 12,
              borderWidth: 1, borderColor: preBidInput ? '#1A56DB' : '#374151',
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 20,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 8 }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', paddingVertical: 14 }}
                placeholder={selectedShopItem ? `Min ${formatPHP(selectedShopItem.price)}` : '0'}
                placeholderTextColor="#4B5563"
                value={preBidInput}
                onChangeText={setPreBidInput}
                keyboardType="numeric"
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: preBidInput ? '#1A56DB' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              disabled={!preBidInput}
              onPress={() => {
                setShowPreBidModal(false);
                Alert.alert('Pre-Bid Set! 🔔', `We'll bid up to ${formatPHP(parseInt(preBidInput) * 100)} for you when this item goes live.`);
                setPreBidInput('');
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                Set Pre-Bid{preBidInput ? ` — ${formatPHP(parseInt(preBidInput) * 100)}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}