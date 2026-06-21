import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { apiClient } from '../../src/services/api/client';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '@/stores/auth.store';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StorefrontItem {
  id: string;
  title: string;
  description: string;
  price: number;
  photos: string[];
  category: string;
  viewCount: number;
  status: string;
  createdAt: string;
  order?: {
    id: string;
    status: string;
    shippingName?: string;
    shippingPhone?: string;
    shippingLine1?: string;
    shippingCity?: string;
    shippingProvince?: string;
    shippingPostalCode?: string;
    buyer?: { displayName: string };
  } | null;
}

interface Stats {
  listed: number;
  sold: number;
  totalViews: number;
}

interface ScheduledAuction {
  id: string;
  title: string;
  status: string;
  startTime?: string;
  coverImageUrl?: string;
}

const CATEGORIES = [
  'SNEAKERS', 'TRADING_CARDS', 'WATCHES', 'ELECTRONICS',
  'COLLECTIBLES', 'CLOTHING', 'ACCESSORIES', 'BOOKS', 'TOYS', 'OTHERS',
];

const CATEGORY_LABELS: Record<string, string> = {
  SNEAKERS: 'Sneakers', TRADING_CARDS: 'Trading Cards', WATCHES: 'Watches',
  ELECTRONICS: 'Electronics', COLLECTIBLES: 'Collectibles', CLOTHING: 'Clothing',
  ACCESSORIES: 'Accessories', BOOKS: 'Books', TOYS: 'Toys', OTHERS: 'Others',
};

const EMPTY_FORM = { title: '', description: '', price: '', category: 'OTHERS', photos: [] as string[] };

