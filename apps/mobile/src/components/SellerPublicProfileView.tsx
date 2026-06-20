import {
  View, Text, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Dimensions, RefreshControl,
  Linking, Modal, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../services/api/client';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../stores/auth.store';
import { followStore } from '../stores/follow.store';
import { useRouter } from 'expo-router';

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
      id: string; title: string;
      photos: { url: string; publicId: string; width?: number; height?: number }[];
      price: number; status: string;
    }[];
  }[];
}

interface StorefrontItem {
  id: string;
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  photos: { url: string }[];
  category: string;
  viewCount: number;
}

interface StorefrontMeta {
  liveAuction: { id: string; title: string; hmsRoomId: string } | null;
}

type Tab = 'shows' | 'shop';
type SortKey = 'newest' | 'price_low' | 'price_high' | 'most_viewed';

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: '#1F2937', text: '#9CA3AF' },
  ESTABLISHED: { bg: '#1E3A5F', text: '#60A5FA' },
  POWER: { bg: '#3B1F5F', text: '#C084FC' },
};

const CATEGORY_LABELS: Record<string, string> = {
  SNEAKERS: 'Sneakers', TRADING_CARDS: 'Trading Cards', WATCHES: 'Watches',
  ELECTRONICS: 'Electronics', COLLECTIBLES: 'Collectibles', CLOTHING: 'Clothing',
  ACCESSORIES: 'Accessories', BOOKS: 'Books', TOYS: 'Toys', OTHERS: 'Others',
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'price_low', label: 'Price: Low to High' },
  { key: 'price_high', label: 'Price: High to Low' },
  { key: 'most_viewed', label: 'Most Viewed' },
];

interface Props {
  userId: string;
  onBack?: () => void;
  /** true when rendered inside a modal — drops the safe-area top padding */
  embedded?: boolean;
  /** override navigation behavior for auction cards (used inside live room) */
  onAuctionPress?: (auctionId: string) => void;
}

