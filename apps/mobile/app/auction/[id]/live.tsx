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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatMsg {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
  type?: 'message' | 'item-divider' | 'system_winner' | 'system_offer';
  itemTitle?: string;
  winnerAmount?: number;
  buyerName?: string;
}

interface CurrentItem {
  itemId: string;
  title: string;
  currentPrice: number;
  photos: string[];
  totalBids: number;
  highestBidderName?: string;
  mode: 'auction' | 'chat' | 'buynow';
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

function SwipeBidButton({ label, sublabel, onBid, color = '#1A56DB' }: {
  label: string;
  sublabel: string;
  onBid: () => void;
  color?: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const THRESHOLD = SCREEN_WIDTH * 0.5;
  const MAX_DRAG = SCREEN_WIDTH - 48 - 64;
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
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  return (
    <View style={{
      backgroundColor: color, borderRadius: 16,
      height: 60, overflow: 'hidden', justifyContent: 'center',
    }}>
      {/* Fading chevrons — right side hint */}
      <View style={{ position: 'absolute', right: 14, flexDirection: 'row', gap: 3, alignItems: 'center' }}>
        {([0.15, 0.35, 0.6] as const).map((op, i) => (
          <Text key={i} style={{ color: '#fff', fontSize: 18, opacity: op, lineHeight: 22 }}>›</Text>
        ))}
      </View>
      {/* Label — offset right so it never overlaps handle */}
      <View style={{ position: 'absolute', left: 72, right: 48, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: 'rgba(191,219,254,0.8)', fontSize: 10, marginTop: 2 }}>
          {sublabel}
        </Text>
      </View>
      {/* Draggable handle */}
      <Animated.View
        style={{
          transform: [{ translateX }],
          width: 56, height: 52, borderRadius: 13, marginLeft: 4,
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center', justifyContent: 'center',
        }}
        {...panResponder.panHandlers}
      >
        <Text style={{ fontSize: 20 }}>🔨</Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '700', marginTop: 1, letterSpacing: 1 }}>
          SLIDE
        </Text>
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
  const [shopTab, setShopTab] = useState<'bidding' | 'buynow' | 'sold' | 'offers'>('bidding');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [counterbidSeconds, setCounterbidSeconds] = useState(5);
  const [showStartItem, setShowStartItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string; price: number } | null>(null);
  const [editingQueueItem, setEditingQueueItem] = useState<{ id: string; title: string; price: number } | null>(null);
  const [editingPrice, setEditingPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [startSeconds, setStartSeconds] = useState(30);
  const [startCounterbid, setStartCounterbid] = useState(5);
  const [customStartSeconds, setCustomStartSeconds] = useState(false);
  const [customCounterbid, setCustomCounterbid] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [newAddMode, setNewAddMode] = useState<'queue' | 'now' | 'buynow'>('queue');
  const [showCustomBid, setShowCustomBid] = useState(false);
  const [customBidInput, setCustomBidInput] = useState('');
  const [winnerBanner, setWinnerBanner] = useState<string | null>(null);
  const [showLiveOfferModal, setShowLiveOfferModal] = useState(false);
  const [selectedBuyNowItem, setSelectedBuyNowItem] = useState<{ id: string; title: string; price: number; minimumOffer: number } | null>(null);
  const [liveOfferPercent, setLiveOfferPercent] = useState<number | null>(-20);
  const [liveCustomOffer, setLiveCustomOffer] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [pendingOffers, setPendingOffers] = useState<Array<{
    offerId: string;
    itemTitle: string;
    buyerName: string;
    amount: number;
  }>>([]);
  const { user } = useAuthStore();
  const isSellerImmediate = routeRole === 'broadcaster';
  const isSeller = auction ? auction.seller.id === user?.id : isSellerImmediate;

  const chatRef = useRef<FlatList>(null);
  const currentItemRef = useRef<CurrentItem | null>(null); 
  const bidStateReceivedRef = useRef(false);
  const [broadcasterReconnecting, setBroadcasterReconnecting] = useState(false);
  const [viewerConnecting, setViewerConnecting] = useState(false);
  const pendingBidStateRef = useRef<BidUpdateData | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [claimingBuyNow, setClaimingBuyNow] = useState(false);
  const insets = useSafeAreaInsets();
  const [soldSubTab, setSoldSubTab] = useState<'all' | 'auction' | 'chat' | 'buynow'>('all');
  const [soldSort, setSoldSort] = useState<'recent' | 'high' | 'low'>('recent');
  const [buyNowMode, setBuyNowMode] = useState<'shop' | 'live'>('shop');

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
    const show = Keyboard.addListener(showEvent, e => {
      // On iOS keyboardWillShow already accounts for safe area
      setKeyboardHeight(e.endCoordinates.height - (Platform.OS === 'ios' ? insets.bottom : 0));
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom]);

  useEffect(() => {
    void auctionsApi.getById(id).then(data => {
      setAuction(data);
      // Seed sold items from DB — captures mode for items sold before joining
      const soldFromDb = data.shopItems.filter(i => i.status === 'SOLD');
      if (soldFromDb.length > 0) {
        setSoldItemWinners(prev => {
          const seeded = { ...prev };
          soldFromDb.forEach(item => {
            if (!seeded[item.id]) {
              seeded[item.id] = {
                userId: '',
                displayName: 'Unknown',
                amount: item.price,
                mode: item.mode ?? 'auction',
              };
            }
          });
          return seeded;
        });
      }
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
            mode: (liveItem.mode ?? 'auction') as 'auction' | 'chat',
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
    mode: 'auction' | 'chat' | 'buynow';
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
  const { placeBid, sendChat, endAuction, startItemTimer, notifyShopUpdated, pauseTimer, resumeTimer, cancelItemTimer, startChatBid, declareChatWinner, skipChatItem, startLiveBuyNow, claimBuyNow, pullBuyNow } = useAuctionSocket({
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
      setSkipping(false);
      const winner = data.winner;
      if (winner) {
        const title = currentItemRef.current?.title ?? 'Item';
        
        setSaleToast({
          winner: winner.displayName,
          amount: winner.amount,
          title,
        });
        setTimeout(() => setSaleToast(null), 4000);

        setChatMessages(prev => {
          const alreadyInjected = prev.some(
            m => m.type === 'system_winner' && m.itemTitle === title
          );
          if (alreadyInjected) return prev;
          return [...prev, {
            id: `winner-${data.itemId}-${Date.now()}`,
            userId: '__system__',
            displayName: '',
            message: winner.displayName,
            timestamp: Date.now(),
            type: 'system_winner',
            itemTitle: title,
            winnerAmount: winner.amount,
          }];
        });
      }

      setCurrentItem(null);
      setWinnerBanner(null);

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

      if (winner) {
        setSoldItemWinners(prev => ({
          ...prev,
          [data.itemId]: {
            ...winner,
            mode: currentItemRef.current?.mode ?? 'auction',
          },
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
      // Visible to everyone in the room
      setChatMessages(prev => [...prev, {
        id: `offer-${data.offerId}-${Date.now()}`,
        userId: '__system__',
        displayName: '',
        message: '',
        timestamp: Date.now(),
        type: 'system_offer',
        itemTitle: data.itemTitle,
        winnerAmount: data.amount,
        buyerName: data.buyerName,
      }]);

      if (!isSeller) return;
      setPendingOffers(prev => {
        if (prev.some(o => o.offerId === data.offerId)) return prev;
        return [...prev, {
          offerId: data.offerId,
          itemTitle: data.itemTitle,
          buyerName: data.buyerName,
          amount: data.amount,
        }];
      });
      if (showShopRef.current) setShopTab('offers');
    }, [isSeller]),

    onOfferResponded: useCallback((data: { offerId: string; status: string; itemTitle: string; amount: number; buyerName?: string }) => {
      if (data.status === 'ACCEPTED') {
        if (!isSeller) {
          setChatMessages(prev => [...prev, {
            id: `offer-accepted-${data.offerId}-${Date.now()}`,
            userId: '__system__',
            displayName: '',
            message: '',
            timestamp: Date.now(),
            type: 'system_offer',
            itemTitle: data.itemTitle,
            winnerAmount: data.amount,
            buyerName: `✅ ${data.buyerName ?? 'Buyer'}`,
          }]);
        }
        return;
      }
      if (!isSeller) {
        Alert.alert('❌ Offer Declined', `Your offer for ${data.itemTitle} was declined.`);
      }
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

    onLiveBuyNowStarted: useCallback((data: { itemId: string; title: string; price: number; photos: string[] }) => {
      setChatMessages(prev => [...prev, {
        id: `divider-buynow-${data.itemId}-${Date.now()}`,
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
        currentPrice: data.price,
        photos: data.photos,
        totalBids: 0,
        mode: 'buynow',
      });
      setAuction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          shopItems: prev.shopItems.map(i =>
            i.id === data.itemId ? { ...i, status: 'LIVE_BUYNOW' as any } : i
          ),
        };
      });
    }, []),

    onBuyNowClaimed: useCallback((data: { itemId: string; title: string; price: number; buyerId: string; buyerName: string }) => {
      setClaimingBuyNow(false);
      setCurrentItem(null);
      setWinnerBanner(null);
      setSaleToast({ winner: data.buyerName, amount: data.price, title: data.title });
      setTimeout(() => setSaleToast(null), 4000);
      setChatMessages(prev => [...prev, {
        id: `winner-buynow-${data.itemId}-${Date.now()}`,
        userId: '__system__',
        displayName: '',
        message: data.buyerName,
        timestamp: Date.now(),
        type: 'system_winner',
        itemTitle: data.title,
        winnerAmount: data.price,
      }]);
      setAuction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          shopItems: prev.shopItems.map(i =>
            i.id === data.itemId ? { ...i, status: 'SOLD' as const } : i
          ),
        };
      });
      setSoldItemWinners(prev => ({
        ...prev,
        [data.itemId]: { userId: data.buyerId, displayName: data.buyerName, amount: data.price, mode: 'auction' },
      }));
    }, []),

    onBuyNowPulled: useCallback((data: { itemId: string }) => {
      setCurrentItem(null);
      setClaimingBuyNow(false);
      setAuction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          shopItems: prev.shopItems.map(i =>
            i.id === data.itemId ? { ...i, status: 'AVAILABLE' as const } : i
          ),
        };
      });
    }, []),

    onBuyNowClaimFailed: useCallback((_data: { itemId: string; reason: string }) => {
      setClaimingBuyNow(false);
      Alert.alert('Too slow!', 'Someone else just bought it.');
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
        description: `${title} - live auction item`,
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
          mode: 'auction' as const,
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
        if (buyNowMode === 'live') {
          startLiveBuyNow(newItem.id, user?.id ?? '');
          setCurrentItem({
            itemId: newItem.id,
            title: newItem.title,
            currentPrice: newItem.price,
            photos: [],
            totalBids: 0,
            mode: 'buynow',
          });
        } else {
          Alert.alert('Listed! 🏷️', `${newItem.title} is now available for buyers to purchase.`);
        }
        setBuyNowMode('shop');
      }
    } catch (err) {
      console.error('Add item error:', JSON.stringify(err));
      Alert.alert('Error', 'Failed to add item. Try again.');
      setAddingItem(false);
      setShowStartItem(false);
      setSelectedItem(null);
      setNewItemTitle(title);
      setNewItemPrice(String(price));
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

  const showShopRef = useRef(false);
  useEffect(() => { showShopRef.current = showShop; }, [showShop]);

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
  

  // ── Responsive layout calculations ─────────────────────────────── ← ADD HERE
  const BOTTOM_PADDING = keyboardHeight > 0 ? 12 : insets.bottom + 8;
  const CHAT_ROW_HEIGHT = 60;
  const SELLER_BUTTON_HEIGHT = (() => {
    if (!isSeller) return 0;
    const extraHeight = currentItem?.mode === 'chat' || currentItem?.mode === 'buynow' ? 56 : 0;
    const gapHeight = currentItem?.mode === 'chat' || currentItem?.mode === 'buynow' ? 8 : 0;
    return extraHeight + gapHeight + 52;
  })();
  const BUYER_BUTTON_HEIGHT = (() => {
    if (isSeller) return 0;
    if (!currentItem) return 56;
    if (currentItem.mode === 'chat') return 68;
    return 68;
  })();
  const ACTION_HEIGHT = isSeller ? SELLER_BUTTON_HEIGHT : BUYER_BUTTON_HEIGHT;
  const BOTTOM_BAR_HEIGHT = BOTTOM_PADDING + 12 + CHAT_ROW_HEIGHT + ACTION_HEIGHT;
  const ITEM_BAR_BOTTOM = BOTTOM_BAR_HEIGHT + 8;
  const CONTROLS_BOTTOM = ITEM_BAR_BOTTOM + (currentItem ? 76 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>

      {/* ── Full Screen Video Background ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#111827' }}>
        {renderVideoBackground()}
      </View>

      {/* ── Top Bar: seller info + close ── */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: insets.top + 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: avatar + LIVE + viewers */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
            borderRadius: 999,
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
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
              borderRadius: 999,
              paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ color: '#fff', fontSize: 11 }}>👁 {viewerCount}</Text>
            </View>
          )}
        </View>

        {/* Right: close only — seller controls moved to right side panel */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
            borderRadius: 999,
            width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
          }}
          onPress={() => void handleLeave()}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Right Side Seller Controls ── */}
      {isSeller && hms.isJoined && keyboardHeight === 0 && (
        <View style={{
          position: 'absolute',
          right: 12,
          bottom: CONTROLS_BOTTOM,
          alignItems: 'center',
          gap: 12,
        }}>
          {/* Mute */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 3 }}
            onPress={() => void hms.toggleMute()}
            activeOpacity={0.75}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: hms.isMuted
                ? 'rgba(220,38,38,0.75)'
                : 'rgba(255,255,255,0.15)',
              borderWidth: 1,
              borderColor: hms.isMuted
                ? 'rgba(220,38,38,0.5)'
                : 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 16 }}>{hms.isMuted ? '🔇' : '🎙️'}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' }}>
              {hms.isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {/* Camera */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 3 }}
            onPress={() => void hms.toggleCamera()}
            activeOpacity={0.75}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: hms.isCameraOff
                ? 'rgba(220,38,38,0.75)'
                : 'rgba(255,255,255,0.15)',
              borderWidth: 1,
              borderColor: hms.isCameraOff
                ? 'rgba(220,38,38,0.5)'
                : 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 16 }}>{hms.isCameraOff ? '📵' : '📹'}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' }}>
              {hms.isCameraOff ? 'Start' : 'Stop'}
            </Text>
          </TouchableOpacity>

          {/* Flip */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 3 }}
            onPress={() => void hms.switchCamera()}
            activeOpacity={0.75}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 16 }}>🔄</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' }}>Flip</Text>
          </TouchableOpacity>

          {/* Shop */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 3 }}
            onPress={() => setShowShop(true)}
            activeOpacity={0.75}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 16 }}>🛍️</Text>
              {pendingOffers.length > 0 && (
                <View style={{
                  position: 'absolute', top: -2, right: -2,
                  backgroundColor: '#DC2626', borderRadius: 999,
                  width: 14, height: 14,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>
                    {pendingOffers.length}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' }}>Shop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Right Side Viewer Controls ── */}
      {!isSeller && keyboardHeight === 0 && (
        <View style={{
          position: 'absolute',
          right: 12,
          bottom: CONTROLS_BOTTOM,
          alignItems: 'center',
          gap: 12,
        }}>
          {/* Share */}
          <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} activeOpacity={0.75}>
            {/* Share */}
            <TouchableOpacity style={{ alignItems: 'center', gap: 3 }} activeOpacity={0.75}>
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 16 }}>↑</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' }}>Share</Text>
            </TouchableOpacity>

            {/* Shop */}
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 3 }}
              onPress={() => setShowShop(true)}
              activeOpacity={0.75}
            >
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 16 }}>🛍️</Text>
                {biddingItems.length > 0 && (
                  <View style={{
                    position: 'absolute', top: -2, right: -2,
                    backgroundColor: '#DC2626', borderRadius: 999,
                    width: 14, height: 14,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>
                      {biddingItems.length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' }}>Shop</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Chat Messages ── */}
      <View style={{
        position: 'absolute',
        left: 0,
        right: isSeller ? 68 : 68, // indent right for both seller and viewer controls
        bottom: CHAT_ROW_HEIGHT + ACTION_HEIGHT + BOTTOM_PADDING + 12 + (currentItem ? 84 : 8) + keyboardHeight,
        height: 200,
      }}>
        <FlatList
          ref={chatRef}
          data={(() => {
            const real = chatMessages
              .filter(m => m.type !== 'item-divider' && m.type !== 'system_winner' && m.type !== 'system_offer')
              .slice(-20);
            const realIds = new Set(real.map(m => m.id));
            return chatMessages.filter(
              m => m.type === 'item-divider' || m.type === 'system_winner' || m.type === 'system_offer' || realIds.has(m.id)
            );
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

            if (item.type === 'system_offer') {
              const isAccepted = item.buyerName?.startsWith('✅');
              const displayName = isAccepted ? item.buyerName?.replace('✅ ', '') : item.buyerName;
              return (
                <View style={{
                  marginVertical: 6,
                  marginHorizontal: 4,
                  backgroundColor: isAccepted
                    ? 'rgba(16,185,129,0.1)'
                    : 'rgba(245,158,11,0.08)',
                  borderWidth: 1,
                  borderColor: isAccepted
                    ? 'rgba(16,185,129,0.35)'
                    : 'rgba(245,158,11,0.25)',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <Text style={{ fontSize: 15 }}>{isAccepted ? '🤝' : '💰'}</Text>
                  <Text style={{
                    color: isAccepted
                      ? 'rgba(16,185,129,0.9)'
                      : 'rgba(245,158,11,0.9)',
                    fontSize: 11, flex: 1,
                  }}>
                    {isAccepted ? (
                      <>
                        <Text style={{ fontWeight: '700' }}>{displayName}</Text>
                        {`'s offer of `}
                        <Text style={{ fontWeight: '700' }}>{formatPHP(item.winnerAmount ?? 0)}</Text>
                        {` for `}
                        <Text style={{ fontWeight: '600' }}>{item.itemTitle}</Text>
                        {` was accepted 🎉`}
                      </>
                    ) : (
                      <>
                        <Text style={{ fontWeight: '700' }}>{item.buyerName}</Text>
                        {' offered '}
                        <Text style={{ fontWeight: '700' }}>{formatPHP(item.winnerAmount ?? 0)}</Text>
                        {' for '}
                        <Text style={{ fontWeight: '600' }}>{item.itemTitle}</Text>
                      </>
                    )}
                  </Text>
                </View>
              );
            }

            if (item.type === 'system_winner') {
              return (
                <View style={{
                  marginVertical: 8,
                  marginHorizontal: 4,
                  backgroundColor: 'rgba(245,158,11,0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(245,158,11,0.4)',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <Text style={{ fontSize: 22 }}>🏆</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 13 }}>
                      {item.message} won!
                    </Text>
                    <Text style={{ color: 'rgba(245,158,11,0.75)', fontSize: 11, marginTop: 2 }}>
                      {item.itemTitle} — {formatPHP(item.winnerAmount ?? 0)}
                    </Text>
                  </View>
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
        <View style={{ 
          position: 'absolute', 
          left: 16, right: 16, 
          // Push up more when seller has skip button showing
          bottom: (isSeller && (currentItem.mode === 'chat' || currentItem.mode === 'buynow') ? 210 : 152) + keyboardHeight
        }}>
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
        paddingBottom: BOTTOM_PADDING, paddingTop: 12,
      }}>
        {/* Chat input row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16 }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
              borderRadius: 999,
              paddingHorizontal: 16, paddingVertical: 11,
              color: '#fff', fontSize: 13,
            }}
            placeholder="Say something..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: chatInput.trim() ? '#1A56DB' : 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: chatInput.trim() ? '#1A56DB' : 'rgba(255,255,255,0.1)',
              alignItems: 'center', justifyContent: 'center',
            }}
            onPress={handleSendChat}
          >
            <Text style={{ color: '#fff', fontSize: 14 }}>↑</Text>
          </TouchableOpacity>
        </View>
        
        {/* Bid button — viewers only */}
        {!isSeller && (
          currentItem ? (
            currentItem.mode === 'buynow' ? (
              <View style={{ paddingHorizontal: 16 }}>
                <SwipeBidButton
                  label={`Buy Now — ${formatPHP(currentItem.currentPrice)}`}
                  sublabel="Swipe to buy · first come first served"
                  color="#10B981"
                  onBid={() => {
                    if (claimingBuyNow) return;
                    setClaimingBuyNow(true);
                    claimBuyNow(currentItem.itemId, user?.id ?? '', user?.displayName ?? 'Buyer');
                  }}
                />
              </View>
            ) : currentItem.mode === 'chat' ? (
              <View style={{
                backgroundColor: 'rgba(124,58,237,0.15)',
                borderWidth: 1, borderColor: '#7C3AED',
                borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                marginHorizontal: 16,
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
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
              {/* Custom bid button */}
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                  borderRadius: 14, paddingHorizontal: 14,
                  alignItems: 'center', justifyContent: 'center',
                  height: 60,
                  opacity: broadcasterReconnecting ? 0.4 : 1,
                }}
                onPress={() => {
                  if (broadcasterReconnecting) return;
                  setCustomBidInput('');
                  setShowCustomBid(true);
                }}
              >
                <Text style={{ color: '#fff', fontSize: 16 }}>✏️</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '700', marginTop: 2 }}>CUSTOM</Text>
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
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              marginHorizontal: 16,
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontWeight: '600', fontSize: 13 }}>
                Waiting for next item...
              </Text>
            </View>
          )
        )}

        {/* Seller bottom controls */}
        {isSeller && (
          <View style={{ gap: 8 }}>
            {/* Pull Back to Shop — only during live buy now */}
            {currentItem?.mode === 'buynow' && (
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(16,185,129,0.15)',
                  borderWidth: 1, borderColor: '#10B981',
                  borderRadius: 16, paddingVertical: 12, alignItems: 'center',
                  marginHorizontal: 0,
                }}
                onPress={() => {
                  Alert.alert(
                    'Pull Back to Shop?',
                    `Remove "${currentItem.title}" from live and put it back in the Buy Now tab.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Pull Back',
                        onPress: () => {
                          if (!user?.id) return;
                          pullBuyNow(currentItem.itemId, user.id);
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 14 }}>
                  ↩ Pull Back to Shop
                </Text>
                <Text style={{ color: '#065F46', fontSize: 11, marginTop: 2 }}>
                  Returns to Buy Now tab
                </Text>
              </TouchableOpacity>
            )}
            {/* Skip Item — only during chat bid */}
            {currentItem?.mode === 'chat' && (
              <TouchableOpacity
                style={{
                  backgroundColor: skipping ? 'rgba(107,114,128,0.15)' : 'rgba(245,158,11,0.15)',
                  borderWidth: 1, borderColor: skipping ? '#6B7280' : '#F59E0B',
                  borderRadius: 16, paddingVertical: 12, alignItems: 'center',
                  opacity: skipping ? 0.6 : 1,
                }}
                disabled={skipping}
                onPress={() => {
                  Alert.alert(
                    'Skip Item?',
                    `No sale for "${currentItem.title}"? It will go back to the queue.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Skip Item',
                        style: 'destructive',
                        onPress: () => {
                          if (!currentItem || !user?.id) return;
                          setSkipping(true);
                          skipChatItem(currentItem.itemId, user.id);
                          // Reset after 3s fallback in case socket doesn't respond
                          setTimeout(() => setSkipping(false), 3000);
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.85}
              >
                {skipping ? (
                  <ActivityIndicator color="#F59E0B" size="small" />
                ) : (
                  <>
                    <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 14 }}>
                      ⏭ Skip Item — No Sale
                    </Text>
                    <Text style={{ color: '#92400E', fontSize: 11, marginTop: 2 }}>
                      Item goes back to queue
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* End Live */}
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
          </View>
        )}
      </View>

      {/* ── Shop Drawer ── */}
      <Modal
        visible={showShop}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowShop(false); setSoldSubTab('all'); setSoldSort('recent'); }}      >

        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setShowShop(false); setSoldSubTab('all'); setSoldSort('recent'); }} />
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
          {/* Shop tabs — icon grid, always fits any screen width */}
          <View style={{
            flexDirection: 'row', paddingHorizontal: 24,
            marginBottom: 16, gap: 8,
          }}>
            {(([
              { key: 'bidding', icon: '🔨', label: 'Bidding' },
              { key: 'buynow', icon: '🏷️', label: 'Buy Now' },
              { key: 'sold', icon: '✅', label: 'Sold' },
              ...(isSeller ? [{ key: 'offers', icon: '💰', label: 'Offers' }] : []),
            ]) as { key: 'bidding' | 'buynow' | 'sold' | 'offers'; icon: string; label: string }[]).map(tab => {
              const active = shopTab === tab.key;
              const hasOffersbadge = tab.key === 'offers' && pendingOffers.length > 0;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 10,
                    borderRadius: 14,
                    backgroundColor: active ? '#1A56DB' : '#1F2937',
                    borderWidth: 1,
                    borderColor: active ? '#1A56DB' : '#374151',
                    position: 'relative',
                  }}
                  onPress={() => setShopTab(tab.key)}
                >
                  <Text style={{ fontSize: 18, marginBottom: 3 }}>{tab.icon}</Text>
                  <Text style={{
                    fontSize: 10, fontWeight: '700',
                    color: active ? '#fff' : '#6B7280',
                  }}>{tab.label}</Text>
                  {hasOffersbadge && (
                    <View style={{
                      position: 'absolute', top: 6, right: 6,
                      backgroundColor: '#DC2626', borderRadius: 999,
                      minWidth: 14, height: 14, paddingHorizontal: 3,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>
                        {pendingOffers.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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
                      if (currentItem) {
                        Alert.alert('Item Already Running', 'End or skip the current item before starting a new one.');
                        return;
                      }
                      setEditingQueueItem({ id: item.id, title: item.title, price: item.price });
                      setEditingPrice(String(item.price / 100));
                      setShowShop(false);
                    }
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: '#1F2937', borderRadius: 12,
                    padding: 12, marginBottom: 8,
                    opacity: isSeller && item.status === 'QUEUED' && currentItem ? 0.4 : 1,

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
            {shopTab === 'sold' && (() => {
              // Split by type first, then mode
              const filtered = soldItems.filter(i => {
                const isBuyNow = i.type === 'BUY_NOW';
                const mode = soldItemWinners[i.id]?.mode ?? i.mode ?? 'auction';
                if (soldSubTab === 'buynow') return isBuyNow;
                if (soldSubTab === 'auction') return !isBuyNow && mode === 'auction';
                if (soldSubTab === 'chat') return !isBuyNow && mode === 'chat';
                return true; // 'all'
              });

              // Sort
              const sorted = [...filtered].sort((a, b) => {
                const aAmount = soldItemWinners[a.id]?.amount ?? a.price;
                const bAmount = soldItemWinners[b.id]?.amount ?? b.price;
                if (soldSort === 'high') return bAmount - aAmount;
                if (soldSort === 'low') return aAmount - bAmount;
                return 0;
              });

              // Counts for badges
              const auctionCount = soldItems.filter(i => i.type !== 'BUY_NOW' && (soldItemWinners[i.id]?.mode ?? i.mode ?? 'auction') === 'auction').length;
              const chatCount = soldItems.filter(i => i.type !== 'BUY_NOW' && (soldItemWinners[i.id]?.mode ?? i.mode ?? 'auction') === 'chat').length;
              const buyNowCount = soldItems.filter(i => i.type === 'BUY_NOW').length;

              return (
                <>
                  {/* Filter + sort — two cycling pills */}
                  <View style={{
                    flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'center',
                  }}>
                    {/* Filter pill — cycles through modes */}
                    <TouchableOpacity
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: soldSubTab !== 'all' ? 'rgba(26,86,219,0.15)' : '#1F2937',
                        borderWidth: 1,
                        borderColor: soldSubTab !== 'all' ? '#1A56DB' : '#374151',
                        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                      }}
                      onPress={() => setSoldSubTab(s =>
                        s === 'all' ? 'auction' : s === 'auction' ? 'chat' : s === 'chat' ? 'buynow' : 'all'
                      )}
                    >
                      <Text style={{
                        color: soldSubTab !== 'all' ? '#60A5FA' : '#6B7280',
                        fontSize: 13, fontWeight: '700',
                      }}>
                        {soldSubTab === 'all' ? 'All modes'
                          : soldSubTab === 'auction' ? '🔨 Swipe'
                          : soldSubTab === 'chat' ? '💬 Chat'
                          : '🏷️ Buy Now'}
                      </Text>
                      <Text style={{ color: '#4B5563', fontSize: 11 }}>⇄</Text>
                    </TouchableOpacity>

                    {/* Sort pill */}
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: soldSort !== 'recent' ? 'rgba(245,158,11,0.1)' : '#1F2937',
                        borderWidth: 1,
                        borderColor: soldSort !== 'recent' ? '#F59E0B' : '#374151',
                        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                      }}
                      onPress={() => setSoldSort(s =>
                        s === 'recent' ? 'high' : s === 'high' ? 'low' : 'recent'
                      )}
                    >
                      <Text style={{
                        color: soldSort !== 'recent' ? '#F59E0B' : '#6B7280',
                        fontSize: 13, fontWeight: '700',
                      }}>
                        {soldSort === 'recent' ? '↕' : soldSort === 'high' ? '↓' : '↑'}
                      </Text>
                      <Text style={{
                        color: soldSort !== 'recent' ? '#F59E0B' : '#6B7280',
                        fontSize: 12, fontWeight: '600',
                      }}>
                        {soldSort === 'recent' ? 'Sort' : soldSort === 'high' ? 'High' : 'Low'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Items */}
                  {sorted.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                      <Text style={{ color: '#4B5563', fontSize: 13 }}>No items here yet</Text>
                    </View>
                  ) : sorted.map(item => {
                    const winner = soldItemWinners[item.id];
                    const isBuyNow = item.type === 'BUY_NOW';
                    const itemMode = isBuyNow ? 'buynow' : (winner?.mode ?? item.mode ?? 'auction');
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
                              {!isBuyNow && winner.displayName && winner.displayName !== 'Unknown' && (
                                <Text style={{ color: '#6B7280', fontSize: 11 }}>
                                  Won by {winner.displayName}
                                </Text>
                              )}
                              {isBuyNow && (
                                <Text style={{ color: '#6B7280', fontSize: 11 }}>
                                  {winner.displayName && winner.displayName !== 'Unknown'
                                    ? `Bought by ${winner.displayName}`
                                    : 'Fixed price purchase'}
                                </Text>
                              )}
                            </>
                          ) : (
                            <Text style={{ color: '#10B981', fontSize: 12 }}>
                              ✅ {isBuyNow ? 'Purchased' : 'Sold'}
                            </Text>
                          )}
                        </View>
                        {/* Mode badge */}
                        <View style={{
                          borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                          borderWidth: 1,
                          backgroundColor: isBuyNow
                            ? 'rgba(16,185,129,0.15)'
                            : itemMode === 'chat'
                              ? 'rgba(124,58,237,0.15)'
                              : 'rgba(26,86,219,0.15)',
                          borderColor: isBuyNow
                            ? 'rgba(16,185,129,0.4)'
                            : itemMode === 'chat'
                              ? 'rgba(124,58,237,0.4)'
                              : 'rgba(26,86,219,0.4)',
                        }}>
                          <Text style={{
                            fontSize: 10, fontWeight: '700',
                            color: isBuyNow ? '#10B981' : itemMode === 'chat' ? '#A78BFA' : '#60A5FA',
                          }}>
                            {isBuyNow ? '🏷️' : itemMode === 'chat' ? '💬' : '🔨'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()}

            {/* ── Offers Tab ── */}
            {shopTab === 'offers' && (
              !isSeller ? null :
              pendingOffers.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>💰</Text>
                  <Text style={{ color: '#4B5563', fontSize: 13 }}>No pending offers</Text>
                </View>
              ) : pendingOffers.map(offer => (
                <View
                  key={offer.offerId}
                  style={{
                    backgroundColor: '#1F2937', borderRadius: 14,
                    padding: 14, marginBottom: 10,
                    borderWidth: 1, borderColor: '#374151',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                        {offer.itemTitle}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                        {offer.buyerName} offered{' '}
                        <Text style={{ color: '#F59E0B', fontWeight: '700' }}>
                          {formatPHP(offer.amount)}
                        </Text>
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1, backgroundColor: '#10B981',
                          borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                        }}
                        onPress={async () => {
                          try {
                            const { apiClient } = await import('../../../src/services/api/client');
                            await apiClient.patch(`/offers/${offer.offerId}/accept`);
                            setPendingOffers(prev => prev.filter(o => o.offerId !== offer.offerId));
                            void auctionsApi.getById(id).then(setAuction);
                            setShowShop(false);
                            // Inject accepted system message into chat — no blocking Alert
                            setChatMessages(prev => [...prev, {
                              id: `offer-accepted-${offer.offerId}-${Date.now()}`,
                              userId: '__system__',
                              displayName: '',
                              message: '',
                              timestamp: Date.now(),
                              type: 'system_offer',
                              itemTitle: offer.itemTitle,
                              winnerAmount: offer.amount,
                              buyerName: `✅ ${offer.buyerName}`,
                            }]);
                          } catch {
                            Alert.alert('Error', 'Failed to accept offer.');
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flex: 1, backgroundColor: '#DC2626',
                          borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                        }}
                        onPress={async () => {
                          try {
                            const { apiClient } = await import('../../../src/services/api/client');
                            await apiClient.patch(`/offers/${offer.offerId}/decline`);
                            setPendingOffers(prev => prev.filter(o => o.offerId !== offer.offerId));
                          } catch {
                            Alert.alert('Error', 'Failed to decline offer.');
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Decline</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={{
                        backgroundColor: 'rgba(245,158,11,0.15)',
                        borderWidth: 1, borderColor: '#F59E0B',
                        borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                      }}
                      onPress={() => {
                        Alert.alert(
                          `🔨 Run at ${formatPHP(offer.amount)}?`,
                          `Convert to live auction starting at ${formatPHP(offer.amount)} and decline ${offer.buyerName}'s offer.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Run Auction',
                              onPress: async () => {
                                try {
                                  const { apiClient } = await import('../../../src/services/api/client');
                                  const matchedItem = auction?.shopItems.find(
                                    i => i.title === offer.itemTitle && i.type === 'BUY_NOW'
                                  );
                                  if (!matchedItem) {
                                    Alert.alert('Error', 'Could not find the item to convert.');
                                    return;
                                  }
                                  if (currentItem) {
                                    Alert.alert('Item Already Running', 'End or skip the current item before running a new one.');
                                    return;
                                  }
                                  await apiClient.patch(`/offers/${offer.offerId}/decline?silent=true`);
                                  const converted = await apiClient.patch(`/shop-items/${matchedItem.id}/convert-to-auction`, {
                                    startingPrice: offer.amount,
                                  });
                                  setPendingOffers(prev => prev.filter(o => o.offerId !== offer.offerId));
                                  // Refresh auction state
                                  void auctionsApi.getById(id).then(data => {
                                    setAuction(data);
                                    notifyShopUpdated();
                                  });
                                  // Close shop, open Start Item modal immediately
                                  setShowShop(false);
                                  setSelectedItem({
                                    id: matchedItem.id,
                                    title: matchedItem.title,
                                    price: offer.amount,
                                  });
                                  setItemMode('auction');
                                  setShowStartItem(true);
                                } catch {
                                  Alert.alert('Error', 'Failed to convert item. Try again.');
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 13 }}>
                        🔨 Run at {formatPHP(offer.amount)}
                      </Text>
                      <Text style={{ color: '#92400E', fontSize: 10, marginTop: 2 }}>
                        Convert to live auction · declines offer
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
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
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48,
          }}>
            {/* Handle + item title */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Starting</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }} numberOfLines={1}>
                {selectedItem?.title}
              </Text>
            </View>

            {/* Mode selector */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              <TouchableOpacity
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                  backgroundColor: itemMode === 'auction' ? 'rgba(26,86,219,0.2)' : '#1F2937',
                  borderWidth: 1, borderColor: itemMode === 'auction' ? '#1A56DB' : '#2D3748',
                }}
                onPress={() => setItemMode('auction')}
              >
                <Text style={{ fontSize: 22, marginBottom: 4 }}>🔨</Text>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Swipe</Text>
                <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>Timer · auto bid</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                  backgroundColor: itemMode === 'chat' ? 'rgba(124,58,237,0.2)' : '#1F2937',
                  borderWidth: 1, borderColor: itemMode === 'chat' ? '#7C3AED' : '#2D3748',
                }}
                onPress={() => setItemMode('chat')}
              >
                <Text style={{ fontSize: 22, marginBottom: 4 }}>💬</Text>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Chat Bid</Text>
                <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>Buyers type bids</Text>
              </TouchableOpacity>
            </View>

            {/* Swipe mode settings */}
            {itemMode === 'auction' && (
              <View style={{ gap: 16, marginBottom: 24 }}>
                {/* Start time */}
                <View>
                  <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 }}>
                    START TIME
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[10, 15, 30, 60].map(s => (
                      <TouchableOpacity
                        key={s}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                          backgroundColor: startSeconds === s && !customStartSeconds ? '#1A56DB' : '#1F2937',
                          borderWidth: 1,
                          borderColor: startSeconds === s && !customStartSeconds ? '#1A56DB' : '#2D3748',
                        }}
                        onPress={() => { setStartSeconds(s); setCustomStartSeconds(false); }}
                      >
                        <Text style={{
                          color: startSeconds === s && !customStartSeconds ? '#fff' : '#6B7280',
                          fontWeight: '700', fontSize: 13,
                        }}>{s}s</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        backgroundColor: customStartSeconds ? '#1A56DB' : '#1F2937',
                        borderWidth: 1, borderColor: customStartSeconds ? '#1A56DB' : '#2D3748',
                      }}
                      onPress={() => setCustomStartSeconds(v => !v)}
                    >
                      <Text style={{
                        color: customStartSeconds ? '#fff' : '#6B7280',
                        fontWeight: '700', fontSize: 13,
                      }}>···</Text>
                    </TouchableOpacity>
                  </View>
                  {customStartSeconds && (
                    <TextInput
                      style={{
                        backgroundColor: '#1F2937', borderRadius: 10,
                        borderWidth: 1, borderColor: '#1A56DB',
                        paddingHorizontal: 14, paddingVertical: 10,
                        color: '#fff', fontSize: 14, marginTop: 8,
                      }}
                      placeholder="Custom seconds..."
                      placeholderTextColor="#4B5563"
                      keyboardType="numeric"
                      onChangeText={t => setStartSeconds(parseInt(t) || 30)}
                    />
                  )}
                </View>

                {/* Counterbid window */}
                <View>
                  <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 }}>
                    COUNTERBID WINDOW
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[3, 5, 7, 10].map(s => (
                      <TouchableOpacity
                        key={s}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                          backgroundColor: startCounterbid === s && !customCounterbid ? '#F59E0B' : '#1F2937',
                          borderWidth: 1,
                          borderColor: startCounterbid === s && !customCounterbid ? '#F59E0B' : '#2D3748',
                        }}
                        onPress={() => { setStartCounterbid(s); setCustomCounterbid(false); }}
                      >
                        <Text style={{
                          color: startCounterbid === s && !customCounterbid ? '#111827' : '#6B7280',
                          fontWeight: '700', fontSize: 13,
                        }}>{s}s</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        backgroundColor: customCounterbid ? '#F59E0B' : '#1F2937',
                        borderWidth: 1, borderColor: customCounterbid ? '#F59E0B' : '#2D3748',
                      }}
                      onPress={() => setCustomCounterbid(v => !v)}
                    >
                      <Text style={{
                        color: customCounterbid ? '#111827' : '#6B7280',
                        fontWeight: '700', fontSize: 13,
                      }}>···</Text>
                    </TouchableOpacity>
                  </View>
                  {customCounterbid && (
                    <TextInput
                      style={{
                        backgroundColor: '#1F2937', borderRadius: 10,
                        borderWidth: 1, borderColor: '#F59E0B',
                        paddingHorizontal: 14, paddingVertical: 10,
                        color: '#fff', fontSize: 14, marginTop: 8,
                      }}
                      placeholder="Custom seconds..."
                      placeholderTextColor="#4B5563"
                      keyboardType="numeric"
                      onChangeText={t => setStartCounterbid(parseInt(t) || 5)}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Chat mode settings */}
            {itemMode === 'chat' && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 }}>
                  DISPLAY TIMER (OPTIONAL)
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {[0, 30, 60, 120].map(s => (
                    <TouchableOpacity
                      key={s}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        backgroundColor: startSeconds === s ? '#7C3AED' : '#1F2937',
                        borderWidth: 1, borderColor: startSeconds === s ? '#7C3AED' : '#2D3748',
                      }}
                      onPress={() => setStartSeconds(s)}
                    >
                      <Text style={{
                        color: startSeconds === s ? '#fff' : '#6B7280',
                        fontWeight: '700', fontSize: 13,
                      }}>{s === 0 ? 'None' : `${s}s`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{
                  flexDirection: 'row', gap: 10, alignItems: 'flex-start',
                  backgroundColor: '#1F2937', borderRadius: 12, padding: 12,
                }}>
                  <Text style={{ fontSize: 14 }}>💡</Text>
                  <Text style={{ color: '#4B5563', fontSize: 12, flex: 1, lineHeight: 18 }}>
                    Buyers bid by typing in chat. Tap a message to crown the winner.
                  </Text>
                </View>
              </View>
            )}

            {/* Start button */}
            <TouchableOpacity
              style={{
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                backgroundColor: itemMode === 'auction' ? '#1A56DB' : '#7C3AED',
                opacity: selectedItem?.id === '__pending__' ? 0.5 : 1,
              }}
              onPress={() => {
                if (!selectedItem || !user?.id || selectedItem.id === '__pending__') {
                  Alert.alert('Please wait', 'Item is still being created...');
                  return;
                }
                const optimistic: CurrentItem = {
                  itemId: selectedItem.id,
                  title: selectedItem.title,
                  currentPrice: selectedItem.price,
                  photos: [],
                  totalBids: 0,
                  mode: itemMode,
                };
                setCurrentItem(optimistic);
                currentItemRef.current = optimistic;
                setChatMessages(prev => [...prev, {
                  id: `divider-${selectedItem.id}-${Date.now()}`,
                  userId: '__system__',
                  displayName: '',
                  message: '',
                  timestamp: Date.now(),
                  type: 'item-divider' as const,
                  itemTitle: selectedItem.title,
                }]);
                if (itemMode === 'auction') {
                  startItemTimer(selectedItem.id, user.id, startSeconds, startCounterbid);
                } else {
                  startChatBid(selectedItem.id, user.id, startSeconds);
                }
                setShowStartItem(false);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {itemMode === 'auction'
                  ? `🔨 Start — ${startSeconds}s · ${startCounterbid}s counterbid`
                  : '💬 Start Chat Bid'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Sale Toast ── */}
      {saleToast && (
        <View style={{
          position: 'absolute',
          top: insets.top + 16, left: 24, right: 24,
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
            paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48,
          }}>
            {/* Handle + header */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Add Item</Text>
            </View>

            {/* Title input */}
            <TextInput
              style={{
                backgroundColor: '#1F2937', borderRadius: 14,
                borderWidth: 1, borderColor: newItemTitle ? '#1A56DB' : '#2D3748',
                paddingHorizontal: 16, paddingVertical: 14,
                color: '#fff', fontSize: 15, marginBottom: 10,
              }}
              placeholder="Item title"
              placeholderTextColor="#4B5563"
              value={newItemTitle}
              onChangeText={setNewItemTitle}
              maxLength={100}
              autoFocus
            />

            {/* Price input */}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              borderWidth: 1, borderColor: newItemPrice ? '#1A56DB' : '#2D3748',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, marginBottom: 20,
            }}>
              <Text style={{ color: '#4B5563', fontSize: 15, marginRight: 6, fontWeight: '600' }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 14 }}
                placeholder="Starting price"
                placeholderTextColor="#4B5563"
                value={newItemPrice}
                onChangeText={t => setNewItemPrice(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
              />
              {newItemPrice.length > 0 && (
                <Text style={{ color: '#6B7280', fontSize: 12 }}>
                  {formatPHP(parseInt(newItemPrice) * 100)}
                </Text>
              )}
            </View>

            {/* Mode selector */}
            <View style={{
              flexDirection: 'row', gap: 8, marginBottom: 20,
            }}>
              {([
                { mode: 'queue', icon: '📦', label: 'Queue', sub: 'Start later' },
                { mode: 'now', icon: '🔨', label: 'Run Now', sub: 'Start immediately' },
                { mode: 'buynow', icon: '🏷️', label: 'Buy Now', sub: 'Fixed price' },
              ] as const).map(opt => {
                const active = (() => {
                  if (opt.mode === 'queue') return !currentItem && newAddMode === 'queue';
                  return newAddMode === opt.mode;
                })();
                const disabled = opt.mode === 'now' && !!currentItem;
                return (
                  <TouchableOpacity
                    key={opt.mode}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 12,
                      borderRadius: 14, borderWidth: 1,
                      backgroundColor: active
                        ? opt.mode === 'now' ? 'rgba(220,38,38,0.15)'
                          : opt.mode === 'buynow' ? 'rgba(6,95,70,0.3)'
                          : 'rgba(26,86,219,0.15)'
                        : '#1F2937',
                      borderColor: active
                        ? opt.mode === 'now' ? '#DC2626'
                          : opt.mode === 'buynow' ? '#10B981'
                          : '#1A56DB'
                        : '#2D3748',
                      opacity: disabled ? 0.35 : 1,
                    }}
                    onPress={() => {
                      if (disabled) {
                        Alert.alert('Item Running', 'End or skip the current item first.');
                        return;
                      }
                      setNewAddMode(opt.mode);
                    }}
                    disabled={addingItem}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</Text>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
                    <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>{opt.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Buy Now sub-options */}
            {newAddMode === 'buynow' && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                <TouchableOpacity
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 12,
                    borderRadius: 14, borderWidth: 1,
                    backgroundColor: buyNowMode === 'shop' ? 'rgba(16,185,129,0.15)' : '#1F2937',
                    borderColor: buyNowMode === 'shop' ? '#10B981' : '#2D3748',
                  }}
                  onPress={() => setBuyNowMode('shop')}
                >
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>🏪</Text>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Shop Only</Text>
                  <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>Sits in Buy Now tab</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 12,
                    borderRadius: 14, borderWidth: 1,
                    backgroundColor: buyNowMode === 'live' ? 'rgba(16,185,129,0.15)' : '#1F2937',
                    borderColor: buyNowMode === 'live' ? '#10B981' : '#2D3748',
                    opacity: currentItem ? 0.35 : 1,
                  }}
                  onPress={() => {
                    if (currentItem) {
                      Alert.alert('Item Running', 'End or skip the current item first.');
                      return;
                    }
                    setBuyNowMode('live');
                  }}
                >
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>📺</Text>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Show Live</Text>
                  <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>Viewers swipe to buy</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Confirm button */}
            <TouchableOpacity
              style={{
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                backgroundColor: newItemTitle.trim() && newItemPrice
                  ? newAddMode === 'now' ? '#DC2626'
                    : newAddMode === 'buynow' ? '#065F46'
                    : '#1A56DB'
                  : '#1F2937',
                opacity: !newItemTitle.trim() || !newItemPrice || addingItem ? 0.5 : 1,
              }}
              onPress={() => void handleAddItemLive(newAddMode)}
              disabled={!newItemTitle.trim() || !newItemPrice || addingItem}
            >
              {addingItem ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {newAddMode === 'now' ? '🔨 Run Now'
                    : newAddMode === 'buynow' && buyNowMode === 'live' ? '📺 Show Live Now'
                    : newAddMode === 'buynow' ? '🏪 List in Shop'
                    : '📦 Add to Queue'}
                </Text>
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
                
                // Inject winner chat message immediately (Mode 2 — server will also fire onItemEnded)
                // We inject here for instant feedback; onItemEnded deduplicates via unique id
                setChatMessages(prev => [...prev, {
                  id: `winner-chat-${currentItem.itemId}-${Date.now()}`,
                  userId: '__system__',
                  displayName: '',
                  message: declaringWinner.displayName,
                  timestamp: Date.now(),
                  type: 'system_winner',
                  itemTitle: currentItem.title,
                  winnerAmount: amount,
                }]);

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

      {/* ── Edit Queue Item Modal ── */}
      <Modal
        visible={!!editingQueueItem}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingQueueItem(null)}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setEditingQueueItem(null)}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48,
          }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>Queued Item</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }} numberOfLines={1}>
                {editingQueueItem?.title}
              </Text>
            </View>

            {/* Price editor */}
            <Text style={{
              color: '#6B7280', fontSize: 11, fontWeight: '600',
              letterSpacing: 0.5, marginBottom: 8,
            }}>
              STARTING PRICE
            </Text>
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              borderWidth: 1, borderColor: editingPrice ? '#1A56DB' : '#2D3748',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, marginBottom: 8,
            }}>
              <Text style={{ color: '#4B5563', fontSize: 15, marginRight: 6, fontWeight: '600' }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', paddingVertical: 14 }}
                placeholder="0"
                placeholderTextColor="#4B5563"
                value={editingPrice}
                onChangeText={t => setEditingPrice(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
              />
              {editingPrice.length > 0 && (
                <Text style={{ color: '#6B7280', fontSize: 12 }}>
                  {formatPHP(parseInt(editingPrice) * 100)}
                </Text>
              )}
            </View>

            {/* Original price hint */}
            {editingQueueItem && parseInt(editingPrice) * 100 !== editingQueueItem.price && (
              <Text style={{ color: '#4B5563', fontSize: 11, marginBottom: 20 }}>
                Original: {formatPHP(editingQueueItem.price)}
                {parseInt(editingPrice) * 100 < editingQueueItem.price && (
                  <Text style={{ color: '#10B981' }}>
                    {' '}· {Math.round((1 - parseInt(editingPrice) * 100 / editingQueueItem.price) * 100)}% off
                  </Text>
                )}
              </Text>
            )}
            {(!editingQueueItem || parseInt(editingPrice) * 100 === editingQueueItem.price) && (
              <View style={{ marginBottom: 20 }} />
            )}

            {/* Action buttons */}
            <View style={{ gap: 10 }}>
              {/* Save price + Start */}
              <TouchableOpacity
                style={{
                  borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                  backgroundColor: editingPrice ? '#1A56DB' : '#1F2937',
                  opacity: !editingPrice || savingPrice ? 0.5 : 1,
                }}
                disabled={!editingPrice || savingPrice}
                onPress={async () => {
                  if (!editingQueueItem || !editingPrice) return;
                  const newPrice = parseInt(editingPrice) * 100;
                  setSavingPrice(true);
                  try {
                    const { apiClient } = await import('../../../src/services/api/client');
                    // Only patch if price changed
                    if (newPrice !== editingQueueItem.price) {
                      await apiClient.patch(`/shop-items/${editingQueueItem.id}`, {
                        price: newPrice,
                      });
                      // Update local auction state
                      setAuction(prev => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          shopItems: prev.shopItems.map(i =>
                            i.id === editingQueueItem.id ? { ...i, price: newPrice } : i
                          ),
                        };
                      });
                      notifyShopUpdated();
                    }
                    setSelectedItem({
                      id: editingQueueItem.id,
                      title: editingQueueItem.title,
                      price: newPrice,
                    });
                    setEditingQueueItem(null);
                    setShowStartItem(true);
                  } catch {
                    Alert.alert('Error', 'Failed to update price. Try again.');
                  } finally {
                    setSavingPrice(false);
                  }
                }}
              >
                {savingPrice ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    🔨 Start at {editingPrice ? formatPHP(parseInt(editingPrice) * 100) : '—'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Just save price without starting */}
              <TouchableOpacity
                style={{
                  borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: 'transparent',
                  borderWidth: 1, borderColor: '#2D3748',
                  opacity: !editingPrice || savingPrice ? 0.5 : 1,
                }}
                disabled={!editingPrice || savingPrice}
                onPress={async () => {
                  if (!editingQueueItem || !editingPrice) return;
                  const newPrice = parseInt(editingPrice) * 100;
                  if (newPrice === editingQueueItem.price) {
                    setEditingQueueItem(null);
                    return;
                  }
                  setSavingPrice(true);
                  try {
                    const { apiClient } = await import('../../../src/services/api/client');
                    await apiClient.patch(`/shop-items/${editingQueueItem.id}`, { price: newPrice });
                    setAuction(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        shopItems: prev.shopItems.map(i =>
                          i.id === editingQueueItem.id ? { ...i, price: newPrice } : i
                        ),
                      };
                    });
                    notifyShopUpdated();
                    setEditingQueueItem(null);
                  } catch {
                    Alert.alert('Error', 'Failed to update price. Try again.');
                  } finally {
                    setSavingPrice(false);
                  }
                }}
              >
                <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 14 }}>
                  Save Price Only
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
