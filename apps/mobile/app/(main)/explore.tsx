import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';
import { AuctionFeedItem } from '../../src/services/api/auctions.api';
import { formatPHP } from '@auxtion/utils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 10) / 2;

type SearchTab = 'shows' | 'users';

interface UserResult {
  id: string;
  displayName: string;
  avatarUrl?: string;
  sellerTier: string;
  totalSales: number;
}

interface Suggestion {
  type: 'query' | 'seller';
  label: string;
  sublabel?: string;
  id?: string;
  avatarUrl?: string;
}

export default function ExploreScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<any>(null);
  const feedCacheRef = useRef<AuctionFeedItem[]>([]);
  const [search, setSearch] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('shows');
  const [auctions, setAuctions] = useState<AuctionFeedItem[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'Sneakers', 'Jordan', 'Nike', 'Vintage',
  ]);
  const userSuggestionCacheRef = useRef<Map<string, UserResult[]>>(new Map());

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSuggestions([]);
    try {
      // Use cached feed if available
      if (feedCacheRef.current.length === 0) {
        const auctionRes = await apiClient.get('/auctions/feed');
        feedCacheRef.current = auctionRes.data.data as AuctionFeedItem[];
      }

      const userRes = await apiClient.get(`/users?search=${encodeURIComponent(q)}`)
        .catch(() => ({ data: { data: [] } }));

      const filtered = feedCacheRef.current.filter(a =>
        a.title.toLowerCase().includes(q.toLowerCase()) ||
        a.seller.displayName.toLowerCase().includes(q.toLowerCase())
      );
      setAuctions(filtered);
      setUsers(userRes.data.data as UserResult[]);
    } catch {
      setAuctions([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return; }
    try {
      if (feedCacheRef.current.length === 0) {
        const auctionRes = await apiClient.get('/auctions/feed');
        feedCacheRef.current = auctionRes.data.data as AuctionFeedItem[];
      }

      // Use cache if available, otherwise fetch and cache
      let fetchedUsers: UserResult[];
      if (userSuggestionCacheRef.current.has(q)) {
        fetchedUsers = userSuggestionCacheRef.current.get(q)!;
      } else {
        const userRes = await apiClient.get(`/users?search=${encodeURIComponent(q)}`)
          .catch(() => ({ data: { data: [] } }));
        fetchedUsers = userRes.data.data as UserResult[];
        userSuggestionCacheRef.current.set(q, fetchedUsers);
      }

      const matchedAuctions = feedCacheRef.current
        .filter(a => a.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 2)
        .map(a => ({ type: 'query' as const, label: a.title, sublabel: 'in Shows' }));

      const matchedUsers = fetchedUsers
        .slice(0, 3)
        .map(u => ({
          type: 'seller' as const,
          label: u.displayName,
          sublabel: u.sellerTier !== 'NEW' ? `Seller · ${u.totalSales} sales` : 'Buyer',
          id: u.id,
          avatarUrl: u.avatarUrl,
        }));

      setSuggestions([
        { type: 'query', label: q },
        ...matchedUsers,
        ...matchedAuctions,
      ]);
    } catch {
      setSuggestions([{ type: 'query', label: q }]);
    }
  }, []);

  const handleSubmit = (q: string) => {
    if (!q.trim()) return;
    setSuggestions([]);
    if (!recentSearches.includes(q)) {
      setRecentSearches(prev => [q, ...prev].slice(0, 8));
    }
    void doSearch(q);
  };

  const handleCancel = () => {
    setSearch('');
    setIsFocused(false);
    setAuctions([]);
    setUsers([]);
    setSuggestions([]);
    inputRef.current?.blur();
  };

  type Mode = 'idle' | 'default' | 'suggestions' | 'loading' | 'results';

  const getMode = (): Mode => {
    if (!isFocused) return 'idle';
    if (search.trim().length === 0) return 'default';
    if (suggestions.length > 0) return 'suggestions';
    if (loading) return 'loading';
    return 'results';
  };
  const mode = getMode();

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>

      {/* Search Bar */}
      <View style={{
        paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#0D1117',
      }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: '#1F2937', borderRadius: 14,
          paddingHorizontal: 14, paddingVertical: 11,
          borderWidth: 1, borderColor: isFocused ? '#1A56DB' : '#374151',
        }}>
          <Text style={{ fontSize: 16, color: '#6B7280' }}>🔍</Text>
          <TextInput
            ref={inputRef}
            style={{ flex: 1, color: '#fff', fontSize: 15 }}
            placeholder="Search shows, sellers, items..."
            placeholderTextColor="#4B5563"
            value={search}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            keyboardType="web-search"
            onChangeText={q => {
              setSearch(q);
              // Clear previous timer
              if (debounceRef.current) clearTimeout(debounceRef.current);
              if (!q.trim()) {
                setSuggestions([]);
                return;
              }
              // Wait 300ms after user stops typing
              // Only search if at least 2 characters typed
              if (q.trim().length >= 2) {
                debounceRef.current = setTimeout(() => {
                  void fetchSuggestions(q);
                }, 400); // slightly longer for users query
              }
            }}
            onFocus={() => setIsFocused(true)}
            onSubmitEditing={() => {
              setSuggestions([]);
              handleSubmit(search);
            }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => {
              setSearch('');
              setSuggestions([]);
              setAuctions([]);
              setUsers([]);
            }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '700' }}>✕</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
        {isFocused && (
          <TouchableOpacity onPress={handleCancel}>
            <Text style={{ color: '#1A56DB', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Suggestions Dropdown ── */}
      {mode === 'suggestions' && (
        <View style={{ backgroundColor: '#111827', borderBottomWidth: 1, borderColor: '#1F2937' }}>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                paddingVertical: 13, paddingHorizontal: 16,
                borderBottomWidth: i < suggestions.length - 1 ? 1 : 0,
                borderColor: '#1F2937',
              }}
              onPress={() => {
               if (s.type === 'seller' && s.id) {
                router.push(`/seller/${s.id}`);
                  setSuggestions([]);
                } else {
                  setSearch(s.label);
                  handleSubmit(s.label);
                }
              }}
            >
              {s.type === 'seller' ? (
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {s.label.charAt(0).toUpperCase()}
                  </Text>
                </View>
              ) : (
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#6B7280', fontSize: 18 }}>🔍</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: s.type === 'seller' ? '700' : '400' }}>
                  {s.label}
                </Text>
                {s.sublabel && (
                  <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>{s.sublabel}</Text>
                )}
              </View>
              <Text style={{ color: '#374151', fontSize: 18 }}>↗</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Default State ── */}
      {mode === 'default' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {recentSearches.length > 0 && (
            <View style={{ marginBottom: 28 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Recent Searches</Text>
                <TouchableOpacity onPress={() => setRecentSearches([])}>
                  <Text style={{ color: '#1A56DB', fontSize: 13 }}>Clear All</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recentSearches.map(term => (
                  <TouchableOpacity
                    key={term}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: '#1F2937', borderRadius: 999,
                      paddingHorizontal: 14, paddingVertical: 8,
                      borderWidth: 1, borderColor: '#374151',
                    }}
                    onPress={() => { setSearch(term); void doSearch(term); }}
                  >
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>🕐</Text>
                    <Text style={{ color: '#fff', fontSize: 13 }}>{term}</Text>
                    <TouchableOpacity onPress={() => setRecentSearches(p => p.filter(s => s !== term))}>
                      <Text style={{ color: '#4B5563', fontSize: 11, marginLeft: 2 }}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 12 }}>Browse Categories</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Sneakers', emoji: '👟' }, { label: 'Fashion', emoji: '👔' },
              { label: 'Electronics', emoji: '📱' }, { label: 'Collectibles', emoji: '🏆' },
              { label: 'Jewelry', emoji: '💍' }, { label: 'Trading Cards', emoji: '🃏' },
              { label: 'Toys', emoji: '🧸' }, { label: 'Sports', emoji: '⚽' },
              { label: 'Vintage', emoji: '🎸' }, { label: 'Comics', emoji: '📚' },
            ].map(cat => (
              <TouchableOpacity
                key={cat.label}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: '#1F2937', borderRadius: 999,
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderWidth: 1, borderColor: '#374151',
                }}
                onPress={() => { setSearch(cat.label); void doSearch(cat.label); }}
              >
                <Text style={{ fontSize: 14 }}>{cat.emoji}</Text>
                <Text style={{ color: '#fff', fontSize: 13 }}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Loading ── */}
      {mode === 'loading' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      )}

      {/* ── Search Results ── */}
      {mode === 'results' && (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#1F2937', paddingHorizontal: 16 }}>
            {(['shows', 'users'] as SearchTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={{
                  paddingVertical: 12, marginRight: 24,
                  borderBottomWidth: 2,
                  borderBottomColor: activeTab === tab ? '#1A56DB' : 'transparent',
                }}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={{
                  color: activeTab === tab ? '#fff' : '#6B7280',
                  fontWeight: activeTab === tab ? '700' : '500', fontSize: 14,
                }}>
                  {tab === 'shows' ? `Shows (${auctions.length})` : `Users (${users.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'shows' && (
            <FlatList
              data={auctions}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>📺</Text>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>No shows found</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>Try a different search term</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isLive = item.status === 'LIVE';
                const firstPhoto = item.shopItems[0]?.photos?.[0];
                const lowestPrice = item.shopItems.length > 0
                  ? Math.min(...item.shopItems.map(i => i.price)) : 0;
                return (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', gap: 12,
                      backgroundColor: '#1F2937', borderRadius: 14,
                      padding: 12,
                      borderWidth: isLive ? 1 : 0, borderColor: '#DC2626',
                    }}
                    onPress={() => router.push(`/auction/${item.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: '#374151', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {firstPhoto ? (
                        <Image source={{ uri: firstPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: 28 }}>📦</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {isLive && (
                          <View style={{ backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>LIVE</Text>
                          </View>
                        )}
                        {item.status === 'SCHEDULED' && (
                          <View style={{ backgroundColor: '#F59E0B22', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '700' }}>UPCOMING</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 4 }} numberOfLines={1}>{item.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: '#6B7280', fontSize: 12 }}>{item.seller.displayName}</Text>
                        {lowestPrice > 0 && (
                          <>
                            <Text style={{ color: '#374151' }}>·</Text>
                            <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>{formatPHP(lowestPrice)}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {activeTab === 'users' && (
            <FlatList
              data={users}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 2 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ fontSize: 40, marginBottom: 12 }}>👤</Text>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 8 }}>No sellers found</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>Try a different name</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    paddingVertical: 14, paddingHorizontal: 4,
                    borderBottomWidth: 1, borderColor: '#1F2937',
                  }}
                  onPress={() => router.push(`/seller/${item.id}`)}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center' }}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                        {item.displayName.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{item.displayName}</Text>
                    <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{item.totalSales} sales · {item.sellerTier}</Text>
                  </View>
                  <Text style={{ color: '#374151', fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* ── Idle State ── */}
      {!isFocused && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 16 }}>Browse Categories</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'Sneakers', emoji: '👟', color: '#1A56DB' },
              { label: 'Fashion', emoji: '👔', color: '#7C3AED' },
              { label: 'Electronics', emoji: '📱', color: '#059669' },
              { label: 'Collectibles', emoji: '🏆', color: '#D97706' },
              { label: 'Jewelry', emoji: '💍', color: '#B45309' },
              { label: 'Trading Cards', emoji: '🃏', color: '#DC2626' },
              { label: 'Toys', emoji: '🧸', color: '#7C3AED' },
              { label: 'Sports', emoji: '⚽', color: '#059669' },
              { label: 'Vintage', emoji: '🎸', color: '#1A56DB' },
              { label: 'Comics', emoji: '📚', color: '#DB2777' },
              { label: 'Beauty', emoji: '💄', color: '#DB2777' },
              { label: 'Food', emoji: '🍜', color: '#D97706' },
            ].map(cat => (
              <TouchableOpacity
                key={cat.label}
                style={{
                  width: (SCREEN_WIDTH - 32 - 10) / 2,
                  backgroundColor: '#1F2937', borderRadius: 16, overflow: 'hidden',
                }}
                onPress={() => { setSearch(cat.label); setIsFocused(true); void doSearch(cat.label); }}
                activeOpacity={0.85}
              >
                <View style={{ backgroundColor: cat.color + '22', padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 36 }}>{cat.emoji}</Text>
                </View>
                <View style={{ padding: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{cat.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