export function SellerPublicProfileView({ userId, onBack, embedded, onAuctionPress }: Props) {
  const router = useRouter();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('shows');
  const [following, setFollowing] = useState(() => followStore.get(userId) ?? false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Storefront
  const [storefrontItems, setStorefrontItems] = useState<StorefrontItem[]>([]);
  const [liveAuction, setLiveAuction] = useState<{ id: string; title: string } | null>(null);

  // Storefront browsing controls
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Item detail sheet
  const [detailItem, setDetailItem] = useState<StorefrontItem | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Buy Now sheet
  const [selectedItem, setSelectedItem] = useState<StorefrontItem | null>(null);
  const [buySheetOpen, setBuySheetOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  const viewedItemIdsRef = useRef<Set<string>>(new Set());

  // If the active category no longer has any items (e.g. last item sold/deleted),
  // fall back to "All" instead of leaving the filter silently stuck.
  useEffect(() => {
    const cats = new Set(storefrontItems.map(i => i.category));
    if (activeCategory !== 'ALL' && !cats.has(activeCategory)) {
      setActiveCategory('ALL');
    }
  }, [storefrontItems, activeCategory]);

  const fetchProfile = useCallback(async () => {
    try {
      const shouldFetchFollow = !!user?.id && user.id !== userId;
      const [profileRes, auctionsRes, followRes, storefrontRes] = await Promise.all([
        apiClient.get(`/users/${userId}`),
        apiClient.get(`/auctions/seller/${userId}`).catch(() => ({ data: { data: [] } })),
        shouldFetchFollow
          ? apiClient.get(`/sellers/${userId}/follow-status`).catch(() => null)
          : Promise.resolve(null),
        apiClient.get(`/shops/${userId}?limit=100`).catch(() => null),
      ]);
      const p = profileRes.data.data as UserProfile;
      const auctions = auctionsRes.data.data as UserProfile['auctions'];
      setProfile({ ...p, auctions: auctions ?? [] });
      if (followRes) {
        const d = followRes.data.data as { following: boolean; followerCount: number };
        setFollowing(d.following);
        followStore.set(userId, d.following);
        setFollowerCount(d.followerCount);
      }
      if (storefrontRes) {
        const sd = storefrontRes.data.data as { items: StorefrontItem[]; seller: StorefrontMeta };
        setStorefrontItems(sd.items ?? []);
        setLiveAuction(sd.seller?.liveAuction ?? null);
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, user?.id]);

  useEffect(() => { void fetchProfile(); }, [fetchProfile]);

  const handleToggleFollow = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const res = await apiClient.post(`/sellers/${userId}/follow`);
      const d = res.data.data as { following: boolean };
      setFollowing(d.following);
      followStore.set(userId, d.following);
      setFollowerCount(prev => d.following ? prev + 1 : prev - 1);
    } catch { /* ignore */ }
    finally { setFollowLoading(false); }
  };

  const openItemDetail = (item: StorefrontItem) => {
    setDetailItem(item);
    setDetailSheetOpen(true);
    // Fire-and-forget, deduped per session — backend also skips the seller's own views
    if (!viewedItemIdsRef.current.has(item.id)) {
      viewedItemIdsRef.current.add(item.id);
      void apiClient.get(`/shop-items/${item.id}`).catch(() => undefined);
    }
  };

  const openBuyNow = (item: StorefrontItem) => {
    if (user?.id === userId) {
      router.push('/seller/shop' as any);
      return;
    }
    setSelectedItem(item);
    setBuySheetOpen(true);
  };

  const buyFromDetail = () => {
    if (!detailItem) return;
    setDetailSheetOpen(false);
    if (user?.id === userId) {
      router.push('/seller/shop' as any);
      return;
    }
    const item = detailItem;
    // Let the detail sheet's dismiss animation finish before presenting the next
    // modal — opening one Modal in the same tick another closes can glitch on iOS.
    setTimeout(() => {
      setSelectedItem(item);
      setBuySheetOpen(true);
    }, 300);
  };

  const confirmBuyNow = async () => {
    if (!selectedItem || buying) return;
    setBuying(true);
    try {
      const res = await apiClient.post(`/shop-items/${selectedItem.id}/buy`);
      const { checkoutUrl } = res.data.data as { checkoutUrl: string };
      setBuySheetOpen(false);
      await Linking.openURL(checkoutUrl);
      setTimeout(() => void fetchProfile(), 3000);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Failed to start checkout. Please try again.';
      setBuySheetOpen(false);
      if (typeof msg === 'string' && msg.toLowerCase().includes('address')) {
        Alert.alert(
          'Address Required',
          'Add a shipping address before buying.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Address', onPress: () => router.push('/profile/address' as any) },
          ]
        );
      } else if (typeof msg === 'string' && msg.toLowerCase().includes('no longer available')) {
        Alert.alert('Sold Out', 'Someone just bought this item.');
        void fetchProfile();
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setBuying(false);
    }
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
      <View style={{ paddingVertical: 48, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={{ paddingVertical: 48, alignItems: 'center' }}>
        <Text style={{ color: '#6B7280', fontSize: 16 }}>User not found</Text>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={{ marginTop: 16 }}>
            <Text style={{ color: '#1A56DB' }}>Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const isSeller = profile.role === 'SELLER';
  const isOwnProfile = user?.id === userId;
  const shows = (profile.auctions ?? []).filter(a =>
    embedded ? a.status === 'SCHEDULED' : (a.status === 'LIVE' || a.status === 'SCHEDULED')
  );
  // Items still attached to an auction (queued/available) — informational only, not buyable here
  const auctionItems = (profile.auctions ?? [])
    .flatMap(a => a.shopItems ?? [])
    .filter(i => i && i.photos != null && (i.status === 'AVAILABLE' || i.status === 'QUEUED'));

  const showRows: (typeof shows[number])[][] = [];
  for (let i = 0; i < shows.length; i += 2) showRows.push(shows.slice(i, i + 2));

  const auctionItemRows: (typeof auctionItems[number])[][] = [];
  for (let i = 0; i < auctionItems.length; i += 2) auctionItemRows.push(auctionItems.slice(i, i + 2));

  const totalShopCount = storefrontItems.length + auctionItems.length;

  // Most-viewed storefront item gets the hero spotlight, regardless of category filter
  const heroItem = storefrontItems.length > 0
    ? [...storefrontItems].sort((a, b) => b.viewCount - a.viewCount)[0]
    : null;

  const storefrontCategories = Array.from(new Set(storefrontItems.map(i => i.category)));

  const categoryFilteredItems = activeCategory === 'ALL'
    ? storefrontItems
    : storefrontItems.filter(i => i.category === activeCategory);

  const sortedStorefrontItems = [...categoryFilteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'price_low':    return a.price - b.price;
      case 'price_high':   return b.price - a.price;
      case 'most_viewed':  return b.viewCount - a.viewCount;
      default:              return 0; // 'newest' — API already returns createdAt desc
    }
  });

  // The hero already spotlights one item — don't show it a second time in the grid below.
  const gridDisplayItems = heroItem
    ? sortedStorefrontItems.filter(i => i.id !== heroItem.id)
    : sortedStorefrontItems;

  const gridRows: StorefrontItem[][] = [];
  for (let i = 0; i < gridDisplayItems.length; i += 2) gridRows.push(gridDisplayItems.slice(i, i + 2));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0D1117' }}
      contentContainerStyle={{ paddingTop: embedded ? 0 : 56, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void fetchProfile(); }}
          tintColor="#1A56DB"
        />
      }
    >
      {/* Back button */}
      {onBack && (
        <TouchableOpacity onPress={onBack} style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: '#1A56DB', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      )}

      {/* Seller header card */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#111827', borderRadius: 16, padding: 16,
        marginHorizontal: 16, marginBottom: 16,
        borderWidth: 1, borderColor: '#1F2937',
      }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} />
          ) : (
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>
              {profile.displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{profile.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <View style={{
              borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
              backgroundColor: TIER_COLORS[profile.sellerTier]?.bg ?? '#1F2937',
            }}>
              <Text style={{ color: TIER_COLORS[profile.sellerTier]?.text ?? '#9CA3AF', fontSize: 10, fontWeight: '700' }}>
                {profile.sellerTier}
              </Text>
            </View>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>
              {profile.totalSales} sales · {followerCount} followers
            </Text>
          </View>
        </View>
        {!isOwnProfile && (
          <TouchableOpacity
            onPress={() => void handleToggleFollow()}
            disabled={followLoading}
            style={{
              backgroundColor: following ? 'rgba(255,255,255,0.08)' : '#1A56DB',
              borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
              borderWidth: 1, borderColor: following ? '#374151' : '#1A56DB',
              opacity: followLoading ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {following ? 'Following' : '+ Follow'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live Now banner */}
      {liveAuction && (
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: 'rgba(220,38,38,0.12)', borderWidth: 1, borderColor: '#DC2626',
            borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 16,
          }}
          onPress={() =>
            onAuctionPress
              ? onAuctionPress(liveAuction.id)
              : router.push(`/auction/${liveAuction.id}/live` as any)
          }
          activeOpacity={0.8}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 }}>LIVE NOW</Text>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{liveAuction.title}</Text>
          </View>
          <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '700' }}>Watch →</Text>
        </TouchableOpacity>
      )}

      {/* Tabs */}
      {isSeller && (
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: '#111827', borderRadius: 12, padding: 3, gap: 2 }}>
          {(['shows', 'shop'] as Tab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                backgroundColor: activeTab === tab ? '#1F2937' : 'transparent',
              }}
            >
              <Text style={{ color: activeTab === tab ? '#fff' : '#6B7280', fontSize: 13, fontWeight: '700' }}>
                {tab === 'shows' ? `📺 Shows (${shows.length})` : `🛍️ Shop (${totalShopCount})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: 16 }}>
        {/* Shows tab */}
        {activeTab === 'shows' && (
          shows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📺</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>No shows yet</Text>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>This seller hasn't scheduled any live auctions</Text>
            </View>
          ) : showRows.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              {row.map(auction => {
                const firstPhoto = auction.shopItems[0]?.photos?.[0]?.url;
                return (
                  <TouchableOpacity
                    key={auction.id}
                    style={{ width: CARD_WIDTH, backgroundColor: '#1F2937', borderRadius: 16, overflow: 'hidden' }}
                    onPress={() =>
                      onAuctionPress ? onAuctionPress(auction.id) : router.push(`/auction/${auction.id}` as any)
                    }
                    activeOpacity={0.85}
                  >
                    <View style={{ height: 150, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                      {firstPhoto ? (
                        <Image source={{ uri: firstPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : <Text style={{ fontSize: 36 }}>🏷️</Text>}
                      {auction.status === 'LIVE' && (
                        <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>LIVE</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 }} numberOfLines={1}>{auction.title}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 11 }}>
                        {auction.status === 'LIVE' ? 'Live now' : formatSchedule(auction.startTime)}
                      </Text>
                      {auction.shopItems.length > 0 && (
                        <View style={{ marginTop: 6, backgroundColor: '#111827', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
                          <Text style={{ color: '#fff', fontSize: 10 }}>{auction.shopItems.length} items</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
            </View>
          ))
        )}

        {/* Shop tab */}
        {isSeller && activeTab === 'shop' && (
          totalShopCount === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🛍️</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>No items listed</Text>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>This seller hasn't listed any items yet</Text>
            </View>
          ) : (
            <>
              {/* ── Hero spotlight — most-viewed storefront item ── */}
              {heroItem && (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => openItemDetail(heroItem)}
                  style={{
                    height: 216, borderRadius: 22, overflow: 'hidden',
                    marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
                  }}
                >
                  <LinearGradient
                    colors={['#1c2742', '#0d1322']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                  <View style={{
                    position: 'absolute', width: 200, height: 200, borderRadius: 100,
                    backgroundColor: 'rgba(167,139,250,0.25)', top: -50, right: -30,
                  }} />
                  <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
                      backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                    }}>
                      <Text style={{ fontSize: 11 }}>⭐</Text>
                      <Text style={{ color: '#FDE68A', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>MOST WANTED</Text>
                    </View>

                    <View style={{
                      position: 'absolute', right: 16, bottom: 90, width: 96, height: 96, borderRadius: 16,
                      backgroundColor: '#1c2742', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                      overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {(heroItem.photos ?? [])[0]?.url ? (
                        <Image source={{ uri: heroItem.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : <Text style={{ fontSize: 40 }}>📦</Text>}
                    </View>

                    <View style={{ maxWidth: 200 }}>
                      <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={2}>
                        {heroItem.title}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 5 }}>Most viewed item in this shop</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                        <View style={{ backgroundColor: '#10B981', paddingVertical: 7, paddingHorizontal: 14, paddingLeft: 18, borderRadius: 10 }}>
                          <View style={{ position: 'absolute', left: 6, top: '50%', marginTop: -2.5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#06281c' }} />
                          <Text style={{ color: '#06281c', fontWeight: '800', fontSize: 14 }}>{formatPHP(heroItem.price)}</Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 }}>
                          <Text style={{ color: '#111827', fontWeight: '800', fontSize: 12.5 }}>
                            {isOwnProfile ? 'Manage' : 'View item'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* ── Category pills + sort ── */}
              {storefrontItems.length > 0 && (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 14 }}
                    contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                  >
                    {['ALL', ...storefrontCategories].map(cat => {
                      const isActive = cat === activeCategory;
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => setActiveCategory(cat)}
                          style={{
                            paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999,
                            backgroundColor: isActive ? '#A78BFA' : '#141C30',
                            borderWidth: 1, borderColor: isActive ? 'transparent' : 'rgba(255,255,255,0.07)',
                          }}
                        >
                          <Text style={{
                            color: isActive ? '#1a1130' : '#9CA3AF',
                            fontSize: 12.5, fontWeight: isActive ? '800' : '600',
                          }}>
                            {cat === 'ALL' ? 'All' : (CATEGORY_LABELS[cat] ?? cat)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <TouchableOpacity onPress={() => setSortMenuOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                        {SORT_OPTIONS.find(o => o.key === sortBy)?.label ?? 'Newest'} ⌄
                      </Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      {sortedStorefrontItems.length} item{sortedStorefrontItems.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </>
              )}

              {/* ── Grid ── */}
              {sortedStorefrontItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>No items in this category</Text>
                </View>
              ) : gridRows.map((row, rowIndex) => (
                <View key={`sf-${rowIndex}`} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {row.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={{
                        width: CARD_WIDTH, backgroundColor: '#141C30', borderRadius: 18,
                        overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
                      }}
                      onPress={() => openItemDetail(item)}
                      activeOpacity={0.85}
                    >
                      <View style={{ height: 148, backgroundColor: '#1c2742', alignItems: 'center', justifyContent: 'center' }}>
                        {(item.photos ?? [])[0]?.url ? (
                          <Image source={{ uri: item.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : <Text style={{ fontSize: 36 }}>📦</Text>}
                        <View style={{
                          position: 'absolute', top: 9, left: 9,
                          backgroundColor: isOwnProfile ? 'rgba(167,139,250,0.95)' : 'rgba(16,185,129,0.95)',
                          borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
                        }}>
                          <Text style={{ color: isOwnProfile ? '#1a1130' : '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 }}>
                            {isOwnProfile ? 'YOUR ITEM' : 'BUY NOW'}
                          </Text>
                        </View>

                      </View>
                      <View style={{ padding: 11 }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 5 }} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                          <Text style={{ color: '#10B981', fontSize: 14.5, fontWeight: '800' }}>{formatPHP(item.price)}</Text>
                          {item.originalPrice != null && item.originalPrice > item.price && (
                            <Text style={{ color: '#5B6472', fontSize: 11.5, textDecorationLine: 'line-through' }}>
                              {formatPHP(item.originalPrice)}
                            </Text>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }}>
                          <Text style={{ color: '#5B6472', fontSize: 10.5, fontWeight: '600' }}>
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </Text>
                          <Text style={{ color: '#5B6472', fontSize: 10 }}>◎ {item.viewCount}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
                </View>
              ))}

              {/* Divider if auction-attached items also exist */}
              {storefrontItems.length > 0 && auctionItems.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '700' }}>🔨 In Live Auctions</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#1F2937' }} />
                </View>
              )}

              {/* Auction-attached items — informational, not buyable here */}
              {auctionItemRows.map((row, rowIndex) => (
                <View key={`auc-${rowIndex}`} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {row.map(item => (
                    <View key={item.id} style={{ width: CARD_WIDTH, backgroundColor: '#1F2937', borderRadius: 16, overflow: 'hidden', opacity: 0.85 }}>
                      <View style={{ height: 150, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                        {(item.photos ?? [])[0]?.url ? (
                          <Image source={{ uri: item.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : <Text style={{ fontSize: 36 }}>📦</Text>}
                      </View>
                      <View style={{ padding: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 }} numberOfLines={1}>{item.title}</Text>
                        <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700' }}>{formatPHP(item.price)}</Text>
                      </View>
                    </View>
                  ))}
                  {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
                </View>
              ))}
            </>
          )
        )}
      </View>

      {/* Sort menu */}
      <Modal visible={sortMenuOpen} transparent animationType="fade" onRequestClose={() => setSortMenuOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 40 }}
          activeOpacity={1}
          onPress={() => setSortMenuOpen(false)}
        >
          <View
            style={{ backgroundColor: '#13192A', borderRadius: 16, padding: 6, borderWidth: 1, borderColor: '#1F2937' }}
            onStartShouldSetResponder={() => true}
          >
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                style={{
                  paddingVertical: 14, paddingHorizontal: 14,
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <Text style={{ color: sortBy === opt.key ? '#A78BFA' : '#fff', fontSize: 14, fontWeight: sortBy === opt.key ? '700' : '500' }}>
                  {opt.label}
                </Text>
                {sortBy === opt.key && <Text style={{ color: '#A78BFA' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Item detail sheet */}
      <Modal visible={detailSheetOpen} transparent animationType="slide" onRequestClose={() => setDetailSheetOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setDetailSheetOpen(false)}
        >
          {detailItem && (
            <View
              style={{
                backgroundColor: '#13192A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                maxHeight: '85%',
              }}
              onStartShouldSetResponder={() => true}
            >
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
                {/* Photo carousel */}
                {(detailItem.photos ?? []).filter(p => p?.url).length > 0 ? (
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    {detailItem.photos.filter(p => p?.url).map((photo, i) => (
                      <Image
                        key={i}
                        source={{ uri: photo.url }}
                        style={{ width: SCREEN_WIDTH - 40, height: 260, borderRadius: 18, marginRight: 10, backgroundColor: '#1c2742' }}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <View style={{
                    height: 220, borderRadius: 18, backgroundColor: '#1c2742',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                  }}>
                    <Text style={{ fontSize: 48 }}>📦</Text>
                  </View>
                )}

                <View style={{
                  flexDirection: 'row', alignSelf: 'flex-start',
                  backgroundColor: isOwnProfile ? 'rgba(167,139,250,0.15)' : 'rgba(16,185,129,0.15)',
                  borderWidth: 1, borderColor: isOwnProfile ? '#A78BFA' : '#10B981',
                  borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
                }}>
                  <Text style={{ color: isOwnProfile ? '#A78BFA' : '#10B981', fontSize: 11, fontWeight: '800' }}>
                    {isOwnProfile ? '🛍️ YOUR ITEM' : '🏷️ BUY NOW'}
                  </Text>
                </View>

                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20, marginBottom: 6 }}>
                  {detailItem.title}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
                  <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 20 }}>{formatPHP(detailItem.price)}</Text>
                  {detailItem.originalPrice != null && detailItem.originalPrice > detailItem.price && (
                    <Text style={{ color: '#6B7280', fontSize: 14, textDecorationLine: 'line-through' }}>
                      {formatPHP(detailItem.originalPrice)}
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  <View style={{ backgroundColor: '#1F2937', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 11.5, fontWeight: '600' }}>
                      {CATEGORY_LABELS[detailItem.category] ?? detailItem.category}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#1F2937', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 11.5, fontWeight: '600' }}>◎ {detailItem.viewCount} views</Text>
                  </View>
                </View>

                {detailItem.description ? (
                  <View style={{ backgroundColor: '#1c2742', borderRadius: 14, padding: 14, marginBottom: 20 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 20 }}>{detailItem.description}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={{
                    backgroundColor: isOwnProfile ? '#A78BFA' : '#10B981',
                    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                  }}
                  onPress={buyFromDetail}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: isOwnProfile ? '#1a1130' : '#fff', fontWeight: '700', fontSize: 16 }}>
                    {isOwnProfile ? 'Manage in My Shop' : `Buy Now — ${formatPHP(detailItem.price)}`}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Buy Now confirmation sheet */}
      <Modal visible={buySheetOpen} transparent animationType="slide" onRequestClose={() => setBuySheetOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setBuySheetOpen(false)}
        >
          {selectedItem && (
            <View
              style={{ backgroundColor: '#13192A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}
              onStartShouldSetResponder={() => true}
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 18 }} />

              <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
                <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: '#1F2937', overflow: 'hidden' }}>
                  {(selectedItem.photos ?? [])[0]?.url ? (
                    <Image source={{ uri: selectedItem.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>📦</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }} numberOfLines={2}>{selectedItem.title}</Text>
                  <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 18, marginTop: 4 }}>{formatPHP(selectedItem.price)}</Text>
                </View>
              </View>

              <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginBottom: 12, lineHeight: 18 }}>
                You'll be taken to a secure checkout to pay via GCash or card.
              </Text>

              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                borderRadius: 10, padding: 10, marginBottom: 20,
              }}>
                <Text style={{ fontSize: 14 }}>⏱️</Text>
                <Text style={{ color: '#F59E0B', fontSize: 12, flex: 1, lineHeight: 16 }}>
                  This item will be reserved for you for 10 minutes. If payment isn't completed in time, it will be relisted for other buyers.
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16,
                  alignItems: 'center', marginBottom: 10, opacity: buying ? 0.6 : 1,
                }}
                onPress={() => void confirmBuyNow()}
                disabled={buying}
              >
                {buying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    Confirm Purchase — {formatPHP(selectedItem.price)}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 14, alignItems: 'center' }}
                onPress={() => setBuySheetOpen(false)}
                disabled={buying}
              >
                <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}