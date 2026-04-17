import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { auctionsApi, AuctionDetail } from '../../src/services/api/auctions.api';
import { shopItemsApi } from '../../src/services/api/shop-items.api';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../src/stores/auth.store';

export default function AuctionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [startingLive, setStartingLive] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);

  const fetchAuction = useCallback(async () => {
    try {
      const data = await auctionsApi.getById(id);
      setAuction(data);
      setError('');
    } catch {
      setError('Failed to load auction');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchAuction();
  }, [fetchAuction]);

  useFocusEffect(useCallback(() => {
    void fetchAuction();
  }, [fetchAuction]));

  const onRefresh = () => {
    setRefreshing(true);
    void fetchAuction();
  };

  const handleGoLive = () => {
    if (!auction) return;
    setShowGoLiveModal(true);
  };

  const confirmGoLive = async () => {
    try {
      setStartingLive(true);
      setShowGoLiveModal(false);
      await auctionsApi.goLive(id);
      router.push(`/auction/${id}/live?role=broadcaster` as never);
    } catch {
      Alert.alert('Error', 'Failed to start live. Please try again.');
    } finally {
      setStartingLive(false);
    }
  };

  const handleRemoveItem = (item: { id: string; title: string }) => {
    Alert.alert(
      'Remove Item',
      `Remove "${item.title}" from the auction?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await shopItemsApi.delete(item.id);
              void fetchAuction();
            } catch {
              Alert.alert('Error', 'Failed to remove item.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (error || !auction) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Auction Not Found</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#1A56DB', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLive = auction.status === 'LIVE';
  const isScheduled = auction.status === 'SCHEDULED';
  const isEnded = auction.status === 'ENDED';
  const isSeller = auction.seller.id === user?.id;

  const queuedItems = auction.shopItems.filter(i => i.status === 'QUEUED' || i.status === 'AVAILABLE');
  const liveItem = auction.shopItems.find(i => i.status === 'LIVE');
  const soldItems = auction.shopItems.filter(i => i.status === 'SOLD');

  return (
    <View style={{ flex: 1, backgroundColor: '#1E2A3A' }}>
      {/* Header */}
      <View style={{
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: '#1A56DB', fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, flex: 1 }} numberOfLines={1}>
          {auction.title}
        </Text>
        {isLive && (
          <View style={{ backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56DB" />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Thumbnail */}
        <View style={{ width: '100%', height: 200, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }}>
          {auction.shopItems[0]?.photos?.[0] ? (
            <Image
              source={{ uri: auction.shopItems[0].photos[0] }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontSize: 64 }}>📦</Text>
          )}
        </View>

        <View style={{ padding: 20 }}>

          {/* Seller Info */}
          <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: '#111827', borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: '#1F2937', marginBottom: 24,
              }}
              onPress={() => router.push(`/user/${auction.seller.id}` as never)}
              activeOpacity={0.8}
            >
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                {auction.seller.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {auction.seller.displayName}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>
                {auction.seller.sellerTier} Seller · {auction.seller.totalSales} sales
              </Text>
            </View>
            {!isSeller && (
              <TouchableOpacity style={{ backgroundColor: '#1F2937', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Follow</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Auction Info */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20, marginBottom: 4 }}>
              {auction.title}
            </Text>
            {isScheduled && (
              <Text style={{ color: '#F59E0B', fontSize: 13 }}>
                Starts {new Date(auction.startTime).toLocaleDateString('en-PH', {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                  timeZone: 'Asia/Manila',
                })}
              </Text>
            )}
          </View>

          {/* ── SELLER MANAGEMENT SECTION ── */}
          {isSeller && (
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  Item Queue ({queuedItems.length})
                </Text>
                {/* Add Item button */}
                {!isEnded && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#1A56DB', borderRadius: 999,
                      paddingHorizontal: 14, paddingVertical: 8,
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                    }}
                    onPress={() => router.push(`/auction/${id}/items/add`)}
                  >
                    <Text style={{ color: '#fff', fontSize: 18, lineHeight: 20 }}>+</Text>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Add Item</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Currently Live Item */}
              {liveItem && (
                <View style={{
                  backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 16,
                  padding: 14, marginBottom: 10,
                  borderWidth: 1, borderColor: '#DC2626',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} />
                    <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '700' }}>NOW LIVE</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: '#1F2937', overflow: 'hidden' }}>
                      {liveItem.photos[0] ? (
                        <Image source={{ uri: liveItem.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 22 }}>📦</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                        {liveItem.title}
                      </Text>
                      <Text style={{ color: '#F59E0B', fontSize: 13 }}>{formatPHP(liveItem.price)}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Queued Items */}
              {queuedItems.length === 0 && !liveItem ? (
                <TouchableOpacity
                  style={{
                    borderWidth: 2, borderColor: '#1A56DB', borderStyle: 'dashed',
                    borderRadius: 16, padding: 24, alignItems: 'center',
                  }}
                  onPress={() => router.push(`/auction/${id}/items/add`)}
                >
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📦</Text>
                  <Text style={{ color: '#1A56DB', fontWeight: '600', fontSize: 14 }}>Add your first item</Text>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Tap to add items to your auction queue</Text>
                </TouchableOpacity>
              ) : (
                queuedItems.map((item, index) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: '#111827', borderRadius: 14,
                      padding: 12, marginBottom: 8,
                      borderWidth: 1, borderColor: '#1F2937',
                    }}
                  >
                    {/* Queue number */}
                    <View style={{ width: 24, alignItems: 'center' }}>
                      <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '700' }}>
                        {index + 1}
                      </Text>
                    </View>

                    {/* Photo */}
                    <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#1F2937', overflow: 'hidden' }}>
                      {item.photos[0] ? (
                        <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 20 }}>📦</Text>
                        </View>
                      )}
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={{ color: '#F59E0B', fontSize: 12 }}>
                        Starting at {formatPHP(item.price)}
                      </Text>
                    </View>

                    {/* Delete */}
                    {!isEnded && (
                      <TouchableOpacity
                        style={{ padding: 8 }}
                        onPress={() => handleRemoveItem(item)}
                      >
                        <Text style={{ color: '#6B7280', fontSize: 16 }}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}

              {/* Sold Items */}
              {soldItems.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
                    Sold ({soldItems.length})
                  </Text>
                  {soldItems.map(item => (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: '#111827', borderRadius: 14,
                        padding: 12, marginBottom: 8,
                        borderWidth: 1, borderColor: '#1F2937',
                        opacity: 0.6,
                      }}
                    >
                      <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#1F2937', overflow: 'hidden' }}>
                        {item.photos[0] ? (
                          <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 20 }}>📦</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={{ color: '#10B981', fontSize: 12 }}>✅ Sold for {formatPHP(item.price)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── BUYER ITEM VIEW ── */}
          {!isSeller && auction.shopItems.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                Items ({auction.shopItems.length})
              </Text>
              {auction.shopItems.map((item, index) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: '#111827', borderRadius: 14,
                    padding: 12, marginBottom: 8,
                    borderWidth: 1, borderColor: '#1F2937',
                  }}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#1F2937', overflow: 'hidden' }}>
                    {item.photos?.[0] ? (
                      <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20 }}>📦</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                      {index + 1}. {item.title}
                    </Text>
                    <Text style={{ color: '#F59E0B', fontSize: 12 }}>
                      {formatPHP(item.price)}
                    </Text>
                  </View>
                  {item.status === 'LIVE' && (
                    <View style={{ backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>NOW</Text>
                    </View>
                  )}
                  {item.status === 'SOLD' && (
                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Sold</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Recent Bids */}
          {auction.bids.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                Recent Bids
              </Text>
              {auction.bids.slice(0, 5).map((bid) => (
                <View
                  key={bid.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#1F2937',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                        {bid.bidder.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ color: '#D1D5DB', fontSize: 13 }}>
                      {bid.bidder.displayName}
                    </Text>
                  </View>
                  <Text style={{ color: '#F59E0B', fontWeight: '600', fontSize: 13 }}>
                    {formatPHP(bid.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16,
        backgroundColor: '#1E2A3A', borderTopWidth: 1, borderColor: '#1F2937',
      }}>
        {/* SELLER CTAs */}
        {isSeller && (
          <>
            {isScheduled && (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: startingLive ? '#374151' : '#DC2626',
                    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
                  }}
                  onPress={() => void handleGoLive()}
                  disabled={startingLive}
                >
                  {startingLive ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>🔴 Go Live</Text>
                      <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>
                        {auction.shopItems.length === 0
                          ? 'Add items before going live'
                          : `Start with ${auction.shopItems.length} item${auction.shopItems.length !== 1 ? 's' : ''}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: 'transparent',
                    borderWidth: 1, borderColor: '#374151',
                    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                  }}
                  onPress={() => {
                    Alert.alert(
                      'Cancel Auction',
                      'Are you sure you want to cancel this scheduled auction?',
                      [
                        { text: 'Keep it', style: 'cancel' },
                        {
                          text: 'Cancel Auction',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await auctionsApi.cancelAuction(id);
                              router.back();
                            } catch {
                              Alert.alert('Error', 'Failed to cancel auction.');
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>Cancel Auction</Text>
                </TouchableOpacity>
              </View>
            )}
            {isLive && (
              <TouchableOpacity
                style={{ backgroundColor: '#DC2626', borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}
                onPress={() => router.push(`/auction/${id}/live?role=broadcaster` as never)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>📡 Return to Live</Text>
                <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>Your auction is live now</Text>
              </TouchableOpacity>
            )}
            {isEnded && (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 17 }}>Auction Ended</Text>
                <Text style={{ color: '#4B5563', fontSize: 12, marginTop: 2 }}>
                  {soldItems.length} item{soldItems.length !== 1 ? 's' : ''} sold
                </Text>
              </View>
            )}
          </>
        )}

        {/* BUYER CTAs */}
        {!isSeller && (
          <>
            {isLive && (
              <TouchableOpacity
                style={{ backgroundColor: '#DC2626', borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}
                onPress={() => router.push(`/auction/${id}/live`)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>🔴 Join Live Auction</Text>
                <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>Tap to watch and bid</Text>
              </TouchableOpacity>
            )}
            {isScheduled && (
              <TouchableOpacity style={{ backgroundColor: '#F59E0B', borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#000', fontWeight: '700', fontSize: 17 }}>⏰ Set Reminder</Text>
                <Text style={{ color: '#78350F', fontSize: 12, marginTop: 2 }}>Get notified when this goes live</Text>
              </TouchableOpacity>
            )}
            {isEnded && (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 16, paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 17 }}>Auction Ended</Text>
              </View>
            )}
          </>
        )}
      </View>
      {/* ── Go Live Confirmation Modal ── */}
      <Modal
        visible={showGoLiveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoLiveModal(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 24,
        }}>
          <View style={{
            backgroundColor: '#111827', borderRadius: 24,
            padding: 28, width: '100%',
            borderWidth: 1, borderColor: '#1F2937',
          }}>
            {/* Icon */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: 'rgba(220,38,38,0.15)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: '#DC2626',
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 32 }}>🔴</Text>
              </View>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20, marginBottom: 8 }}>
                Ready to go live?
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Your auction <Text style={{ color: '#fff', fontWeight: '600' }}>{auction?.title}</Text> will go live and viewers will be able to join and bid.
              </Text>
            </View>

            {/* Checklist */}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              padding: 16, marginBottom: 24, gap: 10,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 16 }}>{auction?.shopItems && auction.shopItems.length > 0 ? '✅' : '⚠️'}</Text>
                <Text style={{ color: auction?.shopItems && auction.shopItems.length > 0 ? '#10B981' : '#F59E0B', fontSize: 13 }}>
                  {auction?.shopItems && auction.shopItems.length > 0
                    ? `${auction.shopItems.length} item${auction.shopItems.length !== 1 ? 's' : ''} ready`
                    : 'No items added yet'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 16 }}>✅</Text>
                <Text style={{ color: '#10B981', fontSize: 13 }}>Stream will start automatically</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 16 }}>✅</Text>
                <Text style={{ color: '#10B981', fontSize: 13 }}>Buyers will be notified</Text>
              </View>
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={{
                backgroundColor: '#DC2626', borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 10,
              }}
              onPress={() => void confirmGoLive()}
              disabled={startingLive}
            >
              {startingLive ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                  🔴 Yes, Go Live Now
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: 'transparent', borderRadius: 14,
                paddingVertical: 14, alignItems: 'center',
                borderWidth: 1, borderColor: '#374151',
              }}
              onPress={() => setShowGoLiveModal(false)}
            >
              <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>
                Not yet
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}