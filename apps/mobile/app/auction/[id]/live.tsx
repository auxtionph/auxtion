import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ScrollView,
  Modal,
  Image,
  Dimensions,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { auctionsApi, AuctionDetail } from '../../../src/services/api/auctions.api';
import { useAuctionSocket } from '../../../src/hooks/useSocket';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../../src/stores/auth.store';
import { useHMS } from '../../../src/hooks/useHMS';
import { apiClient } from '../../../src/services/api/client';
import { HMSVideoView } from '../../../src/components/stream/HMSView';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatMsg {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

interface CurrentItem {
  itemId: string;
  title: string;
  currentPrice: number;
  photos: string[];
  totalBids: number;
  highestBidderName?: string;
}

interface BidUpdateData {
  auctionId: string;
  itemId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  totalBids: number;
  timestamp: number;
}

interface ChatData {
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
}

interface ItemStartedData {
  itemId: string;
  title: string;
  currentPrice: number;
  photos: string[];
}

interface ItemEndedData {
  itemId: string;
  winner: { userId: string; displayName: string; amount: number } | null;
}

export default function LiveAuctionRoom() {
  const { id, role: routeRole } = useLocalSearchParams<{ id: string; role?: string }>();
  const router = useRouter();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [shopTab, setShopTab] = useState<'bidding' | 'sold'>('bidding');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const chatRef = useRef<FlatList>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    void auctionsApi.getById(id).then(data => {
      setAuction(data);
      const liveItem = data.shopItems.find(i => i.status === 'LIVE');
      if (liveItem) {
        setCurrentItem({
          itemId: liveItem.id,
          title: liveItem.title,
          currentPrice: liveItem.price,
          photos: liveItem.photos,
          totalBids: 0,
        });
      }
    });
  }, [id]);

  const { placeBid, sendChat, endAuction } = useAuctionSocket({
    auctionId: id,
    onBidUpdate: useCallback((data: BidUpdateData) => {
      setCurrentItem(prev => prev ? {
        ...prev,
        currentPrice: data.amount,
        totalBids: data.totalBids,
        highestBidderName: data.bidderName,
      } : prev);
      setChatMessages(prev => [...prev, {
        id: `bid-${data.timestamp}`,
        userId: data.bidderId,
        displayName: data.bidderName,
        message: `🔨 Bid ${formatPHP(data.amount)}`,
        timestamp: data.timestamp,
      }]);
    }, []),
    onBidConfirmed: useCallback(() => {}, []),
    onBidError: useCallback((error: { message: string }) => {
      Alert.alert('Bid Failed', error.message);
    }, []),
    onChatMessage: useCallback((data: ChatData) => {
      setChatMessages(prev => [...prev, {
        id: `chat-${data.timestamp}-${data.userId}`,
        userId: data.userId,
        displayName: data.displayName,
        message: data.message,
        timestamp: data.timestamp,
      }]);
    }, []),
    onItemStarted: useCallback((data: ItemStartedData) => {
      setCurrentItem({
        itemId: data.itemId,
        title: data.title,
        currentPrice: data.currentPrice,
        photos: data.photos,
        totalBids: 0,
      });
    }, []),
    onItemEnded: useCallback((data: ItemEndedData) => {
      if (data.winner) {
        Alert.alert('🎉 Item Sold!', `${data.winner.displayName} won for ${formatPHP(data.winner.amount)}`);
      }
      setCurrentItem(null);
    }, []),
    onViewerCount: useCallback((data: { count: number }) => {
      setViewerCount(data.count);
    }, []),
    onChatHistory: useCallback((messages) => {
      setChatMessages(messages.map(m => ({
        id: `hist-${m.timestamp}-${m.userId}`,
        userId: m.userId,
        displayName: m.displayName,
        message: m.message,
        timestamp: m.timestamp,
      })));
    }, []),
    onAuctionEnded: useCallback(() => {
      console.log('onAuctionEnded callback fired!');
      setAuctionEnded(true);
      setTimeout(() => router.replace('/(main)'), 3000);
    }, [router]),
  });

  const { user } = useAuthStore();
  const isSellerImmediate = routeRole === 'broadcaster';
  const isSeller = auction ? auction.seller.id === user?.id : isSellerImmediate;

  const [roomId, setRoomId] = useState<string | null>(null);
  useEffect(() => {
    if (auction?.streamUrl && !roomId) {
      setRoomId(auction.streamUrl);
    }
  }, [auction?.streamUrl, roomId]);

  const hms = useHMS({
    roomId,
    userName: user?.displayName ?? 'User',
    role: isSeller ? 'broadcaster' : 'viewer-realtime',
  });

  const handleLeave = async () => {
    if (isSeller) {
      Alert.alert(
        'End Live?',
        'Are you sure you want to end your live auction?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Live',
            style: 'destructive',
            onPress: async () => {
              try {
                await apiClient.patch(`/auctions/${id}/end`);
                endAuction();
              } catch { /* ignore */ }
              await hms.leave();
              router.replace('/(main)');
            },
          },
        ],
      );
    } else {
      await hms.leave();
      router.back();
    }
  };

  const prevBroadcasterRef = useRef<string | null>(null);
  useEffect(() => {
    if (isSeller) return;
    const currentId = hms.broadcasterPeer?.id ?? null;
    if (prevBroadcasterRef.current && !currentId) {
      setAuctionEnded(true);
    }
    prevBroadcasterRef.current = currentId;
  }, [hms.broadcasterPeer?.id, isSeller]);

  const handleBid = () => {
    if (!currentItem) return;
    const nextBid = currentItem.currentPrice + 10000;
    Alert.alert(
      'Place Bid',
      `Bid ${formatPHP(nextBid)} on ${currentItem.title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Bid ${formatPHP(nextBid)}`, onPress: () => placeBid(currentItem.itemId, nextBid) },
      ],
    );
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim(), user?.id, user?.displayName);
    setChatInput('');
  };

  const biddingItems = auction?.shopItems.filter(i => i.status === 'QUEUED' || i.status === 'LIVE') ?? [];
  const soldItems = auction?.shopItems.filter(i => i.status === 'SOLD') ?? [];

  const sellerTrackId = hms.localPeer?.videoTrackId ?? null;
  const viewerTrackId = hms.broadcasterPeer?.id
    ? (hms.trackMap[hms.broadcasterPeer.id] ?? null)
    : null;

  const renderVideoBackground = () => {
    if (isSeller) {
      if (!hms.isJoined || !hms.hmsInstance) {
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#1A56DB" />
            <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 12 }}>Starting camera...</Text>
          </View>
        );
      }
      return (
        <HMSVideoView
          hmsInstance={hms.hmsInstance}
          trackId={sellerTrackId}
          mirror={true}
          style={{ flex: 1 }}
        />
      );
    }

    if (!hms.isJoined) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
          <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 12 }}>Connecting to stream...</Text>
        </View>
      );
    }

    if (viewerTrackId) {
      return (
        <HMSVideoView
          hmsInstance={hms.hmsInstance}
          trackId={viewerTrackId}
          mirror={false}
          style={{ flex: 1 }}
        />
      );
    }

    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 64 }}>📺</Text>
        <Text style={{ color: '#4B5563', fontSize: 14, marginTop: 8 }}>Watching live</Text>
      </View>
    );
  };

  // Right-side controls shift up when item bar is visible
  const rightControlsBottom = currentItem ? 230 : 190;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>

      {/* ── Full Screen Video Background ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#111827' }}>
        {renderVideoBackground()}
      </View>

      {/* ── Top Bar: seller info + close ── */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 56, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: avatar + LIVE + viewers */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999,
            paddingHorizontal: 10, paddingVertical: 6,
          }}>
            <View style={{
              width: 24, height: 24, borderRadius: 12,
              backgroundColor: '#1A56DB', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                {auction?.seller.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {auction?.seller.displayName}
            </Text>
          </View>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: '#DC2626', borderRadius: 999,
            paddingHorizontal: 10, paddingVertical: 6,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>LIVE</Text>
          </View>

          {viewerCount > 0 && (
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999,
              paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ color: '#fff', fontSize: 11 }}>👁 {viewerCount}</Text>
            </View>
          )}
        </View>

        {/* Right: close only — seller controls moved to right side panel */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999,
            width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
          }}
          onPress={() => void handleLeave()}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Right Side Seller Controls (Whatnot-style vertical stack) ── */}
      {isSeller && hms.isJoined && (
        <View style={{
          position: 'absolute',
          right: 12,
          bottom: rightControlsBottom + keyboardHeight,
          alignItems: 'center',
          gap: 20,
        }}>

          {/* Mute */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => void hms.toggleMute()}
            activeOpacity={0.75}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: hms.isMuted ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.60)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>{hms.isMuted ? '🔇' : '🎙️'}</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
              {hms.isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {/* Camera */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => void hms.toggleCamera()}
            activeOpacity={0.75}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: hms.isCameraOff ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.60)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>{hms.isCameraOff ? '📵' : '📹'}</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
              {hms.isCameraOff ? 'Start' : 'Stop'}
            </Text>
          </TouchableOpacity>

          {/* Flip */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => void hms.switchCamera()}
            activeOpacity={0.75}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.60)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>🔄</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Flip</Text>
          </TouchableOpacity>

          {/* Shop */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => setShowShop(true)}
            activeOpacity={0.75}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.60)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>🛍️</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Shop</Text>
          </TouchableOpacity>

        </View>
      )}

      {/* ── Chat Messages ── */}
      <View style={{
        position: 'absolute',
        left: 0,
        // Indent right to avoid overlapping seller controls
        right: isSeller ? 68 : 0,
        bottom: (currentItem ? 200 : 160) + keyboardHeight,
        height: 220,
      }}>
        <FlatList
          ref={chatRef}
          data={chatMessages.slice(-20)}
          keyExtractor={item => item.id}
          style={{ paddingHorizontal: 16 }}
          contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 6, flexDirection: 'row' }}>
              <View style={{
                backgroundColor: 'rgba(0,0,0,0.60)', borderRadius: 18,
                paddingHorizontal: 12, paddingVertical: 6,
                flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1,
              }}>
                <Text style={{ color: '#1A56DB', fontSize: 11, fontWeight: '700' }}>
                  {item.displayName}
                </Text>
                <Text style={{ color: '#fff', fontSize: 11, flexShrink: 1 }}>
                  {item.message}
                </Text>
              </View>
            </View>
          )}
        />
      </View>

      {/* ── Current Item Bar ── */}
      {currentItem && (
       <View style={{ position: 'absolute', left: 16, right: 16, bottom: 152 + keyboardHeight }}>
          <View style={{
            backgroundColor: 'rgba(0,0,0,0.70)', borderRadius: 16,
            paddingHorizontal: 16, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              {currentItem.photos[0] && (
                <Image
                  source={{ uri: currentItem.photos[0] }}
                  style={{ width: 40, height: 40, borderRadius: 10 }}
                  resizeMode="cover"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  {currentItem.title}
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                  {currentItem.totalBids} bid{currentItem.totalBids !== 1 ? 's' : ''}
                  {currentItem.highestBidderName ? ` · ${currentItem.highestBidderName} leading` : ''}
                </Text>
              </View>
            </View>
            <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 15 }}>
              {formatPHP(currentItem.currentPrice)}
            </Text>
          </View>
        </View>
      )}

      {/* ── Bottom Controls ── */}
      <View style={{
        position: 'absolute', bottom: keyboardHeight, left: 0, right: 0,
        paddingHorizontal: 16, paddingBottom: keyboardHeight > 0 ? 12 : 40, paddingTop: 12,
      }}>
        {/* Chat input row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <TextInput
            style={{
              flex: 1, backgroundColor: 'rgba(0,0,0,0.60)',
              borderWidth: 1, borderColor: '#374151', borderRadius: 999,
              paddingHorizontal: 16, paddingVertical: 10,
              color: '#fff', fontSize: 13,
            }}
            placeholder="Say something..."
            placeholderTextColor="#6B7280"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.60)', borderWidth: 1, borderColor: '#374151',
              alignItems: 'center', justifyContent: 'center',
            }}
            onPress={handleSendChat}
          >
            <Text style={{ color: '#fff', fontSize: 16 }}>→</Text>
          </TouchableOpacity>

          {/* Shop button — viewers only; seller has it in right panel */}
          {!isSeller && (
            <TouchableOpacity
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(0,0,0,0.60)', borderWidth: 1, borderColor: '#374151',
                alignItems: 'center', justifyContent: 'center',
              }}
              onPress={() => setShowShop(true)}
            >
              <Text style={{ fontSize: 18 }}>🛍️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bid button — viewers only */}
        {!isSeller && (
          currentItem ? (
            <TouchableOpacity
              style={{
                backgroundColor: '#1A56DB', borderRadius: 16,
                paddingVertical: 16, alignItems: 'center',
              }}
              onPress={handleBid}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
                🔨 Bid {formatPHP(currentItem.currentPrice + 10000)}
              </Text>
              <Text style={{ color: '#BFDBFE', fontSize: 11, marginTop: 2 }}>
                Current price: {formatPHP(currentItem.currentPrice)}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{
              backgroundColor: 'rgba(0,0,0,0.60)', borderWidth: 1, borderColor: '#374151',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            }}>
              <Text style={{ color: '#6B7280', fontWeight: '600' }}>Waiting for next item...</Text>
            </View>
          )
        )}

        {/* Seller bottom: end live button */}
        {isSeller && (
          <TouchableOpacity
            style={{
              backgroundColor: 'rgba(220,38,38,0.15)',
              borderWidth: 1, borderColor: '#DC2626',
              borderRadius: 16, paddingVertical: 14, alignItems: 'center',
            }}
            onPress={() => void handleLeave()}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#F87171', fontWeight: '700', fontSize: 15 }}>
              End Live
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Shop Drawer ── */}
      <Modal
        visible={showShop}
        animationType="slide"
        transparent
        onRequestClose={() => setShowShop(false)}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowShop(false)} />
        <View style={{
          backgroundColor: '#111827',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderTopWidth: 1, borderColor: '#1F2937',
          maxHeight: '65%',
        }}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#374151' }} />
          </View>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17, paddingHorizontal: 24, marginBottom: 16 }}>
            Shop
          </Text>
          <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginBottom: 16, gap: 8 }}>
            {(['bidding', 'sold'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: shopTab === tab ? '#1A56DB' : '#1F2937',
                }}
                onPress={() => setShopTab(tab)}
              >
                <Text style={{
                  fontSize: 13, fontWeight: '600',
                  color: shopTab === tab ? '#fff' : '#9CA3AF',
                }}>
                  {tab === 'bidding' ? '🔨 For Bidding' : '✅ Sold'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView style={{ paddingHorizontal: 24, marginBottom: 32 }}>
            {(shopTab === 'bidding' ? biddingItems : soldItems).map(item => (
              <View key={item.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: '#1F2937', borderRadius: 12,
                padding: 12, marginBottom: 8,
              }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 10,
                  backgroundColor: '#374151', overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.photos[0] ? (
                    <Image source={{ uri: item.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 24 }}>📦</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: '#F59E0B', fontSize: 12 }}>{formatPHP(item.price)}</Text>
                </View>
                {item.status === 'LIVE' && (
                  <View style={{
                    backgroundColor: '#DC2626', borderRadius: 999,
                    paddingHorizontal: 8, paddingVertical: 2,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>NOW</Text>
                  </View>
                )}
              </View>
            ))}
            {(shopTab === 'bidding' ? biddingItems : soldItems).length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ color: '#4B5563', fontSize: 13 }}>
                  {shopTab === 'bidding' ? 'No items queued' : 'No items sold yet'}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Auction Ended Overlay ── */}
      {auctionEnded && !isSeller && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.88)',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 999,
        }}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>📺</Text>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
            Live has ended
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 32, textAlign: 'center', paddingHorizontal: 40 }}>
            Thanks for watching! The seller has ended the live auction.
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 12 }}>Redirecting you back...</Text>
        </View>
      )}
    </View>
  );
}
