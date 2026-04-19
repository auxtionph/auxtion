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
  KeyboardAvoidingView,
  Animated,
  PanResponder,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { auctionsApi, AuctionDetail } from '../../../src/services/api/auctions.api';
import { useAuctionSocket } from '../../../src/hooks/useSocket';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../../src/stores/auth.store';
import { useHMS } from '../../../src/hooks/useHMS';
import { HMSVideoView } from '../../../src/components/stream/HMSView';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatMsg {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
  type?: 'message' | 'item-divider';
  itemTitle?: string;
}

interface CurrentItem {
  itemId: string;
  title: string;
  currentPrice: number;
  photos: string[];
  totalBids: number;
  highestBidderName?: string;
  mode: 'auction' | 'chat';
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

const SCREEN_WIDTH = Dimensions.get('window').width;

const getBidIncrement = (price: number): number => {
  if (price < 1_000_000) return 10_000;  // under ₱10,000 → +₱100
  return 50_000;                          // ₱10,000+ → +₱500
};

function SwipeBidButton({ label, sublabel, onBid }: {
  label: string;
  sublabel: string;
  onBid: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = SCREEN_WIDTH * 0.55;
  const MAX_DRAG = SCREEN_WIDTH - 32 - 56;
  const onBidRef = useRef(onBid);
  useEffect(() => { onBidRef.current = onBid; }, [onBid]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const val = Math.max(0, Math.min(g.dx, MAX_DRAG));
      translateX.setValue(val);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx >= THRESHOLD) {
        onBidRef.current();
        // Then animate back
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  return (
    <View style={{
      backgroundColor: '#1A56DB', borderRadius: 16,
      height: 60, overflow: 'hidden', justifyContent: 'center',
    }}>
      <View style={{ position: 'absolute', width: '100%', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 17 }}>{label}</Text>
        <Text style={{ color: 'rgba(191,219,254,0.9)', fontSize: 11, marginTop: 2 }}>{sublabel}</Text>
      </View>
      <View style={{ position: 'absolute', right: 16, flexDirection: 'row', gap: 2, opacity: 0.3 }}>
        <Text style={{ color: '#fff', fontSize: 14 }}>›</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>›</Text>
        <Text style={{ color: '#fff', fontSize: 14 }}>›</Text>
      </View>
      <Animated.View
        style={{
          transform: [{ translateX }],
          width: 52, height: 52, borderRadius: 12, marginLeft: 4,
          backgroundColor: 'rgba(255,255,255,0.2)',
          alignItems: 'center', justifyContent: 'center',
        }}
        {...panResponder.panHandlers}
      >
        <Text style={{ fontSize: 22 }}>🔨</Text>
      </Animated.View>
    </View>
  );
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
  const [shopTab, setShopTab] = useState<'bidding' | 'buynow' | 'sold'>('bidding');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [counterbidSeconds, setCounterbidSeconds] = useState(5);
  const [showStartItem, setShowStartItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string; price: number } | null>(null);
  const [startSeconds, setStartSeconds] = useState(30);
  const [startCounterbid, setStartCounterbid] = useState(5);
  const [customStartSeconds, setCustomStartSeconds] = useState(false);
  const [customCounterbid, setCustomCounterbid] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [showCustomBid, setShowCustomBid] = useState(false);
  const [customBidInput, setCustomBidInput] = useState('');
  const [winnerBanner, setWinnerBanner] = useState<string | null>(null);
  const [showLiveOfferModal, setShowLiveOfferModal] = useState(false);
  const [selectedBuyNowItem, setSelectedBuyNowItem] = useState<{ id: string; title: string; price: number; minimumOffer: number } | null>(null);
  const [liveOfferPercent, setLiveOfferPercent] = useState<number | null>(-20);
  const [liveCustomOffer, setLiveCustomOffer] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<{
    offerId: string;
    itemTitle: string;
    buyerName: string;
    amount: number;
  } | null>(null);
  const { user } = useAuthStore();
  const isSellerImmediate = routeRole === 'broadcaster';
  const isSeller = auction ? auction.seller.id === user?.id : isSellerImmediate;

  const chatRef = useRef<FlatList>(null);
  const currentItemRef = useRef<CurrentItem | null>(null); 
  const bidStateReceivedRef = useRef(false);
  const [broadcasterReconnecting, setBroadcasterReconnecting] = useState(false);
  const [viewerConnecting, setViewerConnecting] = useState(false);
  const pendingBidStateRef = useRef<BidUpdateData | null>(null);

  useEffect(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);

  const auctionRef = useRef<AuctionDetail | null>(null);
  useEffect(() => {
    auctionRef.current = auction;
  }, [auction]);

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
        setCurrentItem(prev => {
          if (prev && prev.itemId === liveItem.id && prev.totalBids > 0) return prev;
          const base = {
            itemId: liveItem.id,
            title: liveItem.title,
            currentPrice: liveItem.price,
            photos: liveItem.photos,
            totalBids: 0,
            mode: 'auction' as const,
          };
          // Apply pending bid state if it exists for this item
          const pending = pendingBidStateRef.current;
          if (pending && pending.itemId === liveItem.id) {
            const updated = {
              ...base,
              currentPrice: pending.amount,
              totalBids: pending.totalBids,
              highestBidderName: pending.bidderName,
            };
            currentItemRef.current = updated;
            return updated;
          }
          return base;
        });
        // Restore winner banner if bid state was pending
        if (pendingBidStateRef.current) {
          setWinnerBanner(`${pendingBidStateRef.current.bidderName} is winning!`);
        }
      }
    });
  }, [id]);

  const [soldItemWinners, setSoldItemWinners] = useState<Record<string, {
    userId: string;
    displayName: string;
    amount: number;
  }>>({});

  const [saleToast, setSaleToast] = useState<{ winner: string; amount: number; title: string } | null>(null);

  const [timerPaused, setTimerPaused] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);

  const [itemMode, setItemMode] = useState<'auction' | 'chat'>('auction');
  const [declaringWinner, setDeclaringWinner] = useState<{
    userId: string;
    displayName: string;
    message: string;
  } | null>(null);
  const { placeBid, sendChat, endAuction, startItemTimer, notifyShopUpdated, pauseTimer, resumeTimer, cancelItemTimer, startChatBid, declareChatWinner } = useAuctionSocket({
    auctionId: id,
    userId: user?.id,
    onBidUpdate: useCallback((data: BidUpdateData) => {
      bidStateReceivedRef.current = true;
      pendingBidStateRef.current = data; // always store latest
      setCurrentItem(prev => {
        if (!prev) return prev; // will be applied via getById + pendingBidStateRef
        const updated = {
          ...prev,
          currentPrice: data.amount,
          totalBids: data.totalBids,
          highestBidderName: data.bidderName,
        };
        currentItemRef.current = updated;
        return updated;
      });
      setWinnerBanner(`${data.bidderName} is winning!`);
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
      bidStateReceivedRef.current = false;
      pendingBidStateRef.current = null;
      // Inject a visual divider so seller knows new item started
      setChatMessages(prev => [...prev, {
        id: `divider-${data.itemId}-${Date.now()}`,
        userId: '__system__',
        displayName: '',
        message: '',
        timestamp: Date.now(),
        type: 'item-divider',
        itemTitle: data.title,
      }]);
      setCurrentItem({
        itemId: data.itemId,
        title: data.title,
        currentPrice: data.currentPrice,
        photos: data.photos,
        totalBids: 0,
        mode: (data as any).mode ?? 'auction',
      });
    }, []),
    onItemEnded: useCallback((data: ItemEndedData) => {
      if (data.winner) {
        setSaleToast({
          winner: data.winner.displayName,
          amount: data.winner.amount,
          title: currentItemRef.current?.title ?? 'Item',
        });
        setTimeout(() => setSaleToast(null), 4000);
      }
      setCurrentItem(null);
      setWinnerBanner(null);

      // ← Move item to SOLD in local auction state + store winner info
      setAuction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          shopItems: prev.shopItems.map(item =>
            item.id === data.itemId
              ? { ...item, status: data.winner ? 'SOLD' as const : 'QUEUED' as const }
              : item
          ),
        };
      });

      // Store winner info separately for display in sold tab
      if (data.winner) {
        setSoldItemWinners(prev => ({
          ...prev,
          [data.itemId]: data.winner!,
        }));
      }
    }, []),
    onViewerCount: useCallback((data: { count: number }) => {
      setViewerCount(data.count);
    }, []),
    onChatHistory: useCallback((messages: Array<{ userId: string; displayName: string; message: string; timestamp: number }>) => {
      setChatMessages(messages.map((m: { userId: string; displayName: string; message: string; timestamp: number }) => ({
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

    onTimerStarted: useCallback((data: { itemId: string; remaining: number; counterbidSeconds: number }) => {
      setTimerRemaining(data.remaining);
      setCounterbidSeconds(data.counterbidSeconds);
    }, []),
    onTimerUpdate: useCallback((data: { itemId: string; remaining: number; isCounterbid: boolean }) => {
      setTimerRemaining(data.remaining);
    }, []),
    onTimerEnded: useCallback((_data: { itemId: string }) => {
      setTimerRemaining(null);
    }, []),

    onShopUpdated: useCallback((_data: { auctionId: string; timestamp: number }) => {
      // Refresh auction state for everyone
      void auctionsApi.getById(id).then(setAuction);
    }, [id]),

    onOfferReceived: useCallback((data: { offerId: string; itemTitle: string; buyerName: string; amount: number }) => {
      if (!isSeller) return;
      setPendingOffer({
        offerId: data.offerId,
        itemTitle: data.itemTitle,
        buyerName: data.buyerName,
        amount: data.amount,
      });
    }, [isSeller]),

    onOfferResponded: useCallback((data: { offerId: string; status: string; itemTitle: string; amount: number }) => {
      if (isSeller) return;
      Alert.alert(
        data.status === 'ACCEPTED' ? '🎉 Offer Accepted!' : '❌ Offer Declined',
        data.status === 'ACCEPTED'
          ? `Your offer of ${formatPHP(data.amount)} for ${data.itemTitle} was accepted!`
          : `Your offer for ${data.itemTitle} was declined.`
      );
    }, [isSeller]),

    onTimerPaused: useCallback(() => {
      setTimerPaused(true);
      if (isSeller) {
        setShowResumeModal(true);
      }
    }, [isSeller]),
    onTimerResumed: useCallback((data: { itemId: string; remaining: number }) => {
      setTimerPaused(false);
      setTimerRemaining(data.remaining);
    }, []),
  });

  const handleAddItemLive = async (mode: 'queue' | 'now' | 'buynow') => {
    const price = parseInt(newItemPrice.replace(/[^0-9]/g, ''), 10);
    if (!newItemTitle.trim() || !price) return;
    setAddingItem(true);

    const title = newItemTitle.trim();
    const itemPrice = price * 100;
    setNewItemTitle('');
    setNewItemPrice('');
    setShowAddItem(false);

    // ✅ For "Run Now" — open Start Bidding modal immediately with a placeholder
    // We'll update selectedItem with the real ID once API resolves
    if (mode === 'now') {
      setSelectedItem({ id: '__pending__', title, price: itemPrice });
      setShowStartItem(true);
    }

    try {
      const { apiClient } = await import('../../../src/services/api/client');
      const { shopItemsApi } = await import('../../../src/services/api/shop-items.api');

      const newItem = await shopItemsApi.create({
        title,
        description: `${title} - item`,
        photos: [],
        price: itemPrice,
        type: mode === 'buynow' ? 'BUY_NOW' : 'AUCTION',
      });

      await apiClient.post(`/auctions/${id}/items/${newItem.id}`);

      // ✅ Optimistic update — no getById needed
      setAuction(prev => {
        if (!prev) return prev;
        const optimisticItem: typeof prev.shopItems[0] = {
          id: newItem.id,
          title: newItem.title,
          photos: newItem.photos ?? [],
          price: newItem.price,
          type: mode === 'buynow' ? 'BUY_NOW' : 'AUCTION',
          status: mode === 'buynow' ? 'AVAILABLE' : 'QUEUED',
          queueOrder: newItem.queueOrder ?? 0,
          minimumOffer: newItem.minimumOffer ?? 0,
        };
        return { ...prev, shopItems: [...prev.shopItems, optimisticItem] };
      });

      notifyShopUpdated();

      if (mode === 'now') {
        // Update with real ID now that API resolved
        setSelectedItem({ id: newItem.id, title: newItem.title, price: newItem.price });
        // Modal is already open — selectedItem update is enough
      }

      if (mode === 'buynow') {
        Alert.alert('Listed! 🏷️', `${newItem.title} is now available for buyers to purchase.`);
      }
    } catch {
      Alert.alert('Error', 'Failed to add item. Try again.');
      // Revert form on error
      setNewItemTitle(title);
      setNewItemPrice(String(price));
      setShowAddItem(true);
    } finally {
      setAddingItem(false);
    }
  };

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
                await auctionsApi.end(id);
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


  const viewerTrackId = hms.broadcasterPeer?.id
  ? (hms.trackMap[hms.broadcasterPeer.id] ?? null)
  : null;

  // ── Buyer own connection monitor ──────────────────────────────────
  const wasJoinedRef = useRef(false);

  useEffect(() => {
    if (isSeller) return;

    if (hms.isJoined) {
      wasJoinedRef.current = true;
      setViewerConnecting(false); // connected — clear overlay
    } else if (wasJoinedRef.current) {
      // Was connected before but now disconnected — buyer's own connection dropped
      setViewerConnecting(true);
    }
  }, [hms.isJoined, isSeller]);

  // ── Buyer: show overlay driven by timer-paused socket event ──────
  useEffect(() => {
    if (isSeller) return;
    setBroadcasterReconnecting(timerPaused);
  }, [timerPaused, isSeller]);

  // ── Poll for auction ended while seller disconnected ─────────────
  useEffect(() => {
    if (isSeller || !broadcasterReconnecting) return;
    const poll = setInterval(() => {
      void auctionsApi.getById(id).then(data => {
        if (data.status === 'ENDED') {
          clearInterval(poll);
          setBroadcasterReconnecting(false);
          setAuctionEnded(true);
        }
      });
    }, 5000);
    const hardTimeout = setTimeout(() => {
      clearInterval(poll);
      setBroadcasterReconnecting(false);
      setAuctionEnded(true);
    }, 120000);
    return () => {
      clearInterval(poll);
      clearTimeout(hardTimeout);
    };
  }, [broadcasterReconnecting, isSeller, id]);

  // ── Seller rejoin — show resume/cancel choice if timer was paused ──
  useEffect(() => {
    if (!isSeller) return;
    if (!hms.isJoined) return;
    // Check if there's an active item with paused timer when seller joins
    if (currentItem && timerRemaining !== null) {
      // Small delay to let socket events settle after joining
      const timeout = setTimeout(() => {
        setShowResumeModal(true);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [hms.isJoined, isSeller]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim(), user?.id, user?.displayName);
    setChatInput('');
  };

  const biddingItems = auction?.shopItems.filter(i => (i.status === 'QUEUED' || i.status === 'LIVE') && i.type !== 'BUY_NOW') ?? [];
  const buyNowItems = auction?.shopItems.filter(i => i.type === 'BUY_NOW' && i.status === 'AVAILABLE') ?? [];
  const soldItems = auction?.shopItems.filter(i => i.status === 'SOLD') ?? [];
  

  const sellerTrackId = hms.localPeer?.videoTrackId ?? null;

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

      {/* ── Right Side Viewer Controls ── */}
      {!isSeller && (
        <View style={{
          position: 'absolute',
          right: 12,
          bottom: (currentItem ? 230 : 190) + keyboardHeight,
          alignItems: 'center',
          gap: 20,
        }}>
          {/* Share */}
          <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} activeOpacity={0.75}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.60)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>↑</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Share</Text>
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
              {biddingItems.length > 0 && (
                <View style={{
                  position: 'absolute', top: -2, right: -2,
                  backgroundColor: '#DC2626', borderRadius: 999,
                  width: 16, height: 16, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{biddingItems.length}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Shop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Chat Messages ── */}
      <View style={{
        position: 'absolute',
        left: 0,
        right: isSeller ? 68 : 68, // indent right for both seller and viewer controls
        bottom: (currentItem ? 260 : 160) + keyboardHeight,
        height: 200,
      }}>
        <FlatList
          ref={chatRef}
          data={(() => {
            const real = chatMessages.filter(m => m.type !== 'item-divider').slice(-20);
            const realIds = new Set(real.map(m => m.id));
            return chatMessages.filter(m => m.type === 'item-divider' || realIds.has(m.id));
          })()}
          keyExtractor={item => item.id}
          style={{ paddingHorizontal: 16 }}
          contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            if (item.type === 'item-divider') {
              return (
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  marginVertical: 8, paddingHorizontal: 4,
                }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#374151' }} />
                  <View style={{
                    backgroundColor: '#1F2937', borderRadius: 999,
                    paddingHorizontal: 10, paddingVertical: 3, marginHorizontal: 8,
                  }}>
                    <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '600' }}>
                      📦 {item.itemTitle}
                    </Text>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#374151' }} />
                </View>
              );
            }

            return (
              <View style={{ marginBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  flex: 1,
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
                {isSeller && currentItem?.mode === 'chat' && item.type !== 'item-divider' && (
                  <TouchableOpacity
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                    onPress={() => setDeclaringWinner({
                      userId: item.userId,
                      displayName: item.displayName,
                      message: item.message,
                    })}
                  >
                    <Text style={{ fontSize: 16 }}>👑</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
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
                {winnerBanner ? (
                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>
                    🏆 {winnerBanner}
                  </Text>
                ) : (
                  <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                    {currentItem.totalBids} bid{currentItem.totalBids !== 1 ? 's' : ''}
                    {currentItem.highestBidderName ? ` · ${currentItem.highestBidderName} leading` : ''}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 15 }}>
                {formatPHP(currentItem.currentPrice)}
              </Text>
              {timerRemaining !== null && (
                <View style={{
                  backgroundColor: timerPaused ? '#6B7280' : timerRemaining <= counterbidSeconds ? '#DC2626' : '#1A56DB',
                  borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, minWidth: 48, alignItems: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                      {timerPaused ? '⏸' : `${timerRemaining}s`}
                    </Text>
                </View>
              )}
            </View>
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

        </View>

        {/* Bid button — viewers only */}
        {!isSeller && (
          currentItem ? (
            currentItem.mode === 'chat' ? (
              <View style={{
                backgroundColor: 'rgba(124,58,237,0.15)',
                borderWidth: 1, borderColor: '#7C3AED',
                borderRadius: 16, paddingVertical: 14, alignItems: 'center',
              }}>
                <Text style={{ color: '#A78BFA', fontWeight: '700', fontSize: 15 }}>
                  💬 Type your bid in chat!
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                  {currentItem.currentPrice > 0
                    ? `Starting at ${formatPHP(currentItem.currentPrice)}`
                    : 'Highest bid when seller closes wins'}
                </Text>
              </View>
            ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Custom bid button */}
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(0,0,0,0.60)',
                  borderWidth: 1, borderColor: '#374151',
                  borderRadius: 14, paddingHorizontal: 16,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: broadcasterReconnecting ? 0.4 : 1,
                }}
                onPress={() => {
                  if (broadcasterReconnecting) return;
                  setCustomBidInput('');
                  setShowCustomBid(true);
                }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Custom</Text>
              </TouchableOpacity>

              {/* Swipe bid button */}
              <View style={{ flex: 1 }}>
                <SwipeBidButton
                  label={currentItem.totalBids === 0
                    ? `Bid ${formatPHP(currentItem.currentPrice)}`
                    : `Bid ${formatPHP(currentItem.currentPrice + getBidIncrement(currentItem.currentPrice))}`
                  }
                  sublabel={currentItem.totalBids === 0
                    ? `Start at ${formatPHP(currentItem.currentPrice)}`
                    : `Current: ${formatPHP(currentItem.currentPrice)}`
                  }
                  onBid={() => {
                    if (broadcasterReconnecting) return;
                    const latest = currentItemRef.current;
                    if (!latest) return;
                    const bidAmount = latest.totalBids === 0
                      ? latest.currentPrice
                      : latest.currentPrice + getBidIncrement(latest.currentPrice);

                    // Optimistic update — instant UI before server confirms
                    setCurrentItem(prev => prev ? {
                      ...prev,
                      currentPrice: bidAmount,
                      totalBids: prev.totalBids + 1,
                      highestBidderName: user?.displayName ?? 'You',
                    } : prev);
                    setWinnerBanner(`${user?.displayName ?? 'You'} is winning!`);
                   if (timerRemaining !== null && timerRemaining <= counterbidSeconds + 1) {
                      setTimerRemaining(counterbidSeconds);
                    }

                    placeBid(latest.itemId, bidAmount, user?.id ?? '');
                  }}
                />
              </View>
            </View>
            )
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
            {(['bidding', 'buynow', 'sold'] as const).map(tab => (
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
                  {tab === 'bidding' ? '🔨 Bidding' : tab === 'buynow' ? '🏷️ Buy Now' : '✅ Sold'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isSeller && shopTab === 'bidding' && (
            <TouchableOpacity
              style={{
                marginHorizontal: 24, marginBottom: 12,
                backgroundColor: '#1A56DB', borderRadius: 12,
                paddingVertical: 12, flexDirection: 'row',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onPress={() => { setShowShop(false); setShowAddItem(true); }}
            >
              <Text style={{ color: '#fff', fontSize: 18 }}>+</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add Item to Queue</Text>
            </TouchableOpacity>
          )}
          <ScrollView style={{ paddingHorizontal: 24, marginBottom: 32 }}>
            {/* ── Bidding Tab ── */}
            {shopTab === 'bidding' && (
              biddingItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: '#4B5563', fontSize: 13 }}>No items queued</Text>
                </View>
              ) : biddingItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={isSeller && item.status !== 'LIVE' ? 0.7 : 1}
                  onPress={() => {
                    if (isSeller && item.status !== 'LIVE') {
                      setSelectedItem({ id: item.id, title: item.title, price: item.price });
                      setShowStartItem(true);
                      setShowShop(false);
                    }
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: '#1F2937', borderRadius: 12,
                    padding: 12, marginBottom: 8,
                  }}
                >
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
                </TouchableOpacity>
              ))
            )}

            {/* ── Sold Tab ── */}
            {shopTab === 'sold' && (
              soldItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: '#4B5563', fontSize: 13 }}>No items sold yet</Text>
                </View>
              ) : soldItems.map(item => {
                const winner = soldItemWinners[item.id];
                return (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: '#1F2937', borderRadius: 12,
                      padding: 12, marginBottom: 8,
                    }}
                  >
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
                      {winner ? (
                        <>
                          <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>
                            ✅ {formatPHP(winner.amount)}
                          </Text>
                          <Text style={{ color: '#6B7280', fontSize: 11 }}>
                            Won by {winner.displayName}
                          </Text>
                        </>
                      ) : (
                        <Text style={{ color: '#10B981', fontSize: 12 }}>✅ Sold</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* ── Buy Now Tab ── */}
            {shopTab === 'buynow' && (
              buyNowItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: '#4B5563', fontSize: 13 }}>No buy now items</Text>
                </View>
              ) : buyNowItems.map(item => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: '#1F2937', borderRadius: 12,
                    padding: 12, marginBottom: 8,
                  }}
                >
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
                    <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>
                      🏷️ {formatPHP(item.price)}
                    </Text>
                  </View>
                  {/* Seller can remove from buy now */}
                  {isSeller ? (
                    <View style={{
                      backgroundColor: '#064E3B', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 4,
                    }}>
                      <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>FIXED</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'column', gap: 6 }}>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#1A56DB', borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
                        }}
                        onPress={() => {
                          setShowShop(false);
                          Alert.alert(
                            'Buy Now',
                            `Purchase ${item.title} for ${formatPHP(item.price)}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Confirm', onPress: () => Alert.alert('Coming Soon', 'Payment flow coming soon!') },
                            ]
                          );
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Buy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#1F2937', borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
                          borderWidth: 1, borderColor: '#374151',
                        }}
                        onPress={() => {
                          setSelectedBuyNowItem({ id: item.id, title: item.title, price: item.price, minimumOffer: item.minimumOffer ?? 0 });
                          setLiveOfferPercent(-20);
                          setLiveCustomOffer('');
                          setShowShop(false);
                          setShowLiveOfferModal(true);
                        }}
                      >
                        <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '600' }}>Offer</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Start Item Modal (seller only) ── */}
      <Modal visible={showStartItem} transparent animationType="slide" onRequestClose={() => setShowStartItem(false)}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowStartItem(false)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
          contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>Start Item</Text>
          <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }} numberOfLines={1}>{selectedItem?.title}</Text>

          {/* Mode selector */}
          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>BIDDING MODE</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            <TouchableOpacity
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                backgroundColor: itemMode === 'auction' ? '#1A56DB' : '#1F2937',
                borderWidth: 1, borderColor: itemMode === 'auction' ? '#1A56DB' : '#374151',
              }}
              onPress={() => setItemMode('auction')}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>🔨</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Swipe Auction</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 10, marginTop: 2, textAlign: 'center' }}>Timer · auto increments</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                backgroundColor: itemMode === 'chat' ? '#7C3AED' : '#1F2937',
                borderWidth: 1, borderColor: itemMode === 'chat' ? '#7C3AED' : '#374151',
              }}
              onPress={() => setItemMode('chat')}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>💬</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Chat Bid</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 10, marginTop: 2, textAlign: 'center' }}>Buyers bid in chat</Text>
            </TouchableOpacity>
          </View>

          {/* Auction-only options */}
          {itemMode === 'auction' && (
            <>

          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>START TIME (seconds)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {[5, 10, 15, 30, 60].map(s => (
              <TouchableOpacity
                key={s}
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: startSeconds === s && !customStartSeconds ? '#1A56DB' : '#1F2937' }}
                onPress={() => { setStartSeconds(s); setCustomStartSeconds(false); }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{s}s</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: customStartSeconds ? '#1A56DB' : '#1F2937' }}
              onPress={() => setCustomStartSeconds(true)}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Custom</Text>
            </TouchableOpacity>
          </View>
          {customStartSeconds && (
            <TextInput
              style={{ backgroundColor: '#1F2937', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, marginBottom: 12 }}
              placeholder="Enter seconds..."
              placeholderTextColor="#4B5563"
              keyboardType="numeric"
              onChangeText={t => setStartSeconds(parseInt(t) || 30)}
            />
          )}

          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>COUNTERBID WINDOW (seconds)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {[3, 5, 7, 10, 15].map(s => (
              <TouchableOpacity
                key={s}
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: startCounterbid === s && !customCounterbid ? '#F59E0B' : '#1F2937' }}
                onPress={() => { setStartCounterbid(s); setCustomCounterbid(false); }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{s}s</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: customCounterbid ? '#F59E0B' : '#1F2937' }}
              onPress={() => setCustomCounterbid(true)}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Custom</Text>
            </TouchableOpacity>
          </View>
          {customCounterbid && (
            <TextInput
              style={{ backgroundColor: '#1F2937', borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, marginBottom: 20 }}
              placeholder="Enter seconds..."
              placeholderTextColor="#4B5563"
              keyboardType="numeric"
              onChangeText={t => setStartCounterbid(parseInt(t) || 5)}
            />
          )}

          </>
          )}

          {/* Chat-only options */}
          {itemMode === 'chat' && (
            <>
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>DISPLAY TIMER (optional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[0, 30, 60, 90, 120].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: startSeconds === s ? '#7C3AED' : '#1F2937' }}
                    onPress={() => setStartSeconds(s)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>{s === 0 ? 'None' : `${s}s`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 24, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 16 }}>💡</Text>
                <Text style={{ color: '#6B7280', fontSize: 12, flex: 1, lineHeight: 18 }}>
                  Buyers bid by typing in chat. Tap a chat message to declare the winner when bidding ends.
                </Text>
              </View>
            </>
          )}

          {/* Start button */}
            <TouchableOpacity
              style={{
                backgroundColor: itemMode === 'auction' ? '#DC2626' : '#7C3AED',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              onPress={() => {
                if (!selectedItem || !user?.id || selectedItem.id === '__pending__') return;
                if (itemMode === 'auction') {
                  startItemTimer(selectedItem.id, user.id, startSeconds, startCounterbid);
                } else {
                  startChatBid(selectedItem.id, user.id, startSeconds);
                }
                setShowStartItem(false);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {itemMode === 'auction' ? `🔨 Start Bidding — ${startSeconds}s` : '💬 Start Chat Bid'}
              </Text>
              {itemMode === 'auction' && (
                <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>Counterbid resets at {startCounterbid}s</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Offer Notification (Seller) ── */}
      {isSeller && pendingOffer && (
        <View style={{
          position: 'absolute',
          top: 100, left: 16, right: 16,
          backgroundColor: '#1F2937',
          borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: '#374151',
          zIndex: 997,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                💰 New Offer
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                {pendingOffer.buyerName} offered {formatPHP(pendingOffer.amount)} for {pendingOffer.itemTitle}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setPendingOffer(null)}>
              <Text style={{ color: '#6B7280', fontSize: 16, paddingLeft: 8 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={{
                flex: 1, backgroundColor: '#10B981',
                borderRadius: 10, paddingVertical: 10, alignItems: 'center',
              }}
              onPress={async () => {
                try {
                  const { apiClient } = await import('../../../src/services/api/client');
                  await apiClient.patch(`/offers/${pendingOffer.offerId}/accept`);
                  setPendingOffer(null);
                  void auctionsApi.getById(id).then(setAuction);
                  Alert.alert('✅ Accepted', `You accepted the offer from ${pendingOffer.buyerName}.`);
                } catch {
                  Alert.alert('Error', 'Failed to accept offer.');
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, backgroundColor: '#DC2626',
                borderRadius: 10, paddingVertical: 10, alignItems: 'center',
              }}
              onPress={async () => {
                try {
                  const { apiClient } = await import('../../../src/services/api/client');
                  await apiClient.patch(`/offers/${pendingOffer.offerId}/decline`);
                  setPendingOffer(null);
                } catch {
                  Alert.alert('Error', 'Failed to decline offer.');
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Sale Toast ── */}
      {saleToast && (
        <View style={{
          position: 'absolute',
          top: 100, left: 24, right: 24,
          backgroundColor: 'rgba(16,185,129,0.95)',
          borderRadius: 16, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          zIndex: 998,
        }}>
          <Text style={{ fontSize: 32 }}>🎉</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
              {saleToast.winner} won!
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }} numberOfLines={1}>
              {saleToast.title} — {formatPHP(saleToast.amount)}
            </Text>
          </View>
        </View>
      )}

      {/* ── Viewer Own Connection Lost ── */}
      {viewerConnecting && !isSeller && !auctionEnded && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 998,
        }}>
          <ActivityIndicator size="large" color="#F59E0B" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
            Reconnecting...
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 }}>
            Your connection was interrupted. Trying to reconnect to the stream...
          </Text>
        </View>
      )}

      {/* ── Broadcaster Reconnecting ── */}
      {broadcasterReconnecting && !auctionEnded && !isSeller && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 999,
        }}>
          <ActivityIndicator size="large" color="#1A56DB" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
            Connection interrupted
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 }}>
            The seller lost connection. Waiting for them to reconnect...
          </Text>
        </View>
      )}

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

      {/* ── Add Item Live Modal ── */}
      <Modal visible={showAddItem} transparent animationType="slide" onRequestClose={() => setShowAddItem(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAddItem(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: 48,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>📦 Add Item</Text>
              <TouchableOpacity onPress={() => setShowAddItem(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
              Item Title *
            </Text>
            <TextInput
              style={{
                backgroundColor: '#1F2937', borderRadius: 12,
                borderWidth: 1, borderColor: newItemTitle ? '#1A56DB' : '#374151',
                padding: 14, color: '#fff', fontSize: 15, marginBottom: 16,
              }}
              placeholder="e.g. Nike Air Jordan 1"
              placeholderTextColor="#4B5563"
              value={newItemTitle}
              onChangeText={setNewItemTitle}
              maxLength={100}
              autoFocus
            />

            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
              Starting Price (₱) *
            </Text>
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 12,
              borderWidth: 1, borderColor: newItemPrice ? '#1A56DB' : '#374151',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, marginBottom: 24,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 8 }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '600', paddingVertical: 14 }}
                placeholder="0"
                placeholderTextColor="#4B5563"
                value={newItemPrice}
                onChangeText={t => setNewItemPrice(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: newItemTitle.trim() && newItemPrice ? '#1A56DB' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                marginBottom: 10,
              }}
              onPress={() => void handleAddItemLive('queue')}
              disabled={!newItemTitle.trim() || !newItemPrice || addingItem}
            >
              {addingItem ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>📦 Add to Queue</Text>
                  <Text style={{ color: '#BFDBFE', fontSize: 12, marginTop: 2 }}>Seller starts it manually later</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: newItemTitle.trim() && newItemPrice ? '#DC2626' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                marginBottom: 10,
              }}
              onPress={() => void handleAddItemLive('now')}
              disabled={!newItemTitle.trim() || !newItemPrice || addingItem}
            >
              {addingItem ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>🔨 Run Now</Text>
                  <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>Add and start bidding immediately</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: newItemTitle.trim() && newItemPrice ? '#065F46' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              onPress={() => void handleAddItemLive('buynow')}
              disabled={!newItemTitle.trim() || !newItemPrice || addingItem}
            >
              {addingItem ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>🏷️ List as Buy Now</Text>
                  <Text style={{ color: '#6EE7B7', fontSize: 12, marginTop: 2 }}>Fixed price — buyers purchase directly</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Custom Bid Modal ── */}
      <Modal visible={showCustomBid} transparent animationType="slide" onRequestClose={() => setShowCustomBid(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCustomBid(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: 48,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Custom Bid</Text>
              <TouchableOpacity onPress={() => setShowCustomBid(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {currentItem && (
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
                Current: {formatPHP(currentItem.currentPrice)} · Min bid: {formatPHP(currentItem.totalBids === 0 ? currentItem.currentPrice : currentItem.currentPrice + getBidIncrement(currentItem.currentPrice))}
              </Text>
            )}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 12,
              borderWidth: 1, borderColor: customBidInput ? '#1A56DB' : '#374151',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, marginBottom: 20,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 18, marginRight: 8 }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 22, fontWeight: '700', paddingVertical: 14 }}
                placeholder="0"
                placeholderTextColor="#4B5563"
                value={customBidInput}
                onChangeText={t => setCustomBidInput(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: customBidInput ? '#1A56DB' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              onPress={() => {
                const latest = currentItemRef.current;
                if (!latest || !customBidInput) return;
                const amount = parseInt(customBidInput) * 100;
                const minBid = latest.totalBids === 0
                  ? latest.currentPrice
                  : latest.currentPrice + getBidIncrement(latest.currentPrice);
                if (amount < minBid) {
                  Alert.alert('Bid too low', `Minimum bid is ${formatPHP(minBid)}`);
                  return;
                }

                // Optimistic update
                setCurrentItem(prev => prev ? {
                  ...prev,
                  currentPrice: amount,
                  totalBids: prev.totalBids + 1,
                  highestBidderName: user?.displayName ?? 'You',
                } : prev);
                setWinnerBanner(`${user?.displayName ?? 'You'} is winning!`);
                if (timerRemaining !== null && timerRemaining <= counterbidSeconds + 1) {
                  setTimerRemaining(counterbidSeconds);
                }

                placeBid(latest.itemId, amount, user?.id ?? '');
                setShowCustomBid(false);
              }}
              disabled={!customBidInput}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                Place Bid — {customBidInput ? formatPHP(parseInt(customBidInput) * 100) : '₱0'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Live Offer Modal ── */}
      <Modal visible={showLiveOfferModal} transparent animationType="slide" onRequestClose={() => setShowLiveOfferModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowLiveOfferModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Make Offer</Text>
              <TouchableOpacity onPress={() => setShowLiveOfferModal(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedBuyNowItem && (
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
                {selectedBuyNowItem.title} · Listed at {formatPHP(selectedBuyNowItem.price)}
                {selectedBuyNowItem.minimumOffer > 0 ? ` · Min: ${formatPHP(selectedBuyNowItem.minimumOffer)}` : ''}
              </Text>
            )}

            {/* Percent chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[-20, -15, -10, -5].map(pct => {
                const amt = selectedBuyNowItem ? Math.round(selectedBuyNowItem.price * (1 + pct / 100)) : 0;
                const isSelected = liveOfferPercent === pct && liveCustomOffer === '';
                return (
                  <TouchableOpacity
                    key={pct}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                      backgroundColor: isSelected ? '#fff' : '#1F2937',
                    }}
                    onPress={() => { setLiveOfferPercent(pct); setLiveCustomOffer(''); }}
                  >
                    <Text style={{ color: isSelected ? '#000' : '#fff', fontWeight: '700', fontSize: 13 }}>{pct}%</Text>
                    <Text style={{ color: isSelected ? '#374151' : '#6B7280', fontSize: 10, marginTop: 2 }}>{formatPHP(amt)}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                  backgroundColor: liveOfferPercent === null ? '#fff' : '#1F2937',
                }}
                onPress={() => { setLiveOfferPercent(null); setLiveCustomOffer(''); }}
              >
                <Text style={{ color: liveOfferPercent === null ? '#000' : '#fff', fontWeight: '700', fontSize: 13 }}>Custom</Text>
              </TouchableOpacity>
            </View>

            {/* Custom input */}
            {liveOfferPercent === null && (
              <View style={{
                backgroundColor: '#1F2937', borderRadius: 12,
                borderWidth: 1, borderColor: liveCustomOffer ? '#1A56DB' : '#374151',
                flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 16,
              }}>
                <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 8 }}>₱</Text>
                <TextInput
                  style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', paddingVertical: 12 }}
                  placeholder="0"
                  placeholderTextColor="#4B5563"
                  value={liveCustomOffer}
                  onChangeText={setLiveCustomOffer}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
            )}

            {/* Summary */}
            {selectedBuyNowItem && (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Your offer</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: '#6B7280', fontSize: 13, textDecorationLine: 'line-through' }}>
                      {formatPHP(selectedBuyNowItem.price)}
                    </Text>
                    <Text style={{ color: '#10B981', fontSize: 16, fontWeight: '800' }}>
                      {formatPHP(
                        liveCustomOffer
                          ? parseInt(liveCustomOffer) * 100
                          : liveOfferPercent !== null && selectedBuyNowItem
                            ? Math.round(selectedBuyNowItem.price * (1 + liveOfferPercent / 100))
                            : 0
                      )}
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
                backgroundColor: submittingOffer ? '#374151' : '#1A56DB',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
              }}
              disabled={submittingOffer}
              onPress={async () => {
                if (!selectedBuyNowItem) return;
                const amount = liveCustomOffer
                  ? parseInt(liveCustomOffer) * 100
                  : liveOfferPercent !== null
                    ? Math.round(selectedBuyNowItem.price * (1 + liveOfferPercent / 100))
                    : 0;
                if (!amount) return;
                if (selectedBuyNowItem.minimumOffer > 0 && amount < selectedBuyNowItem.minimumOffer) {
                  Alert.alert('Offer too low', `Minimum offer is ${formatPHP(selectedBuyNowItem.minimumOffer)}`);
                  return;
                }
                setSubmittingOffer(true);
                try {
                  const { offersApi } = await import('../../../src/services/api/offers.api');
                  await offersApi.create(selectedBuyNowItem.id, amount);
                  setShowLiveOfferModal(false);
                  Alert.alert('Offer Sent! 🎉', 'The seller will respond within 24 hours.');
                } catch {
                  Alert.alert('Error', 'Failed to send offer. Try again.');
                } finally {
                  setSubmittingOffer(false);
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {submittingOffer ? 'Sending...' : 'Send Offer'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── Seller Rejoin — Resume or Cancel Item ── */}
      <Modal
        visible={showResumeModal && isSeller}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 24,
        }}>
          <View style={{
            backgroundColor: '#111827', borderRadius: 24,
            padding: 28, width: '100%',
            borderWidth: 1, borderColor: '#1F2937',
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>⏸️</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20, marginBottom: 8, textAlign: 'center' }}>
                Bidding is paused
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                You disconnected while{' '}
                <Text style={{ color: '#fff', fontWeight: '600' }}>
                  {currentItem?.title}
                </Text>
                {' '}was being auctioned.
              </Text>
            </View>

            {/* Item info */}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              padding: 16, marginBottom: 24,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Current bid</Text>
                <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 15 }}>
                  {currentItem ? formatPHP(currentItem.currentPrice) : '—'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Total bids</Text>
                <Text style={{ color: '#fff', fontSize: 13 }}>
                  {currentItem?.totalBids ?? 0}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Time remaining</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>
                  {timerRemaining !== null ? `${timerRemaining}s` : '—'} (paused)
                </Text>
              </View>
            </View>

            {/* Resume */}
            <TouchableOpacity
              style={{
                backgroundColor: '#DC2626', borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 10,
              }}
              onPress={() => {
                if (!currentItem || !auctionRef.current?.seller.id) return;
                resumeTimer(currentItem.itemId, auctionRef.current.seller.id);
                setShowResumeModal(false);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                ▶ Resume Bidding
              </Text>
              <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>
                Timer continues from {timerRemaining}s
              </Text>
            </TouchableOpacity>

            {/* Cancel item */}
            <TouchableOpacity
              style={{
                backgroundColor: 'transparent', borderRadius: 14,
                paddingVertical: 14, alignItems: 'center',
                borderWidth: 1, borderColor: '#374151',
              }}
              onPress={async () => {
                if (!currentItem) return;
                try {
                  const { apiClient } = await import('../../../src/services/api/client');
                  await apiClient.patch(`/shop-items/${currentItem.itemId}/reset`);
                  cancelItemTimer(currentItem.itemId);
                  setCurrentItem(null);
                  setTimerRemaining(null);
                  setTimerPaused(false);
                  setShowResumeModal(false);
                } catch {
                  Alert.alert('Error', 'Failed to cancel item. Try again.');
                }
              }}
            >
              <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>
                Cancel This Item
              </Text>
              <Text style={{ color: '#4B5563', fontSize: 12, marginTop: 2 }}>
                No transaction — item goes back to queue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* ── Declare Chat Winner Modal ── */}
      <Modal
        visible={!!declaringWinner}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclaringWinner(null)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 24,
        }}>
          <View style={{
            backgroundColor: '#111827', borderRadius: 24,
            padding: 28, width: '100%',
            borderWidth: 1, borderColor: '#1F2937',
          }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' }}>
              👑 Declare Winner
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              Confirm winner for{' '}
              <Text style={{ color: '#fff', fontWeight: '600' }}>{currentItem?.title}</Text>
            </Text>

            {declaringWinner && (
              <View style={{
                backgroundColor: '#1F2937', borderRadius: 14,
                padding: 16, marginBottom: 16,
              }}>
                <Text style={{ color: '#A78BFA', fontWeight: '700', fontSize: 14 }}>
                  {declaringWinner.displayName}
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
                  "{declaringWinner.message}"
                </Text>
              </View>
            )}

            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              WINNING AMOUNT (₱)
            </Text>
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 12,
              borderWidth: 1, borderColor: '#374151',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, marginBottom: 20,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 8 }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', paddingVertical: 12 }}
                placeholder="0"
                placeholderTextColor="#4B5563"
                keyboardType="numeric"
                defaultValue={declaringWinner?.message.replace(/[^0-9]/g, '') ?? ''}
                onChangeText={t => {
                  if (declaringWinner) setDeclaringWinner({ ...declaringWinner, message: t });
                }}
              />
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: '#7C3AED', borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 10,
              }}
              onPress={() => {
                if (!declaringWinner || !currentItem || !user?.id) return;
                const amount = parseInt(declaringWinner.message.replace(/[^0-9]/g, '') || '0') * 100;
                if (!amount) {
                  Alert.alert('Enter amount', 'Please enter the winning bid amount.');
                  return;
                }
                declareChatWinner(currentItem.itemId, user.id, declaringWinner.userId, declaringWinner.displayName, amount);
                setDeclaringWinner(null);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✅ Confirm Winner</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 12, alignItems: 'center' }}
              onPress={() => setDeclaringWinner(null)}
            >
              <Text style={{ color: '#6B7280', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
