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
  ActivityIndicator,
} from 'react-native';
import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { HMSVideoViewMode } from '@100mslive/react-native-hms';
import { auctionsApi, AuctionDetail } from '../../../src/services/api/auctions.api';
import { useAuctionSocket } from '../../../src/hooks/useSocket';
import { useAuthStore } from '../../../src/stores/auth.store';
import { useHMS } from '../../../src/hooks/useHMS';
import { formatPHP } from '@auxtion/utils';
import { Dimensions } from 'react-native';

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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HMSView } = require('@100mslive/react-native-hms') as {
  HMSView: React.ComponentType<{
    id: string;
    trackId: string;
    mirror?: boolean;
    scaleType?: string;
    style?: object;
  }>;
};

export default function LiveAuctionRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [shopTab, setShopTab] = useState<'bidding' | 'sold'>('bidding');
  const chatRef = useRef<FlatList>(null);

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

  // Determine role — seller is broadcaster, buyer is viewer
  const isSeller = auction?.seller.id === user?.id;
  const hmsRole = isSeller ? 'broadcaster' : 'viewer-realtime';

  // Only initialize HMS when we have the auction and streamUrl
  const hms = useHMS(
    auction?.streamUrl
      ? {
          roomId: auction.streamUrl,
          userName: user?.displayName ?? 'User',
          role: hmsRole,
        }
      : null as never,
  );

  const { placeBid, sendChat } = useAuctionSocket({
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
  });

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
    sendChat(chatInput.trim());
    setChatInput('');
  };

  const handleLeave = async () => {
    if (hms?.leave) await hms.leave();
    router.back();
  };

  const biddingItems = auction?.shopItems.filter(i => i.status === 'QUEUED' || i.status === 'LIVE') ?? [];
  const soldItems = auction?.shopItems.filter(i => i.status === 'SOLD') ?? [];

  return (
    <View className="flex-1 bg-black">

      {/* ── Full Screen Video ── */}
      <View className="absolute inset-0">
        {auction?.streamUrl && hms?.broadcasterPeer?.videoTrack ? (
          <HMSView
            id={`broadcaster-${hms.broadcasterPeer.id}`}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            mirror={false}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            trackId={hms.broadcasterPeer.videoTrack.trackId as string}
            scaleType={HMSVideoViewMode.ASPECT_FILL}
            style={{ flex: 1 }}
          />
        ) : isSeller && hms?.localPeer?.videoTrack ? (
          <HMSView
            id={`local-${hms.localPeer.id}`}
            mirror={true}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            trackId={hms.localPeer.videoTrack.trackId as string}
            scaleType={HMSVideoViewMode.ASPECT_FILL}
            style={{ flex: 1 }}
          />
        ) : (
          <View className="flex-1 bg-gray-900 items-center justify-center">
            {hms?.isLoading ? (
              <>
                <ActivityIndicator size="large" color="#1A56DB" />
                <Text className="text-gray-400 text-sm mt-3">Connecting to stream...</Text>
              </>
            ) : (
              <>
                <Text className="text-6xl">📺</Text>
                <Text className="text-gray-500 text-sm mt-2">
                  {hms?.error ?? 'Waiting for stream...'}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* ── Top Overlay ── */}
      <View className="absolute top-0 left-0 right-0 pt-14 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
            <View className="w-6 h-6 rounded-full bg-[#1A56DB] items-center justify-center">
              <Text className="text-white text-xs font-bold">
                {auction?.seller.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text className="text-white text-xs font-semibold">
              {auction?.seller.displayName}
            </Text>
          </View>
          <View className="bg-red-600 rounded-full px-3 py-1.5 flex-row items-center gap-1">
            <View className="w-1.5 h-1.5 rounded-full bg-white" />
            <Text className="text-white text-xs font-bold">LIVE</Text>
          </View>
          {viewerCount > 0 && (
            <View className="bg-black/50 rounded-full px-3 py-1.5">
              <Text className="text-white text-xs">👁 {viewerCount}</Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-2">
          {isSeller && (
            <>
              <TouchableOpacity
                className="bg-black/50 rounded-full w-9 h-9 items-center justify-center"
                onPress={() => void hms?.toggleMute()}
              >
                <Text>{hms?.isMuted ? '🔇' : '🎤'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-black/50 rounded-full w-9 h-9 items-center justify-center"
                onPress={() => void hms?.toggleCamera()}
              >
                <Text>{hms?.isCameraOff ? '📵' : '📷'}</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            className="bg-black/50 rounded-full w-9 h-9 items-center justify-center"
            onPress={() => void handleLeave()}
          >
            <Text className="text-white font-bold">✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Chat Messages ── */}
      <View className="absolute left-0 right-0" style={{ bottom: currentItem ? 200 : 160, height: 220 }}>
        <FlatList
          ref={chatRef}
          data={chatMessages.slice(-20)}
          keyExtractor={item => item.id}
          className="px-4"
          contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View className="mb-1.5 flex-row gap-2 items-start">
              <View className="bg-black/60 rounded-2xl px-3 py-1.5 flex-row gap-1.5 items-center flex-shrink">
                <Text className="text-[#1A56DB] text-xs font-bold">{item.displayName}</Text>
                <Text className="text-white text-xs flex-shrink">{item.message}</Text>
              </View>
            </View>
          )}
        />
      </View>

      {/* ── Current Item Bar ── */}
      {currentItem && (
        <View className="absolute left-4 right-4" style={{ bottom: 152 }}>
          <View className="bg-black/70 rounded-2xl px-4 py-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              {currentItem.photos[0] && (
                <Image source={{ uri: currentItem.photos[0] }} className="w-10 h-10 rounded-xl" resizeMode="cover" />
              )}
              <View className="flex-1">
                <Text className="text-white text-sm font-semibold" numberOfLines={1}>{currentItem.title}</Text>
                <Text className="text-gray-400 text-xs">
                  {currentItem.totalBids} bid{currentItem.totalBids !== 1 ? 's' : ''}
                  {currentItem.highestBidderName ? ` · ${currentItem.highestBidderName} leading` : ''}
                </Text>
              </View>
            </View>
            <Text className="text-[#F59E0B] font-bold text-base">{formatPHP(currentItem.currentPrice)}</Text>
          </View>
        </View>
      )}

      {/* ── Bottom Controls ── */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-10 pt-3">
        <View className="flex-row items-center gap-2 mb-3">
          <TextInput
            className="flex-1 bg-black/60 border border-gray-700 rounded-full px-4 py-2.5 text-white text-sm"
            placeholder="Say something..."
            placeholderTextColor="#6B7280"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
          />
          <TouchableOpacity className="w-10 h-10 bg-black/60 border border-gray-700 rounded-full items-center justify-center" onPress={handleSendChat}>
            <Text className="text-white">→</Text>
          </TouchableOpacity>
          <TouchableOpacity className="w-10 h-10 bg-black/60 border border-gray-700 rounded-full items-center justify-center" onPress={() => setShowShop(true)}>
            <Text>🛍️</Text>
          </TouchableOpacity>
        </View>

        {!isSeller && (currentItem ? (
          <TouchableOpacity className="bg-[#1A56DB] rounded-2xl py-4 items-center" onPress={handleBid}>
            <Text className="text-white font-bold text-lg">🔨 Bid {formatPHP(currentItem.currentPrice + 10000)}</Text>
            <Text className="text-blue-200 text-xs mt-0.5">Current: {formatPHP(currentItem.currentPrice)}</Text>
          </TouchableOpacity>
        ) : (
          <View className="bg-black/60 border border-gray-700 rounded-2xl py-4 items-center">
            <Text className="text-gray-500 font-semibold">Waiting for next item...</Text>
          </View>
        ))}
      </View>

      {/* ── Shop Drawer ── */}
      <Modal visible={showShop} animationType="slide" transparent onRequestClose={() => setShowShop(false)}>
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={() => setShowShop(false)} />
        <View className="bg-gray-900 rounded-t-3xl border-t border-gray-800" style={{ maxHeight: '65%' }}>
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-gray-700" />
          </View>
          <Text className="text-white font-bold text-lg px-6 mb-4">Shop</Text>
          <View className="flex-row px-6 mb-4 gap-2">
            {(['bidding', 'sold'] as const).map(tab => (
              <TouchableOpacity key={tab} className={`px-4 py-2 rounded-full ${shopTab === tab ? 'bg-[#1A56DB]' : 'bg-gray-800'}`} onPress={() => setShopTab(tab)}>
                <Text className={`text-sm font-semibold ${shopTab === tab ? 'text-white' : 'text-gray-400'}`}>
                  {tab === 'bidding' ? '🔨 For Bidding' : '✅ Sold'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView className="px-6 pb-10">
            {(shopTab === 'bidding' ? biddingItems : soldItems).map(item => (
              <View key={item.id} className="flex-row items-center gap-3 bg-gray-800 rounded-xl p-3 mb-2">
                <View className="w-14 h-14 rounded-xl bg-gray-700 overflow-hidden items-center justify-center">
                  {item.photos[0] ? <Image source={{ uri: item.photos[0] }} className="w-full h-full" resizeMode="cover" /> : <Text className="text-2xl">📦</Text>}
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-semibold" numberOfLines={1}>{item.title}</Text>
                  <Text className="text-[#F59E0B] text-xs">{formatPHP(item.price)}</Text>
                </View>
                {item.status === 'LIVE' && (
                  <View className="bg-red-600 rounded-full px-2 py-0.5">
                    <Text className="text-white text-xs font-bold">NOW</Text>
                  </View>
                )}
              </View>
            ))}
            {(shopTab === 'bidding' ? biddingItems : soldItems).length === 0 && (
              <View className="items-center py-8">
                <Text className="text-gray-600 text-sm">{shopTab === 'bidding' ? 'No items queued' : 'No items sold yet'}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}