// ─── Component ───────────────────────────────────────────────────────────────
export default function SellerShopScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [items, setItems]       = useState<StorefrontItem[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab]   = useState<'listed' | 'sold'>('listed');
  const [soldDetailItem, setSoldDetailItem] = useState<StorefrontItem | null>(null);

  // Add/Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem]   = useState<StorefrontItem | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Pull-to-live state
  const [pullSheetOpen, setPullSheetOpen] = useState(false);
  const [pullTarget, setPullTarget]       = useState<StorefrontItem | null>(null);
  const [auctionOptions, setAuctionOptions] = useState<ScheduledAuction[]>([]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        apiClient.get('/seller/shop-items', {
          params: { status: activeTab === 'listed' ? 'STOREFRONT' : 'SOLD', limit: 50 },
        }),
        apiClient.get('/seller/shop-items/stats'),
      ]);
      setItems(itemsRes.data.data.items ?? []);
      setStats(statsRes.data.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useFocusEffect(useCallback(() => { void fetchData(); }, [fetchData]));

  const handleRefresh = () => { setRefreshing(true); void fetchData(); };

  // ── Add / Edit ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (item: StorefrontItem) => {
    setEditingItem(item);
    setForm({
      title:       item.title,
      description: item.description,
      price:       String(item.price / 100),
      category:    item.category,
      photos:      item.photos,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.price) {
      Alert.alert('Missing Info', 'Please fill in title, description, and price.');
      return;
    }
    const priceNum = parseInt(form.price);
    if (isNaN(priceNum) || priceNum < 1) {
      Alert.alert('Invalid Price', 'Price must be a valid number.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title:       form.title.trim(),
        description: form.description.trim(),
        price:       priceNum,
        category:    form.category,
        photos:      form.photos,
      };
      if (editingItem) {
        await apiClient.patch(`/seller/shop-items/${editingItem.id}`, payload);
      } else {
        await apiClient.post('/seller/shop-items', payload);
      }
      setModalVisible(false);
      void fetchData();
    } catch {
      Alert.alert('Error', 'Failed to save item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (item: StorefrontItem) => {
    Alert.alert(
      'Remove Item',
      `Remove "${item.title}" from your storefront?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/seller/shop-items/${item.id}`);
              void fetchData();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Failed to remove item.');
            }
          },
        },
      ]
    );
  };

  // ── Pull to Live ──────────────────────────────────────────────────────────
  const handlePullToLive = async (item: StorefrontItem) => {
    try {
      const res = await apiClient.get(`/auctions/seller/${user?.id}`);
      const scheduled: ScheduledAuction[] =
        (res.data.data ?? []).filter((a: any) => a.status === 'SCHEDULED');

      if (scheduled.length === 0) {
        Alert.alert(
          'No Scheduled Auction',
          'Create a live auction first, then pull this item into its queue.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Sell', onPress: () => router.push('/(main)/sell') },
          ]
        );
        return;
      }

      // Open custom bottom sheet
      setPullTarget(item);
      setAuctionOptions(scheduled);
      setPullSheetOpen(true);
    } catch {
      Alert.alert('Error', 'Could not load your auctions. Try again.');
    }
  };

  const confirmPullToAuction = async (auctionId: string) => {
    if (!pullTarget) return;
    const item = pullTarget;
    setPullSheetOpen(false);
    try {
      await apiClient.post(`/auctions/${auctionId}/items/${item.id}`);
      void fetchData();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to add item.');
    } finally {
      setPullTarget(null);
      setAuctionOptions([]);
    }
  };

  // ── Item card ─────────────────────────────────────────────────────────────
  const openSoldDetail = (item: StorefrontItem) => {
    setSoldDetailItem(item);
  };

  const renderItem = ({ item }: { item: StorefrontItem }) => {
    const photo = item.photos?.[0];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={activeTab === 'sold' ? 0.8 : 1}
        onPress={activeTab === 'sold' ? () => openSoldDetail(item) : undefined}
        disabled={activeTab !== 'sold'}
      >
        {/* Photo */}
        <View style={styles.cardPhoto}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <SymbolView name="photo" size={28} tintColor="#374151" />
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardCategory}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
          <Text style={styles.cardPrice}>{formatPHP(item.price)}</Text>
          <View style={styles.cardMeta}>
            <SymbolView name="eye" size={11} tintColor="#6B7280" />
            <Text style={styles.cardViews}>{item.viewCount} views</Text>
          </View>
        </View>

        {/* Actions */}
        {activeTab === 'listed' && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
              <SymbolView name="pencil" size={15} tintColor="#A78BFA" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handlePullToLive(item)}>
              <SymbolView name="antenna.radiowaves.left.and.right" size={15} tintColor="#1A56DB" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
              <SymbolView name="trash" size={15} tintColor="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <SymbolView name="chevron.left" size={20} tintColor="#E5E7EB" weight="semibold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Shop</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <SymbolView name="plus" size={18} tintColor="#fff" weight="semibold" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#A78BFA" style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Stats */}
          {stats && (
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.listed}</Text>
                <Text style={styles.statLabel}>Listed</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.sold}</Text>
                <Text style={styles.statLabel}>Sold</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {stats.totalViews >= 1000 ? `${(stats.totalViews / 1000).toFixed(1)}k` : stats.totalViews}
                </Text>
                <Text style={styles.statLabel}>Views</Text>
              </View>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabs}>
            {(['listed', 'sold'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => { setActiveTab(tab); setLoading(true); }}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'listed' ? 'Listed' : 'Sold'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Items */}
          <FlatList
            data={items}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#A78BFA" />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <SymbolView name="storefront" size={40} tintColor="#374151" />
                <Text style={styles.emptyTitle}>
                  {activeTab === 'listed' ? 'No items listed yet' : 'No sold items'}
                </Text>
                {activeTab === 'listed' && (
                  <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
                    <Text style={styles.emptyBtnText}>Add Your First Item</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Modal Header */}
          <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingItem ? 'Edit Item' : 'Add to Shop'}
            </Text>
            <TouchableOpacity onPress={() => void handleSave()} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#A78BFA" />
                : <Text style={styles.modalSave}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Text style={styles.fieldLabel}>TITLE</Text>
            <TextInput
              style={styles.fieldInput}
              value={form.title}
              onChangeText={v => setForm(p => ({ ...p, title: v }))}
              placeholder="e.g. Nike Air Max 90"
              placeholderTextColor="#374151"
              maxLength={120}
              returnKeyType="next"
            />

            {/* Description */}
            <Text style={styles.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea]}
              value={form.description}
              onChangeText={v => setForm(p => ({ ...p, description: v }))}
              placeholder="Condition, size, details..."
              placeholderTextColor="#374151"
              maxLength={1000}
              multiline
              numberOfLines={4}
            />

            {/* Price */}
            <Text style={styles.fieldLabel}>PRICE (₱)</Text>
            <TextInput
              style={styles.fieldInput}
              value={form.price}
              onChangeText={v => setForm(p => ({ ...p, price: v.replace(/[^0-9]/g, '') }))}
              placeholder="e.g. 1500"
              placeholderTextColor="#374151"
              keyboardType="numeric"
              returnKeyType="done"
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <TouchableOpacity
              style={styles.categorySelect}
              onPress={() => setCategoryOpen(true)}
            >
              <Text style={styles.categorySelectText}>
                {CATEGORY_LABELS[form.category] ?? form.category}
              </Text>
              <SymbolView name="chevron.down" size={13} tintColor="#6B7280" />
            </TouchableOpacity>

            {/* Photo placeholder — reuses existing upload flow */}
            <Text style={styles.fieldLabel}>PHOTOS</Text>
            <View style={styles.photoPlaceholder}>
              <SymbolView name="photo.badge.plus" size={28} tintColor="#374151" />
              <Text style={styles.photoPlaceholderText}>
                Photo upload coming in next update
              </Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Category picker */}
        <Modal visible={categoryOpen} transparent animationType="slide">
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setCategoryOpen(false)}
          >
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Select Category</Text>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pickerItem, form.category === cat && styles.pickerItemActive]}
                  onPress={() => { setForm(p => ({ ...p, category: cat })); setCategoryOpen(false); }}
                >
                  <Text style={[styles.pickerItemText, form.category === cat && styles.pickerItemTextActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                  {form.category === cat && (
                    <SymbolView name="checkmark" size={14} tintColor="#A78BFA" weight="semibold" />
                  )}
                </TouchableOpacity>
              ))}
              <View style={{ height: insets.bottom + 8 }} />
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>

      {/* Pull to Live — custom bottom sheet */}
      <Modal visible={pullSheetOpen} transparent animationType="slide" onRequestClose={() => setPullSheetOpen(false)}>
        <TouchableOpacity
          style={styles.pullOverlay}
          activeOpacity={1}
          onPress={() => setPullSheetOpen(false)}
        >
          <View style={[styles.pullSheet, { paddingBottom: insets.bottom + 12 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.pullHandle} />
            <View style={styles.pullHeader}>
              <View style={styles.pullIconWrap}>
                <SymbolView name="antenna.radiowaves.left.and.right" size={20} tintColor="#1A56DB" weight="semibold" />
              </View>
              <Text style={styles.pullTitle}>Pull to Live Queue</Text>
              <Text style={styles.pullSubtitle}>
                {pullTarget ? `Add "${pullTarget.title}" to which auction?` : ''}
              </Text>
            </View>

            <View style={styles.pullList}>
              {auctionOptions.map((auction, idx) => (
                <TouchableOpacity
                  key={auction.id}
                  style={[styles.pullOption, idx === auctionOptions.length - 1 && styles.pullOptionLast]}
                  onPress={() => void confirmPullToAuction(auction.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.pullOptionIcon}>
                    <SymbolView name="video.fill" size={15} tintColor="#A78BFA" />
                  </View>
                  <View style={styles.pullOptionText}>
                    <Text style={styles.pullOptionTitle} numberOfLines={1}>{auction.title}</Text>
                    <Text style={styles.pullOptionMeta}>
                      {auction.startTime
                        ? new Date(auction.startTime).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })
                        : 'Scheduled'}
                    </Text>
                  </View>
                  <SymbolView name="chevron.right" size={13} tintColor="#4B5563" />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.pullCancel}
              onPress={() => setPullSheetOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.pullCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sold item detail — buyer + shipping info */}
      <Modal
        visible={!!soldDetailItem}
        transparent
        animationType="slide"
        onRequestClose={() => setSoldDetailItem(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setSoldDetailItem(null)}
        >
          {soldDetailItem && (
            <View
              style={{
                backgroundColor: '#13192A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: 20, paddingBottom: insets.bottom + 24,
              }}
              onStartShouldSetResponder={() => true}
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 18 }} />

              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800', letterSpacing: 0.3, marginBottom: 4 }}>SOLD</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 2 }}>{soldDetailItem.title}</Text>
              <Text style={{ color: '#10B981', fontSize: 15, fontWeight: '700', marginBottom: 16 }}>{formatPHP(soldDetailItem.price)}</Text>

              {soldDetailItem.order ? (
                <>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
                  }}>
                    <SymbolView name="person.fill" size={13} tintColor="#A78BFA" />
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {soldDetailItem.order.buyer?.displayName ?? 'Buyer'}
                    </Text>
                    <View style={{
                      backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 999,
                      paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4,
                    }}>
                      <Text style={{ color: '#A78BFA', fontSize: 10, fontWeight: '700' }}>
                        {soldDetailItem.order.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  {soldDetailItem.order.shippingName ? (
                    <View style={{ backgroundColor: '#1c2742', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                      <Text style={{ color: '#6B7280', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3, marginBottom: 6 }}>
                        SHIP TO
                      </Text>
                      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '600' }}>
                        {soldDetailItem.order.shippingName}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12.5, marginTop: 1 }}>
                        {soldDetailItem.order.shippingPhone}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12.5, marginTop: 4, lineHeight: 17 }}>
                        {soldDetailItem.order.shippingLine1}, {soldDetailItem.order.shippingCity}, {soldDetailItem.order.shippingProvince} {soldDetailItem.order.shippingPostalCode}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
                      No shipping address on file for this order yet.
                    </Text>
                  )}

                  <TouchableOpacity
                    style={{
                      backgroundColor: '#1A56DB', borderRadius: 14, paddingVertical: 15,
                      alignItems: 'center', marginBottom: 10,
                    }}
                    onPress={() => { setSoldDetailItem(null); router.push('/seller/orders' as any); }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Manage in Orders</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
                  No order details found for this sale.
                </Text>
              )}

              <TouchableOpacity
                style={{ paddingVertical: 12, alignItems: 'center' }}
                onPress={() => setSoldDetailItem(null)}
              >
                <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 14 }}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1117' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 17,
    fontWeight: '600', color: '#F9FAFB', letterSpacing: -0.3,
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1A56DB',
    alignItems: 'center', justifyContent: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: '#13192A',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 16,
  },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: 'rgba(255,255,255,0.07)' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#F9FAFB', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', letterSpacing: 0.3, textTransform: 'uppercase' },

  // Tabs
  tabs: {
    flexDirection: 'row', marginHorizontal: 20, marginTop: 16,
    backgroundColor: '#161B27', borderRadius: 12,
    padding: 3, gap: 2,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#1F2937' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#F9FAFB' },

  // List
  listContent: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#13192A',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  cardPhoto: {
    width: 80, height: 80,
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
  },
  cardInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#F9FAFB' },
  cardCategory: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  cardPrice: { fontSize: 15, fontWeight: '700', color: '#A78BFA', marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardViews: { fontSize: 11, color: '#6B7280' },
  cardActions: { flexDirection: 'column', gap: 2, paddingRight: 10 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#1A56DB',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: '#0D1117' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalCancel: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#F9FAFB' },
  modalSave: { fontSize: 16, color: '#A78BFA', fontWeight: '700' },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: 20, paddingTop: 24, gap: 8 },

  // Fields
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: '#4B5563',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, marginTop: 12,
  },
  fieldInput: {
    backgroundColor: '#13192A', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#F9FAFB',
  },
  fieldTextArea: { minHeight: 100, textAlignVertical: 'top' },

  // Category select
  categorySelect: {
    backgroundColor: '#13192A', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  categorySelectText: { fontSize: 15, color: '#F9FAFB', fontWeight: '500' },

  // Photo placeholder
  photoPlaceholder: {
    backgroundColor: '#13192A', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 28,
    alignItems: 'center', gap: 8,
  },
  photoPlaceholderText: { fontSize: 13, color: '#4B5563', textAlign: 'center' },

  // Category picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#13192A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, paddingHorizontal: 20,
  },
  pickerTitle: {
    fontSize: 15, fontWeight: '700', color: '#F9FAFB',
    textAlign: 'center', marginBottom: 16,
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pickerItemActive: {},
  pickerItemText: { fontSize: 15, color: '#9CA3AF', fontWeight: '500' },
  pickerItemTextActive: { color: '#A78BFA', fontWeight: '700' },

  // Pull to Live sheet
  pullOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  pullSheet: {
    backgroundColor: '#13192A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8, paddingHorizontal: 20,
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  pullHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 16,
  },
  pullHeader: { alignItems: 'center', gap: 8, paddingBottom: 20 },
  pullIconWrap: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: 'rgba(26,86,219,0.15)',
    borderWidth: 1, borderColor: 'rgba(26,86,219,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  pullTitle: { fontSize: 17, fontWeight: '700', color: '#F9FAFB', letterSpacing: -0.3 },
  pullSubtitle: {
    fontSize: 13, color: '#9CA3AF', textAlign: 'center',
    paddingHorizontal: 16, lineHeight: 18,
  },
  pullList: {
    backgroundColor: '#0D1117',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  pullOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pullOptionLast: { borderBottomWidth: 0 },
  pullOptionIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  pullOptionText: { flex: 1, gap: 2 },
  pullOptionTitle: { fontSize: 15, fontWeight: '600', color: '#F9FAFB' },
  pullOptionMeta: { fontSize: 12, color: '#6B7280' },
  pullCancel: {
    marginTop: 12, paddingVertical: 14,
    backgroundColor: '#1F2937', borderRadius: 14,
    alignItems: 'center',
  },
  pullCancelText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF' },
});