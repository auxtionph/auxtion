import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
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
  LogBox,
} from 'react-native';
LogBox.ignoreLogs(['[HMS] ON_ERROR', 'setupPIP']);
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { auctionsApi, AuctionDetail } from '../../../src/services/api/auctions.api';
import { apiClient } from '../../../src/services/api/client';
import { useAuctionSocket } from '../../../src/hooks/useSocket';
import { formatPHP } from '@auxtion/utils';
import { useAuthStore } from '../../../src/stores/auth.store';
import { useHMS } from '../../../src/hooks/useHMS';
import { HMSVideoView } from '../../../src/components/stream/HMSView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { SellerPublicProfileView } from '../../../src/components/SellerPublicProfileView';

// ─── Cross-platform icon: SF Symbol on iOS, emoji on Android ──────
function Icon({
  symbol,
  fallback,
  size = 22,
  tint = '#fff',
}: {
  symbol: SFSymbol;
  fallback: string;
  size?: number;
  tint?: string;
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={symbol}
        size={size}
        tintColor={tint}
        weight="semibold"
        type="hierarchical"
      />
    );
  }
  return <Text style={{ fontSize: size - 4, color: tint }}>{fallback}</Text>;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChatMsg {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
  type?: 'message' | 'item-divider' | 'system_winner' | 'system_offer' | 'system_item_queued';
  itemTitle?: string;
  winnerAmount?: number;
  buyerName?: string;
  itemPrice?: number;
  itemMode?: string;
}

interface CurrentItem {
  itemId: string;
  title: string;
  currentPrice: number;
  photos: { url: string }[];
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
  photos: { url: string }[];
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

// Fuzzy name match — checks if any word in gcash name appears in seller display name
const namesSeem = (gcashName: string, sellerName: string): boolean => {
  if (!gcashName || !sellerName) return true;
  const gcashWords = gcashName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const sellerLower = sellerName.toLowerCase();
  return gcashWords.some(word => sellerLower.includes(word));
};

function SwipeBidButton({ label, sublabel, onBid, color = '#1A56DB' }: {
  label: string;
  sublabel: string;
  onBid: () => void;
  color?: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const THRESHOLD = SCREEN_WIDTH * 0.5;
  const MAX_DRAG = SCREEN_WIDTH - 48 - 64;
  const onBidRef = useRef(onBid);
  const hasFiredRef = useRef(false);
  useEffect(() => { onBidRef.current = onBid; }, [onBid]);

  const triggerSuccess = () => {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
      Animated.delay(400),
      Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      hasFiredRef.current = false;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onPanResponderMove: (_, g) => {
      const val = Math.max(0, Math.min(g.dx, MAX_DRAG));
      translateX.setValue(val);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx >= THRESHOLD && !hasFiredRef.current) {
        hasFiredRef.current = true;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        triggerSuccess();
        onBidRef.current();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  const bgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [color, '#10B981'],
  });

  return (
    <View>
      {/* Swipe bar */}
      <Animated.View style={{
        backgroundColor: bgColor,
        borderRadius: 10,
        height: 56,
        overflow: 'hidden',
        justifyContent: 'center',
      }}>
        <View style={{
          position: 'absolute', right: 12,
          flexDirection: 'row', alignItems: 'center',
        }}>
          {([0.12, 0.28, 0.55] as const).map((op, i) => (
            <Text key={i} style={{ color: '#fff', fontSize: 16, opacity: op }}>›</Text>
          ))}
        </View>
        <View style={{ position: 'absolute', left: 66, right: 40, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.1 }} numberOfLines={1}>
            {label}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, marginTop: 2 }}>
            {sublabel}
          </Text>
        </View>
        <Animated.View
          style={{
            transform: [{ translateX }],
            width: 48, height: 48, borderRadius: 8,
            marginLeft: 4,
            backgroundColor: '#fff',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4,
          }}
          {...panResponder.panHandlers}
        >
          <Icon symbol="chevron.right.2" fallback=">>" size={20} tint={color} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const REACTION_ICONS = [
  { symbol: 'flame.fill' as SFSymbol, tint: '#F97316', label: 'flame' },
  { symbol: 'heart.fill' as SFSymbol, tint: '#EF4444', label: 'heart' },
  { symbol: 'crown.fill' as SFSymbol, tint: '#F59E0B', label: 'crown' },
  { symbol: 'diamond.fill' as SFSymbol, tint: '#60A5FA', label: 'diamond' },
  { symbol: 'bolt.fill' as SFSymbol, tint: '#FACC15', label: 'bolt' },
  { symbol: 'banknote.fill' as SFSymbol, tint: '#10B981', label: 'banknote' },
];

interface FloatingEmojiItem {
  id: string;
  emoji: string;
  x: number;
}

function FloatingEmoji({ item, onDone }: { item: FloatingEmojiItem; onDone: (id: string) => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  const iconData = REACTION_ICONS.find(r => r.label === item.emoji);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -220, duration: 1800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1.2, useNativeDriver: true, friction: 4 }),
      Animated.sequence([
        Animated.timing(translateX, { toValue: -12, duration: 300, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 12, duration: 300, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: -8, duration: 250, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 8, duration: 250, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(() => onDone(item.id));
  }, []);

  return (
    <Animated.View style={{
      position: 'absolute',
      right: item.x,
      bottom: 0,
      transform: [{ translateY }, { translateX }, { scale }],
      opacity,
    }}>
      {iconData && (
        <Icon symbol={iconData.symbol} fallback={iconData.label} size={32} tint={iconData.tint} />
      )}
    </Animated.View>
  );
}

// ── Follow Seller Button (live room) ──────────────────────────────────────
function FollowSellerButton({ sellerId, userId }: { sellerId: string; userId?: string }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || userId === sellerId) return;
    void apiClient.get(`/sellers/${sellerId}/follow-status`)
      .then(res => {
        const d = res.data.data as { following: boolean };
        setFollowing(d.following);
      })
      .catch(() => {});
  }, [sellerId, userId]);

  const toggle = async () => {
    if (loading || !userId || userId === sellerId) return;
    setLoading(true);
    try {
      const res = await apiClient.post(`/sellers/${sellerId}/follow`);
      const d = res.data.data as { following: boolean };
      setFollowing(d.following);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (!userId || userId === sellerId) return null;

  return (
    <TouchableOpacity
      onPress={() => void toggle()}
      disabled={loading}
      style={{
        backgroundColor: following ? 'rgba(255,255,255,0.12)' : '#1A56DB',
        borderWidth: 1,
        borderColor: following ? 'rgba(255,255,255,0.25)' : '#1A56DB',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        opacity: loading ? 0.6 : 1,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
        {following ? '✓ Following' : '+ Follow'}
      </Text>
    </TouchableOpacity>
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
  const [maxBidEnabled, setMaxBidEnabled] = useState(false);
  const [myMaxBid, setMyMaxBid] = useState<number | undefined>(undefined);
  const [isSubmittingMaxBid, setIsSubmittingMaxBid] = useState(false);
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

  const isHost = isSeller;
  const isCoHost = !!(auction?.coHostId && auction.coHostId === user?.id);
  const isBroadcaster = isHost || isCoHost;
  const hasCoHost = !!auction?.coHostId;

  const chatRef = useRef<FlatList>(null);
  const currentItemRef = useRef<CurrentItem | null>(null); 
  const bidStateReceivedRef = useRef(false);
  const [broadcasterReconnecting, setBroadcasterReconnecting] = useState(false);
  const [viewerConnecting, setViewerConnecting] = useState(false);
  const pendingBidStateRef = useRef<BidUpdateData | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [claimingBuyNow, setClaimingBuyNow] = useState(false);
  const [preparingItemId, setPreparingItemId] = useState<string | null>(null);

  // ── Co-host state ──────────────────────────────────────────────
  const [coHostInvite, setCoHostInvite] = useState<{
    auctionId: string;
    hostUserId: string;
    hostDisplayName: string;
  } | null>(null);
  const [chatActionSheet, setChatActionSheet] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);

  const [hostSheetOpen, setHostSheetOpen] = useState(false);

  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // Viewer roster + co-host invite search
  const [viewerRoster, setViewerRoster] = useState<{ userId: string; displayName: string; joinedAt: number }[]>([]);

  const [rosterSearch, setRosterSearch] = useState('');
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const requestRosterRef = useRef<((sellerId: string, coHostId?: string) => void) | null>(null);

  // ── Video layout mode (only meaningful when hasCoHost) ─────────
  type VideoLayout = 'pip-host' | 'pip-cohost' | 'split-host-top' | 'split-cohost-top';
  const [videoLayout, setVideoLayout] = useState<VideoLayout>('pip-host');

  type HostSheetView = { type: 'list' } | { type: 'profile'; userId: string };
  const [hostSheetView, setHostSheetView] = useState<HostSheetView>({ type: 'list' });

  // ── Profile Gate ─────────────────────────────────────────────────
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [profileStep, setProfileStep] = useState<'address' | 'payment'>('address');
  const [addressForm, setAddressForm] = useState({
    name: '', phone: '', line1: '', city: '', province: '', postalCode: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    gcashNumber: '', gcashName: '',
    bankName: '', bankAccountNumber: '', bankAccountName: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [showEndLiveModal, setShowEndLiveModal] = useState(false);
  const [endLiveUnpaid, setEndLiveUnpaid] = useState<Array<{
    id: string;
    itemTitle: string;
    buyerName: string;
    amount: number;
    paymentDeadline: string | null;
  }>>([]);
  const [endingLive, setEndingLive] = useState(false);
  const [showChatPaySheet, setShowChatPaySheet] = useState(false);
  const [chatPayReference, setChatPayReference] = useState('');
  const [chatPayProofUrl, setChatPayProofUrl] = useState('');
  const [uploadingChatProof, setUploadingChatProof] = useState(false);
  const [verifiedChatName, setVerifiedChatName] = useState(false);

  const handlePickChatProof = async () => {
    try {
      const IPicker = await import('expo-image-picker');
      const { status } = await IPicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo access to attach a screenshot.');
        return;
      }
      const result = await IPicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploadingChatProof(true);
      const { uploadPhotoToCloudinary } = await import('../../../src/lib/cloudinary');
      const uploaded = await uploadPhotoToCloudinary(result.assets[0].uri);
      setChatPayProofUrl(uploaded.url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload screenshot. Try again.');
    } finally {
      setUploadingChatProof(false);
    }
  };
  const [chatPayOrder, setChatPayOrder] = useState<{
    orderId: string;
    itemTitle: string;
    amount: number;
    sellerId: string;
  } | null>(null);
  const [sellerPaymentInfo, setSellerPaymentInfo] = useState<{
    displayName: string;
    gcash: { number: string; name: string } | null;
    bank: { name: string; accountNumber: string; accountName: string } | null;
  } | null>(null);
  const [loadingPaymentInfo, setLoadingPaymentInfo] = useState(false);

  // Seller action sheet for chat bid sold items
  const [showSellerChatSheet, setShowSellerChatSheet] = useState(false);
  const [sellerChatOrder, setSellerChatOrder] = useState<{
    orderId: string;
    itemTitle: string;
    amount: number;
    buyerName: string;
    paymentReference?: string;
  } | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const insets = useSafeAreaInsets();
  const [soldSubTab, setSoldSubTab] = useState<'all' | 'auction' | 'chat' | 'buynow'>('all');
  const [soldSort, setSoldSort] = useState<'recent' | 'high' | 'low'>('recent');
  const [buyNowMode, setBuyNowMode] = useState<'shop' | 'live'>('shop');
  const [shopDetailItem, setShopDetailItem] = useState<AuctionDetail['shopItems'][0] | null>(null);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmojiItem[]>([]);
  const [showReactions, setShowReactions] = useState(false);
  const reactButtonRef = useRef<View>(null);
  const reactButtonBottomRef = useRef<number>(0);
  const currentItemStartedAtRef = useRef<number>(0);
  const liveItemFromApiRef = useRef<{ itemId: string; title: string; startedAt: number } | null>(null);
  const soldItemWinnersRef = useRef<Record<string, { userId: string; displayName: string; amount: number; mode: string }>>({});
  const pendingChatHistoryRef = useRef<Array<{ userId: string; displayName: string; message: string; timestamp: number }> | null>(null);
  const processChatHistoryRef = useRef<((messages: Array<{ userId: string; displayName: string; message: string; timestamp: number }>) => void) | null>(null);
  const lastAddedQueueItemRef = useRef<{ title: string; price: number } | null>(null);

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

  // ── Check profile completeness on mount (buyers only) ────────────
  useEffect(() => {
    if (isSeller) return;
    void apiClient.get('/users/me/profile-status').then(res => {
      const data = res.data.data as {
        isComplete: boolean;
        address?: { name: string; phone: string; line1: string; city: string; province: string; postalCode: string } | null;
        paymentMethods?: { gcash?: { number: string; name: string } | null; bank?: { name: string; accountNumber: string; accountName: string } | null };
      };
      setProfileComplete(data.isComplete);
      // Pre-fill form if partial data exists
      if (data.address) {
        setAddressForm({
          name: data.address.name ?? '',
          phone: data.address.phone ?? '',
          line1: data.address.line1 ?? '',
          city: data.address.city ?? '',
          province: data.address.province ?? '',
          postalCode: data.address.postalCode ?? '',
        });
      }
      if (data.paymentMethods?.gcash) {
        setPaymentForm(prev => ({
          ...prev,
          gcashNumber: data.paymentMethods!.gcash!.number ?? '',
          gcashName: data.paymentMethods!.gcash!.name ?? '',
        }));
      }
      if (data.paymentMethods?.bank) {
        setPaymentForm(prev => ({
          ...prev,
          bankName: data.paymentMethods!.bank!.name ?? '',
          bankAccountNumber: data.paymentMethods!.bank!.accountNumber ?? '',
          bankAccountName: data.paymentMethods!.bank!.accountName ?? '',
        }));
      }
    }).catch(() => setProfileComplete(false));
  }, [isSeller]);

  useEffect(() => {
    void auctionsApi.getById(id).then(async data => {
      auctionRef.current = data;
      setAuction(data);

      // Seed sold items from DB — captures mode for items sold before joining
      const soldFromDb = data.shopItems.filter(i => i.status === 'SOLD');
      if (soldFromDb.length > 0) {
        // Try to fetch current user's orders to mark wins as theirs
        let myItemIds: Record<string, { amount: number; userId: string; paymentDeadline?: string; orderId: string }> = {};
          try {
            const ordersRes = await apiClient.get('/orders/buying');
            const myOrders = ordersRes.data.data as Array<{ id: string; itemId: string; amount: number; buyerId: string; paymentDeadline?: string }>;
            myOrders.forEach(o => {
              myItemIds[o.itemId] = { amount: o.amount, userId: o.buyerId, paymentDeadline: o.paymentDeadline, orderId: o.id };
            });
          } catch {
            // ignore
          }

        setSoldItemWinners(prev => {
          const seeded = { ...prev };
          soldFromDb.forEach(item => {
            if (!seeded[item.id]) {
              const myOrder = myItemIds[item.id];
              seeded[item.id] = {
                userId: myOrder?.userId ?? '',
                displayName: myOrder ? (user?.displayName ?? 'You') : 'Unknown',
                amount: myOrder?.amount ?? item.price,
                mode: item.mode ?? 'auction',
                paymentDeadline: myOrder?.paymentDeadline,
                orderId: myOrder?.orderId,
              };
            }
          });
          return seeded;
        });
      }
      const liveItem = data.shopItems.find(i => i.status === 'LIVE');
      if (liveItem) {
        liveItemFromApiRef.current = {
          itemId: liveItem.id,
          title: liveItem.title,
          startedAt: liveItem.updatedAt ? new Date(liveItem.updatedAt).getTime() : 0,
        };
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
        // Late joiner — allow all history messages to be highlighted as bids
        currentItemStartedAtRef.current = 0;
        // Restore winner banner if bid state was pending
        if (pendingBidStateRef.current) {
          setWinnerBanner(`${pendingBidStateRef.current.bidderName} is winning!`);
        }
      }
      // Flush any chat history that arrived before getById resolved
      if (pendingChatHistoryRef.current) {
        const pending = pendingChatHistoryRef.current;
        pendingChatHistoryRef.current = null;
        processChatHistoryRef.current?.(pending);
      }
    });
  }, [id]);

  const [soldItemWinners, setSoldItemWinners] = useState<Record<string, {
    userId: string;
    displayName: string;
    amount: number;
    mode: 'auction' | 'chat' | 'buynow';
    paymentDeadline?: string;
    orderId?: string;
    orderStatus?: string;
    paymentReference?: string;
    paymentProofUrl?: string;
  }>>({});

  useEffect(() => {
    soldItemWinnersRef.current = soldItemWinners;
  }, [soldItemWinners]);

  const [shopNow, setShopNow] = useState(Date.now());
    useEffect(() => {
      const tick = setInterval(() => setShopNow(Date.now()), 1000);
      return () => clearInterval(tick);
    }, []);

    const formatShopCountdown = (deadline?: string): { label: string; urgent: boolean; expired: boolean } | null => {
      if (!deadline) return null;
      const diffMs = new Date(deadline).getTime() - shopNow;
      if (diffMs <= 0) return { label: 'EXPIRED', urgent: true, expired: true };
      const totalSec = Math.floor(diffMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return {
        label: `${min}:${sec.toString().padStart(2, '0')}`,
        urgent: totalSec <= 120,
        expired: false,
      };
    };

  const refreshOrderStatuses = useCallback(async () => {
    try {
      if (isSeller) {
        const res = await apiClient.get('/orders/selling');
        const orders = res.data.data as Array<{ id: string; itemId: string; status: string; auction?: { id: string } }>;
        const auctionOrders = orders.filter(o => o.auction?.id === id);
        setSoldItemWinners(prev => {
          const updated = { ...prev };
          auctionOrders.forEach(o => {
            if (updated[o.itemId]) {
              updated[o.itemId] = { ...updated[o.itemId], orderStatus: o.status, orderId: o.id };
            }
          });
          return updated;
        });
      } else {
        const res = await apiClient.get('/orders/buying');
        const orders = res.data.data as Array<{ id: string; itemId: string; status: string; paymentDeadline?: string; paymentReference?: string; paymentProofUrl?: string }>;
        setSoldItemWinners(prev => {
          const updated = { ...prev };
          orders.forEach(o => {
            if (updated[o.itemId]) {
              updated[o.itemId] = {
                ...updated[o.itemId],
                orderStatus: o.status,
                orderId: o.id,
                paymentDeadline: o.paymentDeadline,
                paymentReference: o.paymentReference,
                paymentProofUrl: o.paymentProofUrl,
              };
            }
          });
          return updated;
        });
      }
    } catch {
      // ignore — stale status is fine
    }
  }, [id, isSeller]);

  useEffect(() => {
    if (!showShop) return;
    void refreshOrderStatuses();
    const interval = setInterval(() => void refreshOrderStatuses(), 30000);
    return () => clearInterval(interval);
  }, [showShop, refreshOrderStatuses]);

  useEffect(() => {
    processChatHistoryRef.current = (messages) => {
      const mapped: ChatMsg[] = messages
        .filter(m =>
          !m.message.startsWith('__item_queued__:') &&
          !m.message.startsWith('__item_preparing__:') &&
          m.message !== '__item_preparing_cancelled__'
        )
        .map(m => ({
          id: `hist-${m.timestamp}-${m.userId}`,
          userId: m.userId,
          displayName: m.displayName,
          message: m.message,
          timestamp: m.timestamp,
        }));

      const liveItem = liveItemFromApiRef.current;
      if (liveItem) {
        const alreadyHasDivider = mapped.some(
          m => m.type === 'item-divider' && m.itemTitle === liveItem.title
        );
        if (!alreadyHasDivider) {
          const dividerTimestamp = liveItem.startedAt > 0 ? liveItem.startedAt : (
            messages.length > 0 ? Math.min(...messages.map(m => m.timestamp)) - 1 : Date.now()
          );
          mapped.unshift({
            id: `divider-late-${liveItem.itemId}`,
            userId: '__system__',
            displayName: '',
            message: '',
            timestamp: dividerTimestamp,
            type: 'item-divider',
            itemTitle: liveItem.title,
          });
          currentItemStartedAtRef.current = dividerTimestamp;
        } else {
          const existingDivider = mapped.find(
            m => m.type === 'item-divider' && m.itemTitle === liveItem.title
          );
          currentItemStartedAtRef.current = existingDivider?.timestamp ?? 0;
        }
      }

      mapped.sort((a, b) => a.timestamp - b.timestamp);

      const soldShopItems = auctionRef.current?.shopItems.filter(i => i.status === 'SOLD') ?? [];
      soldShopItems.forEach(soldItem => {
        const alreadyHasWinner = mapped.some(
          m => m.type === 'system_winner' && m.itemTitle === soldItem.title
        );
        if (!alreadyHasWinner && soldItem.updatedAt) {
          mapped.push({
            id: `winner-rejoin-${soldItem.id}`,
            userId: '__system__',
            displayName: '',
            message: soldItem.title,
            timestamp: new Date(soldItem.updatedAt).getTime(),
            type: 'system_winner',
            itemTitle: soldItem.title,
            winnerAmount: soldItemWinnersRef.current[soldItem.id]?.amount ?? soldItem.price,
          });
        }
      });

      mapped.sort((a, b) => a.timestamp - b.timestamp);

      const winnerMsgs = mapped.filter(m => m.type === 'system_winner');
      winnerMsgs.forEach((winnerMsg, idx) => {
        const itemTitle = winnerMsg.itemTitle;
        if (!itemTitle) return;
        const alreadyHas = mapped.some(
          m => m.type === 'item-divider' && m.itemTitle === itemTitle
        );
        if (alreadyHas) return;
        const prevWinnerTimestamp = idx === 0 ? 0 : winnerMsgs[idx - 1].timestamp;
        const firstMsgInCluster = mapped.find(
          m => m.timestamp > prevWinnerTimestamp &&
          m.timestamp < winnerMsg.timestamp &&
          m.type !== 'item-divider' &&
          m.type !== 'system_winner' &&
          m.type !== 'system_offer'
        );
        const dividerTimestamp = firstMsgInCluster
          ? firstMsgInCluster.timestamp - 1
          : winnerMsg.timestamp - 1;
        mapped.push({
          id: `divider-sold-${itemTitle}-${dividerTimestamp}`,
          userId: '__system__',
          displayName: '',
          message: '',
          timestamp: dividerTimestamp,
          type: 'item-divider',
          itemTitle,
        });
      });

      mapped.sort((a, b) => a.timestamp - b.timestamp);
      setChatMessages(mapped);
    };
  }); // no deps — always captures fresh refs

  const [saleToast, setSaleToast] = useState<{ winner: string; amount: number; title: string } | null>(null);

  const [timerPaused, setTimerPaused] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);

  const [itemMode, setItemMode] = useState<'auction' | 'chat'>('auction');
  const [declaringWinner, setDeclaringWinner] = useState<{
    userId: string;
    displayName: string;
    message: string;
  } | null>(null);
  const {
    placeBid, sendChat, endAuction, startItemTimer, notifyShopUpdated,
    pauseTimer, resumeTimer, cancelItemTimer, startChatBid, declareChatWinner,
    skipChatItem, startLiveBuyNow, claimBuyNow, pullBuyNow, sendReaction,
    inviteCoHost, acceptCoHostInvite, declineCoHostInvite, kickCoHost, leaveCoHost,
    requestRoster,
  } = useAuctionSocket({
    auctionId: id,
    userId: user?.id,
    displayName: user?.displayName,
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
      // Item being prepared — show in item bar for everyone (ID-based)
      if (data.message.startsWith('__item_preparing__:')) {
        const itemId = data.message.split(':')[1] ?? '';
        if (itemId) setPreparingItemId(itemId);
        return;
      }
      // Seller cancelled preparing — clear for everyone
      if (data.message === '__item_preparing_cancelled__') {
        setPreparingItemId(null);
        return;
      }
      // Parse item-queued announcements (ID-based)
      // Format: __item_queued__:<itemId>:<title>:<price>:<mode>
      if (data.message.startsWith('__item_queued__:')) {
        const parts = data.message.split(':');
        const itemId = parts[1] ?? '';
        const itemTitle = parts[2] ?? '';
        const itemPrice = parseInt(parts[3] ?? '0');
        const itemModeStr = parts[4] ?? 'auction';
        if (!itemId) return;
        // Clear any pinned failed item — new addition takes focus on all clients
        setPreparingItemId(null);
        const isCurrentUserSeller = auctionRef.current?.seller.id === user?.id || routeRole === 'broadcaster';
        if (isCurrentUserSeller) return; // Seller uses optimistic update
        if (!isCurrentUserSeller) {
          lastAddedQueueItemRef.current = { title: itemTitle, price: itemPrice };
        }
        setAuction(prev => {
          if (!prev) return prev;
          // Dedup by ID — onShopUpdated will reconcile if real fetch differs
          if (prev.shopItems.some(i => i.id === itemId)) return prev;
          return {
            ...prev,
            shopItems: [...prev.shopItems, {
              id: itemId,
              title: itemTitle,
              price: itemPrice,
              photos: [],
              type: itemModeStr === 'buynow' ? 'BUY_NOW' as const : 'AUCTION' as const,
              status: itemModeStr === 'buynow' ? 'AVAILABLE' as const : 'QUEUED' as const,
              queueOrder: Date.now(),
              minimumOffer: 0,
              mode: 'auction' as const,
              createdAt: new Date(data.timestamp).toISOString(),
            }],
          };
        });
        return;
      }
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
      setMyMaxBid(undefined);
      setMaxBidEnabled(false);
      setPreparingItemId(null);
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

        // ── Sync item status to LIVE so it disappears from shop drawer ──
      setAuction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          shopItems: prev.shopItems.map(i =>
            i.id === data.itemId ? { ...i, status: 'LIVE' as const } : i
          ),
        };
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

      // No winner — keep this item pinned in the item bar so seller can re-run it
      if (!winner) {
        setPreparingItemId(data.itemId);
      }

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
      if (!liveItemFromApiRef.current) {
        pendingChatHistoryRef.current = messages;
        return;
      }
      processChatHistoryRef.current?.(messages);
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
      // Sellers use optimistic updates — skip re-fetch
      const isCurrentUserSeller = auctionRef.current?.seller.id === user?.id || routeRole === 'broadcaster';
      if (isCurrentUserSeller) return;
      setTimeout(() => {
        void auctionsApi.getById(id).then(fresh => {
          setAuction(prev => {
            if (!prev) return fresh;
            // Preserve any items not yet in fresh data (broadcast-added but not yet returned by API)
            const freshIds = new Set(fresh.shopItems.map(i => i.id));
            const extras = prev.shopItems.filter(i => !freshIds.has(i.id));
            return {
              ...fresh,
              shopItems: [...fresh.shopItems, ...extras],
            };
          });
        });
      }, 800);
    }, [id, user?.id, routeRole]),

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
        // Clear live buy now item for all clients if it matches
        const liveItem = currentItemRef.current;
        if (liveItem?.mode === 'buynow' && liveItem.title === data.itemTitle) {
          setCurrentItem(null);
          setWinnerBanner(null);
          setSaleToast({ winner: data.buyerName ?? 'Buyer', amount: data.amount, title: data.itemTitle });
          setTimeout(() => setSaleToast(null), 4000);
        }
        // Inject accepted message for everyone
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
        // Refresh auction state so item shows as SOLD
        void auctionsApi.getById(id).then(setAuction);
        return;
      }
      if (!isSeller) {
        Alert.alert('❌ Offer Declined', `Your offer for ${data.itemTitle} was declined.`);
      }
    }, [isSeller, id]),

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

    onLiveBuyNowStarted: useCallback((data: { itemId: string; title: string; price: number; photos: { url: string }[] }) => {
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

    onReaction: useCallback((data: { emoji: string; userId: string }) => {
      setFloatingEmojis(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        emoji: data.emoji,
        x: Math.floor(Math.random() * 60) + 8,
      }]);
    }, []),

    // ── Co-host: target receives invite ─────────────────────────
    onCoHostInvited: useCallback((data: { auctionId: string; hostUserId: string; hostDisplayName: string }) => {
      setCoHostInvite(data);
    }, []),

    // ── Co-host: announced to entire room ───────────────────────
    onCoHostJoined: useCallback((data: { auctionId: string; userId: string; displayName: string }) => {
      setAuction(prev => prev ? {
        ...prev,
        coHostId: data.userId,
        coHost: { id: data.userId, displayName: data.displayName, avatarUrl: null },
      } : prev);
    }, []),

    // ── Co-host: left/kicked/auction-ended ──────────────────────
    onCoHostLeft: useCallback((data: { auctionId: string; userId: string; reason: string }) => {
      setAuction(prev => prev ? { ...prev, coHostId: null, coHost: null } : prev);
      if (data.userId === user?.id && data.reason === 'kicked') {
        Alert.alert('Removed', "You've been removed as co-host.");
      }
    }, [user?.id]),

    // ── Co-host: invite declined (notify host) ──────────────────
    onCoHostInviteDeclined: useCallback((data: { auctionId: string; declinedByUserId: string }) => {
      if (isHost) {
        Alert.alert('Invite declined', 'They declined the co-host invite.');
      }
    }, [isHost]),

    onRoster: useCallback((list: Array<{ userId: string; displayName: string; joinedAt: number }>) => {
      setViewerRoster(list);
    }, []),
    onRosterUpdated: useCallback(() => {
      if (!isHost) return;
      requestRosterRef.current?.(
        auctionRef.current?.seller.id ?? '',
        auctionRef.current?.coHostId ?? undefined,
      );
    }, [isHost]),

  });

  useEffect(() => {
    requestRosterRef.current = requestRoster;
  }, [requestRoster]);
    

  const handleAddItemLive = async (mode: 'queue' | 'now' | 'buynow') => {
    const price = parseInt(newItemPrice.replace(/[^0-9]/g, ''), 10);
    if (!newItemTitle.trim() || !price) return;

    const title = newItemTitle.trim();
    const itemPrice = price * 100;

    // Soft duplicate check — warn but allow
    const hasDup = auction?.shopItems.some(i =>
      i.title.trim().toLowerCase() === title.toLowerCase() &&
      (i.status === 'QUEUED' || i.status === 'AVAILABLE' || i.status === 'LIVE')
    );
    if (hasDup) {
      const proceed = await new Promise<boolean>(resolve => {
        Alert.alert(
          'Duplicate title',
          `You already have an item called "${title}" in this live. Add it anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Add Anyway', style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
      if (!proceed) return;
    }

    setAddingItem(true);
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
          createdAt: newItem.createdAt ?? new Date().toISOString(),
        };
        return { ...prev, shopItems: [...prev.shopItems, optimisticItem] };
      });

      notifyShopUpdated();

      // Clear any pinned failed item — new addition takes focus
      setPreparingItemId(null);

      // ── Announce new item to all viewers via chat (ID-based) ──────────────
      const modeLabel = mode === 'buynow' ? 'buynow' : 'auction';
      sendChat(
        `__item_queued__:${newItem.id}:${newItem.title}:${newItem.price}:${modeLabel}`,
        user?.id ?? '',
        user?.displayName ?? '',
      );

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
    onRoleChanged: useCallback((newRole: string) => {
      // When server promotes us to co-broadcaster, log it; UI updates via auction.coHostId
      console.log('[Co-host] HMS role changed to:', newRole);
    }, []),
  });

  const doEndLive = async (cancelUnpaid: boolean) => {
    setEndingLive(true);
    try {
      if (cancelUnpaid) {
        await apiClient.patch(`/orders/auction/${id}/bulk-cancel-unpaid`);
      }
      await auctionsApi.end(id);
      endAuction();
    } catch { /* ignore */ }
    await hms.leave();
    setEndingLive(false);
    setShowEndLiveModal(false);
    router.replace('/(main)');
  };

  const handleLeave = async () => {
    if (isSeller) {
      // Check for unpaid orders first
      try {
        const res = await apiClient.get(`/orders/auction/${id}/unpaid-summary`);
        const summary = res.data.data as {
          totalUnpaid: number;
          orders: Array<{ id: string; itemTitle: string; buyerName: string; amount: number; paymentDeadline: string | null }>;
        };
        if (summary.totalUnpaid > 0) {
          setEndLiveUnpaid(summary.orders);
          setShowEndLiveModal(true);
          return;
        }
      } catch { /* ignore — fall through to simple confirm */ }

      // No unpaid orders — simple confirm
      Alert.alert(
        'End Live?',
        'Are you sure you want to end your live auction?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Live',
            style: 'destructive',
            onPress: () => void doEndLive(false),
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
      if (wasJoinedRef.current) {
        // Rejoin — refresh auction state and re-populate liveItemFromApiRef
        void auctionsApi.getById(id).then(data => {
          auctionRef.current = data;
          setAuction(data);
          const liveItem = data.shopItems.find(i => i.status === 'LIVE');
          if (liveItem) {
            liveItemFromApiRef.current = {
              itemId: liveItem.id,
              title: liveItem.title,
              startedAt: liveItem.updatedAt ? new Date(liveItem.updatedAt).getTime() : 0,
            };
          }
        });
      }
      wasJoinedRef.current = true;
      setViewerConnecting(false);
    } else if (wasJoinedRef.current) {
      setViewerConnecting(true);
    }
  }, [hms.isJoined, isSeller, id]);

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

  const biddingItems = (auction?.shopItems ?? [])
    .filter(i => i.status === 'QUEUED' && i.type !== 'BUY_NOW')
    .slice()
    .sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0));

  const filteredRoster = viewerRoster.filter(v =>
    v.displayName.toLowerCase().includes(rosterSearch.toLowerCase()),
  );

  const queuedItems = (auction?.shopItems ?? [])
    .filter(i => i.status === 'QUEUED' && i.type !== 'BUY_NOW')
    .slice()
    .sort((a, b) => {
      const getTime = (item: typeof a) => {
        if (item.id.startsWith('synthetic-')) {
          return parseInt(item.id.replace('synthetic-', ''), 10) || 0;
        }
        // Prefer updatedAt — an item that just ran and got reset to QUEUED
        // will have a newer updatedAt than freshly added items
        const updated = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
        const created = new Date(item.createdAt ?? 0).getTime();
        return Math.max(updated, created);
      };
      return getTime(b) - getTime(a);
    });

  const nextQueuedItem = !currentItem ? (() => {
    if (preparingItemId) {
      const prep = queuedItems.find(i => i.id === preparingItemId);
      if (prep) return prep;
    }
    return queuedItems[0] ?? null;
  })() : null;
  const stableNextItem = nextQueuedItem;
  const buyNowItems = auction?.shopItems.filter(i => i.type === 'BUY_NOW' && i.status === 'AVAILABLE') ?? [];
  const soldItems = auction?.shopItems.filter(i => i.status === 'SOLD') ?? [];
  

  const sellerTrackId = hms.localPeer?.videoTrackId ?? null;

  // ── Resolve host + co-host tracks by identity, independent of layout ──
  const getRoleTracks = () => {
    const hostName = auction?.seller.displayName;
    const coHostName = auction?.coHost?.displayName;

    const hostTrack = isHost
      ? hms.localPeer?.videoTrackId ?? null
      : (() => {
          const p = hms.peers.find((peer) => !peer.isLocal && hostName && peer.name === hostName);
          return p ? hms.trackMap[p.id] ?? null : null;
        })();

    const coHostTrack = isCoHost
      ? hms.localPeer?.videoTrackId ?? null
      : (() => {
          const p = hms.peers.find((peer) => !peer.isLocal && coHostName && peer.name === coHostName);
          return p ? hms.trackMap[p.id] ?? null : null;
        })();

    return {
      hostTrack,
      coHostTrack,
      hostMirror: isHost,
      coHostMirror: isCoHost,
      hostLabel: isHost ? 'You' : (hostName ?? 'Host'),
      coHostLabel: isCoHost ? 'You' : (coHostName ?? 'Co-host'),
    };
  };

  const VideoTile = ({
    trackId, mirror, label, style,
  }: { trackId: string | null; mirror: boolean; label?: string; style?: any }) => {
    if (!trackId) {
      return (
        <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }, style]}>
          <ActivityIndicator size="small" color="#6B7280" />
          {label && (
            <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 6 }}>{label}</Text>
          )}
        </View>
      );
    }
    return (
      <View style={[{ overflow: 'hidden' }, style]}>
        <HMSVideoView
          hmsInstance={hms.hmsInstance}
          trackId={trackId}
          mirror={mirror}
          style={{ flex: 1 }}
        />
        {label && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            paddingHorizontal: 8, paddingVertical: 4,
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderVideoBackground = () => {
    if (isHost && (!hms.isJoined || !hms.hmsInstance)) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
          <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 12 }}>Starting camera...</Text>
        </View>
      );
    }
    if (!isHost && !hms.isJoined) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#1A56DB" />
          <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 12 }}>Connecting to stream...</Text>
        </View>
      );
    }

    const { hostTrack, coHostTrack, hostMirror, coHostMirror, hostLabel, coHostLabel } = getRoleTracks();

    // No co-host → single fullscreen of the host
    if (!hasCoHost) {
      if (!hostTrack) {
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 64 }}>📺</Text>
            <Text style={{ color: '#4B5563', fontSize: 14, marginTop: 8 }}>Watching live</Text>
          </View>
        );
      }
      return (
        <HMSVideoView
          hmsInstance={hms.hmsInstance}
          trackId={hostTrack}
          mirror={hostMirror}
          style={{ flex: 1 }}
        />
      );
    }

    // ── With co-host: render per layout ──
    if (videoLayout === 'split-host-top' || videoLayout === 'split-cohost-top') {
      const topIsHost = videoLayout === 'split-host-top';
      return (
        <View style={{ flex: 1, flexDirection: 'column' }}>
          <VideoTile
            trackId={topIsHost ? hostTrack : coHostTrack}
            mirror={topIsHost ? hostMirror : coHostMirror}
            label={topIsHost ? hostLabel : coHostLabel}
            style={{ flex: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
          />
          <VideoTile
            trackId={topIsHost ? coHostTrack : hostTrack}
            mirror={topIsHost ? coHostMirror : hostMirror}
            label={topIsHost ? coHostLabel : hostLabel}
            style={{ flex: 1 }}
          />
        </View>
      );
    }

    // PiP modes
    const primaryIsHost = videoLayout === 'pip-host';
    const primaryTrack = primaryIsHost ? hostTrack : coHostTrack;
    const primaryMirror = primaryIsHost ? hostMirror : coHostMirror;
    const pipTrack = primaryIsHost ? coHostTrack : hostTrack;
    const pipMirror = primaryIsHost ? coHostMirror : hostMirror;
    const pipLabel = primaryIsHost ? coHostLabel : hostLabel;

    return (
      <View style={{ flex: 1 }}>
        {primaryTrack ? (
          <HMSVideoView
            hmsInstance={hms.hmsInstance}
            trackId={primaryTrack}
            mirror={primaryMirror}
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 64 }}>📺</Text>
          </View>
        )}
        {/* PiP — tap to swap who's primary */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setVideoLayout(primaryIsHost ? 'pip-cohost' : 'pip-host')}
          style={{
            position: 'absolute',
            top: insets.top + 70,
            right: 14,
            width: 100, height: 140,
            borderRadius: 14,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.4)',
            backgroundColor: '#000',
            shadowColor: '#000', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
          }}
        >
          <VideoTile
            trackId={pipTrack}
            mirror={pipMirror}
            label={pipLabel}
            style={{ flex: 1 }}
          />
        </TouchableOpacity>
      </View>
    );
  };
  

  // ── Responsive layout calculations ─────────────────────────────── ← ADD HERE
  const BOTTOM_PADDING = keyboardHeight > 0 ? 12 : insets.bottom + 8;
  const CHAT_ROW_HEIGHT = 60;
  const SELLER_BUTTON_HEIGHT = (() => {
    if (!isSeller) return 0;
    const extraHeight = currentItem?.mode === 'chat' || currentItem?.mode === 'buynow' ? 52 : 0;
    const gapHeight = currentItem?.mode === 'chat' || currentItem?.mode === 'buynow' ? 8 : 0;
    return extraHeight + gapHeight + 48;
  })();
  const BUYER_BUTTON_HEIGHT = (() => {
    if (isSeller) return 0;
    if (!currentItem) return 56;
    if (currentItem.mode === 'chat') return 64;
    return 56;
  })();
  const ACTION_HEIGHT = isSeller ? SELLER_BUTTON_HEIGHT : BUYER_BUTTON_HEIGHT;
  const BOTTOM_BAR_HEIGHT = BOTTOM_PADDING + 12 + CHAT_ROW_HEIGHT + 8 + ACTION_HEIGHT;
  const ITEM_BAR_HEIGHT = (currentItem || stableNextItem) ? 78 : 0;
  const ITEM_BAR_BOTTOM = BOTTOM_BAR_HEIGHT + 8;
  const CONTROLS_BOTTOM = ITEM_BAR_BOTTOM + ITEM_BAR_HEIGHT + 8;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>

      {/* ── Full Screen Video Background ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#111827' }}>
        {renderVideoBackground()}
      </View>

      {/* ── Bottom Gradient Scrim ── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.4, 1]}
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: SCREEN_HEIGHT * 0.55,
          pointerEvents: 'none',
        }}
      />

      {/* ── Top Bar: seller info + close ── */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: insets.top + 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        {/* Left: avatar + LIVE + viewers */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flexWrap: 'nowrap', flex: 1 }}>
          {/* Combined seller + co-host pill */}
          {/* Left: host card + LIVE */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flexWrap: 'nowrap', flex: 1 }}>
            {/* Host card — avatar + stacked name/viewers, tap → host sheet */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                setHostSheetOpen(true);
                if (isHost && auction?.seller.id) {
                  requestRoster(auction.seller.id, auction?.coHostId ?? undefined);
                }
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: 'rgba(0,0,0,0.45)',
                borderRadius: 999,
                paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
                maxWidth: SCREEN_WIDTH * 0.5,
              }}
            >
              {/* Avatar (stacked if co-host) */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: '#1A56DB',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: '#000',
                  zIndex: 2,
                }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                    {auction?.seller.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                {hasCoHost && auction?.coHost && (
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: '#7C3AED',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: '#000',
                    marginLeft: -12,
                    zIndex: 1,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                      {auction.coHost.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              {/* Stacked name + viewers */}
              <View style={{ flexShrink: 1 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                  {hasCoHost && auction?.coHost
                    ? `${auction.seller.displayName} & ${auction.coHost.displayName}`
                    : auction?.seller.displayName}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Follow — viewers only */}
            {!isSeller && auction && (
              <FollowSellerButton
                sellerId={auction.seller.id}
                userId={user?.id}
              />
            )}

            {/* LIVE badge */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: '#DC2626', borderRadius: 999,
              paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>LIVE</Text>
            </View>
          </View>
        </View>

        {/* Right: close only — controls moved to right side panel */}
        <TouchableOpacity
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
            borderRadius: 999,
            width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
          }}
          onPress={() => void handleLeave()}
        >
          <Icon symbol="xmark" fallback="✕" size={14} tint="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Right Side Seller Controls ── */}
      {isSeller && hms.isJoined && keyboardHeight === 0 && (
        <View style={{
          position: 'absolute',
          right: 12,
          bottom: CONTROLS_BOTTOM,
          alignItems: 'center',
          gap: 14,
        }}>
          {/* Mute */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => void hms.toggleMute()}
            activeOpacity={0.7}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: hms.isMuted ? 'rgba(220,38,38,0.85)' : 'rgba(255,255,255,0.18)',
              borderWidth: 1,
              borderColor: hms.isMuted ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon
                symbol={hms.isMuted ? 'mic.slash.fill' : 'mic.fill'}
                fallback={hms.isMuted ? '🔇' : '🎙️'}
                size={18}
              />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>
              {hms.isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {/* Camera */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => void hms.toggleCamera()}
            activeOpacity={0.7}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: hms.isCameraOff ? 'rgba(220,38,38,0.85)' : 'rgba(255,255,255,0.18)',
              borderWidth: 1,
              borderColor: hms.isCameraOff ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon
                symbol={hms.isCameraOff ? 'video.slash.fill' : 'video.fill'}
                fallback={hms.isCameraOff ? '📵' : '📹'}
                size={18}
              />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>
              {hms.isCameraOff ? 'Start' : 'Stop'}
            </Text>
          </TouchableOpacity>

          {/* Flip */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => void hms.switchCamera()}
            activeOpacity={0.7}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon symbol="arrow.triangle.2.circlepath.camera.fill" fallback="🔄" size={18} />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>Flip</Text>
          </TouchableOpacity>

          {/* Reactions */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            activeOpacity={0.7}
            onPress={() => {
              reactButtonRef.current?.measureInWindow((_x, y, _w, h) => {
                const screenH = Dimensions.get('window').height;
                const buttonCenterFromBottom = screenH - (y + h / 2);
                reactButtonBottomRef.current = buttonCenterFromBottom - 21;
                setShowReactions(prev => !prev);
              });
            }}
          >
            <View
              ref={reactButtonRef}
              style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: showReactions ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon
                symbol={showReactions ? 'xmark' : 'face.smiling.fill'}
                fallback={showReactions ? '✕' : '😊'}
                size={18}
              />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>React</Text>
          </TouchableOpacity>

          {/* Layout — only when co-host present */}
          {hasCoHost && (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 4 }}
              activeOpacity={0.7}
              onPress={() => {
                setVideoLayout((curr) => {
                  if (curr === 'pip-host') return 'pip-cohost';
                  if (curr === 'pip-cohost') return 'split-host-top';
                  if (curr === 'split-host-top') return 'split-cohost-top';
                  return 'pip-host';
                });
              }}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon symbol="rectangle.on.rectangle" fallback="▣" size={18} />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>Layout</Text>
            </TouchableOpacity>
          )}

          {/* Shop */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => setShowShop(true)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon symbol="bag.fill" fallback="🛍️" size={18} />
              {pendingOffers.length > 0 && (
                <View style={{
                  position: 'absolute', top: -3, right: -3,
                  backgroundColor: '#DC2626', borderRadius: 999,
                  minWidth: 16, height: 16, paddingHorizontal: 3,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: '#000',
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    {pendingOffers.length}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>Shop</Text>
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
          gap: 14,
        }}>
          {/* Reactions */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            activeOpacity={0.7}
            onPress={() => {
              reactButtonRef.current?.measureInWindow((_x, y, _w, h) => {
                const screenH = Dimensions.get('window').height;
                const buttonCenterFromBottom = screenH - (y + h / 2);
                reactButtonBottomRef.current = buttonCenterFromBottom - 21;
                setShowReactions(prev => !prev);
              });
            }}
          >
            <View
              ref={reactButtonRef}
              style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: showReactions ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon
                symbol={showReactions ? 'xmark' : 'face.smiling.fill'}
                fallback={showReactions ? '✕' : '😊'}
                size={18}
              />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>React</Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={{ alignItems: 'center', gap: 4 }} activeOpacity={0.7}>
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon symbol="square.and.arrow.up" fallback="↑" size={18} />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>Share</Text>
          </TouchableOpacity>

          {/* Layout — only when co-host present */}
          {hasCoHost && (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 4 }}
              activeOpacity={0.7}
              onPress={() => {
                setVideoLayout((curr) => {
                  if (curr === 'pip-host') return 'pip-cohost';
                  if (curr === 'pip-cohost') return 'split-host-top';
                  if (curr === 'split-host-top') return 'split-cohost-top';
                  return 'pip-host';
                });
              }}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon symbol="rectangle.on.rectangle" fallback="▣" size={18} tint="#fff" />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>Layout</Text>
            </TouchableOpacity>
          )}

          {/* Shop */}
          <TouchableOpacity
            style={{ alignItems: 'center', gap: 4 }}
            onPress={() => setShowShop(true)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.18)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon symbol="bag.fill" fallback="🛍️" size={18} />
              {biddingItems.length > 0 && (
                <View style={{
                  position: 'absolute', top: -3, right: -3,
                  backgroundColor: '#DC2626', borderRadius: 999,
                  minWidth: 16, height: 16, paddingHorizontal: 3,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: '#000',
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    {biddingItems.length}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' }}>Shop</Text>
          </TouchableOpacity>

          {/* Leave Co-host — only when local user is the co-host */}
          {isCoHost && (
            <TouchableOpacity
              style={{ alignItems: 'center', gap: 4 }}
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert(
                  'Leave co-host?',
                  'You will be returned to viewer mode.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Leave',
                      style: 'destructive',
                      onPress: () => user?.id && leaveCoHost(user.id),
                    },
                  ],
                );
              }}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: 'rgba(220,38,38,0.85)',
                borderWidth: 1, borderColor: 'rgba(220,38,38,1)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon symbol="xmark.circle.fill" fallback="✕" size={18} tint="#fff" />
              </View>
              <Text style={{ color: '#FCA5A5', fontSize: 10, fontWeight: '700' }}>Leave</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Chat Messages ── */}
      <View style={{
        position: 'absolute',
        left: 0,
        right: 60,
        bottom: BOTTOM_BAR_HEIGHT + ITEM_BAR_HEIGHT + (currentItem ? 16 : 8) + keyboardHeight,
        height: 200,
      }}>
        <FlatList
          ref={chatRef}
          data={(() => {
            const real = chatMessages
              .filter(m => m.type !== 'item-divider' && m.type !== 'system_winner' && m.type !== 'system_offer' && m.type !== 'system_item_queued')
              .slice(-20);
            const realIds = new Set(real.map(m => m.id));
            return chatMessages.filter(
              m => m.type === 'item-divider' || m.type === 'system_winner' || m.type === 'system_offer' || m.type === 'system_item_queued' || realIds.has(m.id)
            );
          })()}
          keyExtractor={item => item.id}
          style={{ paddingHorizontal: 16 }}
          contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
          
          renderItem={({ item }) => {
            if (item.type === 'system_item_queued') {
              return null;
            }
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon symbol="shippingbox.fill" fallback="📦" size={11} tint="#6B7280" />
                      <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '600' }}>
                        {item.itemTitle}
                      </Text>
                    </View>
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
                <Icon symbol="trophy.fill" fallback="🏆" size={22} tint="#F59E0B" />
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

            const isCurrentItemMsg = item.timestamp >= currentItemStartedAtRef.current;
            const isBidMsg = currentItem?.mode === 'chat' && isCurrentItemMsg && /^\s*[\d,]+\s*$/.test(item.message);
            const parsedBidAmount = isBidMsg ? parseInt(item.message.replace(/,/g, '')) * 100 : 0;
            const isBidTooLow = isBidMsg && parsedBidAmount < (currentItem?.currentPrice ?? 0);
            const isOwnMessage = item.userId === user?.id;
            const initials = item.displayName ? item.displayName.charAt(0).toUpperCase() : '?';

            return (
              <View style={{
                marginBottom: 6,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 7,
              }}>
                {/* Avatar */}
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: isOwnMessage ? '#1A56DB' : '#374151',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {initials}
                  </Text>
                </View>

                {/* Name + message */}
                <View style={{ flexShrink: 1, maxWidth: isSeller ? '72%' : '82%' }}>
                  <TouchableOpacity
                    disabled={!isHost || !item.userId || item.userId === '__system__' || item.userId === user?.id || hasCoHost}
                    onPress={() => setChatActionSheet({ userId: item.userId, displayName: item.displayName })}
                    activeOpacity={isHost && !hasCoHost && item.userId !== user?.id && item.userId !== '__system__' ? 0.6 : 1}
                  >
                    <Text style={{
                      color: isOwnMessage ? '#60A5FA' : 'rgba(255,255,255,0.55)',
                      fontSize: 10,
                      fontWeight: '700',
                      marginBottom: 2,
                      letterSpacing: 0.1,
                    }}>
                      {item.displayName}
                      {isHost && !hasCoHost && item.userId !== user?.id && item.userId !== '__system__' && (
                        <Text style={{ color: 'rgba(124,58,237,0.7)', fontSize: 9 }}> • tap</Text>
                      )}
                    </Text>
                  </TouchableOpacity>
                  <View style={{
                    ...(isBidMsg ? {
                      backgroundColor: isBidTooLow ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.08)',
                      borderLeftWidth: 3,
                      borderLeftColor: isBidTooLow ? '#DC2626' : '#F59E0B',
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    } : {}),
                  }}>
                    <Text style={{
                      color: isBidMsg
                        ? (isBidTooLow ? '#FCA5A5' : '#FCD34D')
                        : 'rgba(255,255,255,0.92)',
                      fontSize: isBidMsg ? 15 : 13,
                      fontWeight: isBidMsg ? '800' : '400',
                      lineHeight: 18,
                      textShadowColor: isBidMsg ? 'transparent' : 'rgba(0,0,0,0.85)',
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}>
                      {isBidMsg
                        ? `₱${parseInt(item.message.replace(/,/g, '')).toLocaleString()}`
                        : item.message}
                    </Text>
                  </View>
                </View>

                {/* Crown button — seller only */}
                {isSeller && currentItem?.mode === 'chat' && isBidMsg && !isBidTooLow && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(245,158,11,0.15)',
                      borderWidth: 1,
                      borderColor: 'rgba(245,158,11,0.35)',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    onPress={() => setDeclaringWinner({
                      userId: item.userId,
                      displayName: item.displayName,
                      message: item.message,
                    })}
                    activeOpacity={0.7}
                  >
                    <Icon symbol="crown.fill" fallback="👑" size={14} tint="#F59E0B" />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      </View>


      {/* ── Current Item Bar — Premium frosted card ── */}
      {(currentItem || stableNextItem) && (
        <View style={{
          position: 'absolute',
          left: 12, right: 12,
          bottom: ITEM_BAR_BOTTOM,
          borderRadius: 16,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
        }}>
          <BlurView
            intensity={45}
            tint="dark"
            style={{
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: stableNextItem && !currentItem
                ? 'rgba(17,24,39,0.35)'
                : 'rgba(17,24,39,0.55)',
              borderWidth: 1,
              borderColor: stableNextItem && !currentItem
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(255,255,255,0.08)',
              borderRadius: 16,
            }}
          >
            {/* Thumbnail */}
            {(currentItem ?? stableNextItem)?.photos[0]?.url ? (
              <Image
                source={{ uri: (currentItem ?? stableNextItem)!.photos[0].url }}
                style={{
                  width: 48, height: 48, borderRadius: 10,
                  marginRight: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
                resizeMode="cover"
              />
            ) : (
              <View style={{
                width: 48, height: 48, borderRadius: 10,
                marginRight: 12,
                backgroundColor: 'rgba(255,255,255,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon symbol="shippingbox.fill" fallback="📦" size={22} tint="rgba(255,255,255,0.5)" />
              </View>
            )}

            {/* Title + status */}
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text
                style={{ color: stableNextItem && !currentItem ? 'rgba(255,255,255,0.5)' : '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.1 }}
                numberOfLines={1}
              >
                {currentItem?.title ?? stableNextItem?.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 5 }}>
                {stableNextItem && !currentItem ? (
                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '500' }}>
                    ⏳ Up next — not started yet
                  </Text>
                ) : winnerBanner ? (
                  <>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#10B981' }} />
                    <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
                      {winnerBanner}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500' }} numberOfLines={1}>
                    {currentItem?.totalBids ?? 0} bid{(currentItem?.totalBids ?? 0) !== 1 ? 's' : ''}
                    {currentItem?.highestBidderName ? ` · ${currentItem.highestBidderName}` : ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Price + timer column */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{
                color: stableNextItem && !currentItem ? 'rgba(255,255,255,0.4)' : '#fff',
                fontSize: 22,
                fontWeight: '800',
                letterSpacing: -0.6,
                fontVariant: ['tabular-nums'],
                lineHeight: 24,
              }}>
                {formatPHP(currentItem?.currentPrice ?? stableNextItem?.price ?? 0)}
              </Text>
              {timerRemaining !== null && (
                <View style={{
                  marginTop: 4,
                  backgroundColor: timerPaused
                    ? 'rgba(107,114,128,0.85)'
                    : timerRemaining <= counterbidSeconds
                      ? '#DC2626'
                      : '#1A56DB',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  minWidth: 46,
                  alignItems: 'center',
                  shadowColor: timerRemaining <= counterbidSeconds ? '#DC2626' : '#1A56DB',
                  shadowOpacity: 0.5,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                }}>
                  <Text style={{
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: 12,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: 0.3,
                  }}>
                    {timerPaused ? 'PAUSED' : `${timerRemaining}s`}
                  </Text>
                </View>
              )}
            </View>
          </BlurView>
        </View>
      )}

      {/* ── Bottom Controls — no panel, sits in gradient scrim ── */}
      <View style={{
        position: 'absolute', bottom: keyboardHeight, left: 0, right: 0,
        backgroundColor: 'transparent',
        paddingBottom: BOTTOM_PADDING, paddingTop: 12,
      }}>
        {/* Chat input row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 16 }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
              borderRadius: 22,
              paddingHorizontal: 16, paddingVertical: 11,
              color: '#fff', fontSize: 13,
            }}
            placeholder="Say something..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
            onFocus={() => setShowReactions(false)}
          />
          <TouchableOpacity
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: chatInput.trim() ? '#1A56DB' : 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                borderColor: chatInput.trim() ? '#1A56DB' : 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}
              onPress={handleSendChat}
            >
              <Icon symbol="arrow.up" fallback="↑" size={16} tint="#fff" />
            </TouchableOpacity>
        </View>

        {/* Buyer bid actions */}
        {!isSeller && !isCoHost && (
          <View style={{ paddingHorizontal: 16 }}>
            {currentItem ? (
              currentItem.mode === 'buynow' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 10, paddingHorizontal: 16,
                      alignItems: 'center', justifyContent: 'center', height: 56,
                    }}
                    onPress={() => {
                      const liveItem = currentItemRef.current;
                      if (!liveItem) return;
                      setSelectedBuyNowItem({ id: liveItem.itemId, title: liveItem.title, price: liveItem.currentPrice, minimumOffer: 0 });
                      setLiveOfferPercent(-20);
                      setLiveCustomOffer('');
                      setShowLiveOfferModal(true);
                    }}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>Offer</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <SwipeBidButton
                      label={`Buy Now — ${formatPHP(currentItem.currentPrice)}`}
                      sublabel="Swipe to buy · first come"
                      color="#10B981"
                      onBid={() => {
                        if (claimingBuyNow) return;
                        setClaimingBuyNow(true);
                        claimBuyNow(currentItem.itemId, user?.id ?? '', user?.displayName ?? 'Buyer');
                      }}
                    />
                  </View>
                </View>
              ) : currentItem.mode === 'chat' ? (
                <View style={{
                  backgroundColor: 'rgba(124,58,237,0.1)',
                  borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)',
                  borderRadius: 10, paddingVertical: 14, alignItems: 'center',
                }}>
                  <Text style={{ color: '#A78BFA', fontWeight: '700', fontSize: 14 }}>
                    Type your bid in chat
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 3 }}>
                    {currentItem.currentPrice > 0
                      ? `Starting at ${formatPHP(currentItem.currentPrice)}`
                      : 'Highest bid when seller closes wins'}
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 10, paddingHorizontal: 16,
                      alignItems: 'center', justifyContent: 'center', height: 56,
                      opacity: broadcasterReconnecting ? 0.4 : 1,
                    }}
                    onPress={() => {
                      if (broadcasterReconnecting) return;
                      setCustomBidInput('');
                      setShowCustomBid(true);
                    }}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>Custom</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <SwipeBidButton
                      label={currentItem.totalBids === 0
                        ? `Bid ${formatPHP(currentItem.currentPrice)}`
                        : `Bid ${formatPHP(currentItem.currentPrice + getBidIncrement(currentItem.currentPrice))}`
                      }
                      sublabel={currentItem.totalBids === 0
                        ? `Opening bid`
                        : `Current: ${formatPHP(currentItem.currentPrice)}`
                      }
                      onBid={() => {
                        if (broadcasterReconnecting) return;
                        if (!profileComplete) {
                          setProfileStep('address');
                          setShowProfileGate(true);
                          return;
                        }
                        const latest = currentItemRef.current;
                        if (!latest) return;
                        const bidAmount = latest.totalBids === 0
                          ? latest.currentPrice
                          : latest.currentPrice + getBidIncrement(latest.currentPrice);
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
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                borderRadius: 10, height: 56,
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}>
                <Text style={{ color: 'rgba(255,255,255,0.2)', fontWeight: '500', fontSize: 13 }}>
                  {stableNextItem
                    ? `⏳ ${stableNextItem.title} — not started yet`
                    : 'Waiting for next item'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Seller actions */}
        {isSeller && (
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {currentItem?.mode === 'buynow' && (
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(16,185,129,0.1)',
                  borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
                  borderRadius: 10, paddingVertical: 11, alignItems: 'center',
                }}
                onPress={() => {
                  Alert.alert('Pull Back to Shop?', `Remove "${currentItem.title}" from live and put it back in the Buy Now tab.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Pull Back', onPress: () => { if (!user?.id) return; pullBuyNow(currentItem.itemId, user.id); } },
                  ]);
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#10B981', fontWeight: '600', fontSize: 13 }}>Pull Back to Shop</Text>
              </TouchableOpacity>
            )}
            {currentItem?.mode === 'chat' && (
              <TouchableOpacity
                style={{
                  backgroundColor: skipping ? 'rgba(107,114,128,0.1)' : 'rgba(245,158,11,0.1)',
                  borderWidth: 1, borderColor: skipping ? 'rgba(107,114,128,0.25)' : 'rgba(245,158,11,0.25)',
                  borderRadius: 10, paddingVertical: 11, alignItems: 'center',
                  opacity: skipping ? 0.6 : 1,
                }}
                disabled={skipping}
                onPress={() => {
                  Alert.alert('Skip Item?', `No sale for "${currentItem.title}"? It will go back to the queue.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Skip Item', style: 'destructive', onPress: () => {
                      if (!currentItem || !user?.id) return;
                      setSkipping(true);
                      skipChatItem(currentItem.itemId, user.id);
                      setTimeout(() => setSkipping(false), 3000);
                    }},
                  ]);
                }}
                activeOpacity={0.85}
              >
                {skipping
                  ? <ActivityIndicator color="#F59E0B" size="small" />
                  : <Text style={{ color: '#F59E0B', fontWeight: '600', fontSize: 13 }}>Skip Item — No Sale</Text>
                }
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{
                backgroundColor: 'rgba(220,38,38,0.1)',
                borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)',
                borderRadius: 10, paddingVertical: 12, alignItems: 'center',
              }}
              onPress={() => void handleLeave()}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#F87171', fontWeight: '600', fontSize: 14 }}>End Live</Text>
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
                    <Icon
                      symbol={
                        tab.key === 'bidding' ? 'hammer.fill' :
                        tab.key === 'buynow' ? 'tag.fill' :
                        tab.key === 'sold' ? 'checkmark.seal.fill' :
                        'banknote.fill'
                      }
                      fallback={tab.icon}
                      size={20}
                      tint={active ? '#fff' : '#6B7280'}
                    />
                    <Text style={{
                      fontSize: 10, fontWeight: '700',
                      color: active ? '#fff' : '#6B7280',
                      marginTop: 4,
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
              ) : (
                <>
                  {/* Selection hint */}
                  {isSeller && selectedQueueId && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: 'rgba(26,86,219,0.15)',
                      borderWidth: 1, borderColor: 'rgba(26,86,219,0.4)',
                      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                      marginBottom: 12,
                    }}>
                      <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '600' }}>
                        Tap another item to swap positions
                      </Text>
                      <TouchableOpacity onPress={() => setSelectedQueueId(null)}>
                        <Text style={{ color: '#6B7280', fontSize: 12 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Long press hint — shown when nothing selected */}
                  {isSeller && !selectedQueueId && biddingItems.length > 1 && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      marginBottom: 12, paddingHorizontal: 4,
                    }}>
                      <Icon symbol="hand.draw.fill" fallback="👆" size={13} tint="#4B5563" />
                      <Text style={{ color: '#4B5563', fontSize: 11 }}>
                        Long press an item to swap its position in the queue
                      </Text>
                    </View>
                  )}

                  {biddingItems.map((item, index) => {
                    const isSelected = selectedQueueId === item.id;
                    const isSwapTarget = isSeller && selectedQueueId && selectedQueueId !== item.id;

                    return (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        {/* Up/Down arrows — hidden when something is selected */}
                        {isSeller && !selectedQueueId && (
                          <View style={{ gap: 4 }}>
                            <TouchableOpacity
                              disabled={index === 0}
                              style={{ opacity: index === 0 ? 0.2 : 1, padding: 4 }}
                              onPress={async () => {
                                const reordered = [...biddingItems];
                                [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                                setAuction(prev => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    shopItems: prev.shopItems.map(i => {
                                      const idx = reordered.findIndex(r => r.id === i.id);
                                      return idx !== -1 ? { ...i, queueOrder: idx } : i;
                                    }),
                                  };
                                });
                                try {
                                  await apiClient.patch('/shop-items/queue/reorder', { itemIds: reordered.map(i => i.id) });
                                  notifyShopUpdated();
                                } catch {
                                  Alert.alert('Error', 'Failed to save order.');
                                }
                              }}
                            >
                              <Text style={{ color: '#6B7280', fontSize: 18 }}>▲</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={index === biddingItems.length - 1}
                              style={{ opacity: index === biddingItems.length - 1 ? 0.2 : 1, padding: 4 }}
                              onPress={async () => {
                                const reordered = [...biddingItems];
                                [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
                                setAuction(prev => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    shopItems: prev.shopItems.map(i => {
                                      const idx = reordered.findIndex(r => r.id === i.id);
                                      return idx !== -1 ? { ...i, queueOrder: idx } : i;
                                    }),
                                  };
                                });
                                try {
                                  await apiClient.patch('/shop-items/queue/reorder', { itemIds: reordered.map(i => i.id) });
                                  notifyShopUpdated();
                                } catch {
                                  Alert.alert('Error', 'Failed to save order.');
                                }
                              }}
                            >
                              <Text style={{ color: '#6B7280', fontSize: 18 }}>▼</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={async () => {
                            if (!isSeller) {
                              setShowShop(false);
                              setTimeout(() => setShopDetailItem(item), 50);
                              return;
                            }

                            // Seller — swap mode
                            if (selectedQueueId) {
                              if (selectedQueueId === item.id) {
                                // Deselect
                                setSelectedQueueId(null);
                                return;
                              }
                              // Swap the two items
                              const selectedItem = biddingItems.find(i => i.id === selectedQueueId);
                              if (!selectedItem) { setSelectedQueueId(null); return; }

                              const selectedOrder = selectedItem.queueOrder ?? biddingItems.indexOf(selectedItem);
                              const targetOrder = item.queueOrder ?? index;

                              const reordered = biddingItems.map(i => {
                                if (i.id === selectedQueueId) return { ...i, queueOrder: targetOrder };
                                if (i.id === item.id) return { ...i, queueOrder: selectedOrder };
                                return i;
                              }).sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0));

                              setSelectedQueueId(null);
                              setAuction(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  shopItems: prev.shopItems.map(i => {
                                    const updated = reordered.find(r => r.id === i.id);
                                    return updated ? { ...i, queueOrder: updated.queueOrder } : i;
                                  }),
                                };
                              });
                              try {
                                await apiClient.patch('/shop-items/queue/reorder', { itemIds: reordered.map(i => i.id) });
                                notifyShopUpdated();
                              } catch {
                                Alert.alert('Error', 'Failed to save order.');
                              }
                              return;
                            }

                            // No item selected — first tap
                            if (currentItem) {
                              Alert.alert('Item Already Running', 'End or skip the current item before starting a new one.');
                              return;
                            }
                            // Long-press hint: single tap opens edit, hold to enter swap mode
                            setEditingQueueItem({ id: item.id, title: item.title, price: item.price });
                            setEditingPrice(String(item.price / 100));
                            setShowShop(false);
                          }}
                          onLongPress={() => {
                            if (!isSeller || currentItem) return;
                            setSelectedQueueId(item.id);
                          }}
                          style={{
                            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
                            backgroundColor: isSelected ? 'rgba(26,86,219,0.2)' : '#1F2937',
                            borderRadius: 12, padding: 12,
                            borderWidth: 1,
                            borderColor: isSelected
                              ? '#1A56DB'
                              : isSwapTarget
                                ? 'rgba(26,86,219,0.35)'
                                : 'transparent',
                            opacity: isSeller && item.status === 'QUEUED' && currentItem ? 0.4 : 1,
                          }}
                        >
                          <View style={{
                            width: 56, height: 56, borderRadius: 10,
                            backgroundColor: '#374151', overflow: 'hidden',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {(item.photos[0] as any)?.url ? (
                              <Image source={{ uri: (item.photos[0] as any).url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            ) : (
                              <Icon symbol="shippingbox.fill" fallback="📦" size={28} tint="rgba(255,255,255,0.4)" />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={{ color: '#F59E0B', fontSize: 12 }}>{formatPHP(item.price)}</Text>
                          </View>
                          {isSeller && !selectedQueueId && (
                            <Icon symbol="line.3.horizontal" fallback="≡" size={18} tint="#4B5563" />
                          )}
                          {isSelected && (
                            <View style={{
                              backgroundColor: '#1A56DB', borderRadius: 6,
                              paddingHorizontal: 8, paddingVertical: 3,
                            }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>SELECTED</Text>
                            </View>
                          )}
                          {isSwapTarget && (
                            <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '600' }}>Swap here</Text>
                          )}
                          {!isSeller && (
                            <Text style={{ color: '#6B7280', fontSize: 11 }}>›</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )
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
                          : soldSubTab === 'auction' ? 'Swipe'
                          : soldSubTab === 'chat' ? 'Chat'
                          : 'Buy Now'}
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
                    const isMyWin = !!winner && winner.userId === user?.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={isMyWin ? 0.7 : 1}
                        disabled={!isMyWin && !isSeller || winner?.orderStatus === 'PAID' || winner?.orderStatus === 'CANCELLED'}
                        onPress={async () => {
                          if (!isMyWin && !isSeller) return;

                          // Seller taps their own chat bid sold item → seller action sheet
                          if (isSeller && itemMode === 'chat') {
                            const sellerOrder = winner;
                            if (!sellerOrder) return;
                            try {
                              const res = await apiClient.get('/orders/selling');
                              const orders = res.data.data as Array<{ id: string; itemId: string; status: string; auction?: { id: string } }>;
                              const order = orders.find(o => o.itemId === item.id && o.auction?.id === id);
                              if (!order) return;
                              setSellerChatOrder({
                                orderId: order.id,
                                itemTitle: item.title,
                                amount: sellerOrder.amount,
                                buyerName: sellerOrder.displayName,
                                paymentReference: (order as any).paymentReference ?? undefined,
                              });
                              setShowSellerChatSheet(true);
                            } catch {
                              Alert.alert('Error', 'Could not load order.');
                            }
                            return;
                          }

                          if (!isMyWin) return;
                          const status = winner?.orderStatus;
                          if (status === 'PAID' || status === 'CANCELLED') return;

                          // Chat bid win → show payment instructions
                          if (itemMode === 'chat') {
                            // Already submitted proof — show status instead
                            if (winner?.paymentReference || winner?.paymentProofUrl) {
                              Alert.alert(
                                '✅ Proof already submitted',
                                `Your payment proof has been sent to the seller.\n\n${winner.paymentReference ? `Ref: ${winner.paymentReference}` : ''}${winner.paymentProofUrl ? '\n📸 Screenshot attached' : ''}\n\nWaiting for ${auction?.seller.displayName ?? 'seller'} to confirm.`,
                                [{ text: 'OK' }]
                              );
                              return;
                            }
                            try {
                              const res = await apiClient.get('/orders/buying');
                              const orders = res.data.data as Array<{ id: string; itemId: string; status: string; paymentReference?: string; paymentProofUrl?: string }>;
                              const order = orders.find(o => o.itemId === item.id);
                              if (!order) return;
                              // Double-check from fresh data
                              if (order.paymentReference || order.paymentProofUrl) {
                                Alert.alert(
                                  '✅ Proof already submitted',
                                  `Waiting for ${auction?.seller.displayName ?? 'seller'} to confirm your payment.`,
                                  [{ text: 'OK' }]
                                );
                                return;
                              }
                              setChatPayOrder({
                                orderId: order.id,
                                itemTitle: item.title,
                                amount: winner?.amount ?? item.price,
                                sellerId: auction?.seller.id ?? '',
                              });
                              setLoadingPaymentInfo(true);
                              setShowChatPaySheet(true);
                              setChatPayReference('');
                              setChatPayProofUrl('');
                              setVerifiedChatName(false);
                              setShowShop(false);
                              const infoRes = await apiClient.get(`/sellers/${auction?.seller.id}/payment-info`);
                              setSellerPaymentInfo(infoRes.data.data as typeof sellerPaymentInfo);
                            } catch {
                              // show sheet anyway, payment info optional
                            } finally {
                              setLoadingPaymentInfo(false);
                            }
                            return;
                          }

                          // Swipe auction win → order detail
                          try {
                            const res = await apiClient.get('/orders/buying');
                            const orders = res.data.data as Array<{ id: string; itemId: string; status: string }>;
                            const order = orders.find(o => o.itemId === item.id);
                            if (!order) {
                              Alert.alert('Order not ready', 'Your order is still being created. Try again in a moment.');
                              return;
                            }
                            setShowShop(false);
                            setSoldSubTab('all');
                            setSoldSort('recent');
                            setTimeout(() => router.push(`/order/${order.id}` as any), 100);
                          } catch {
                            Alert.alert('Error', 'Could not load order. Try again.');
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          backgroundColor: isMyWin ? 'rgba(16,185,129,0.12)' : '#1F2937',
                          borderWidth: 1,
                          borderColor: isMyWin ? '#10B981' : 'transparent',
                          borderRadius: 12,
                          padding: 12, marginBottom: 8,
                          position: 'relative',
                        }}
                      >
                        {isMyWin && (() => {
                          const cd = formatShopCountdown(winner?.paymentDeadline);
                          const status = winner?.orderStatus;
                          const isPaid = status === 'PAID' || status === 'SHIPPED' || status === 'DELIVERED' || status === 'COMPLETED';
                          const isCancelled = status === 'CANCELLED';
                          const isChatBid = itemMode === 'chat';
                          const proofSubmitted = isChatBid && !!(winner?.paymentReference || winner?.paymentProofUrl);
                          return (
                            <View style={{
                              position: 'absolute', top: -8, right: 10,
                              backgroundColor: isPaid ? '#059669' : isCancelled ? '#6B7280' : proofSubmitted ? '#059669' : isChatBid ? '#7C3AED' : cd?.expired ? '#6B7280' : cd?.urgent ? '#DC2626' : '#10B981',
                              borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
                              flexDirection: 'row', alignItems: 'center', gap: 5,
                              zIndex: 10,
                            }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
                                {isPaid ? '✅ Paid' : isCancelled ? '❌ Cancelled' : proofSubmitted ? '✅ Proof Sent' : isChatBid ? '💬 Send Payment' : cd?.expired ? 'EXPIRED' : '🏆 TAP TO PAY'}
                              </Text>
                              {!isPaid && !isCancelled && !isChatBid && cd && !cd.expired && (
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], opacity: 0.95 }}>
                                  · {cd.label}
                                </Text>
                              )}
                            </View>
                          );
                        })()}
                        <View style={{
                          width: 56, height: 56, borderRadius: 10,
                          backgroundColor: '#374151', overflow: 'hidden',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {item.photos[0]?.url ? (
                            <Image source={{ uri: item.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <Icon symbol="shippingbox.fill" fallback="📦" size={28} tint="rgba(255,255,255,0.4)" />
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
                                  {isSeller && winner.orderStatus && (
                                    <Text style={{
                                      color: winner.orderStatus === 'PAID' || winner.orderStatus === 'COMPLETED' ? '#10B981'
                                        : winner.orderStatus === 'CANCELLED' ? '#6B7280' : '#F59E0B',
                                      fontWeight: '700',
                                    }}>
                                      {winner.orderStatus === 'PAID' || winner.orderStatus === 'COMPLETED' ? ' · ✅ Paid'
                                        : winner.orderStatus === 'CANCELLED' ? ' · ❌ Cancelled'
                                        : ' · ⏳ Awaiting'}
                                    </Text>
                                  )}
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
                            <Icon
                              symbol={isBuyNow ? 'tag.fill' : itemMode === 'chat' ? 'bubble.left.fill' : 'hammer.fill'}
                              fallback={isBuyNow ? '🏷️' : itemMode === 'chat' ? '💬' : '🔨'}
                              size={10}
                              tint={isBuyNow ? '#10B981' : itemMode === 'chat' ? '#A78BFA' : '#60A5FA'}
                            />
                          </Text>
                        </View>
                      </TouchableOpacity>
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
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowShop(false);
                    setTimeout(() => setShopDetailItem(item), 50);
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
                    {item.photos[0]?.url ? (
                      <Image source={{ uri: item.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Icon symbol="shippingbox.fill" fallback="📦" size={28} tint="rgba(255,255,255,0.4)" />
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
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Start Item Modal (seller only) ── */}
      <Modal visible={showStartItem} transparent animationType="slide" onRequestClose={() => {
        setShowStartItem(false);
        if (preparingItemId && user?.id) {
          sendChat('__item_preparing_cancelled__', user.id, user.displayName ?? '');
        }
        setPreparingItemId(null);
      }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => {
          setShowStartItem(false);
          if (preparingItemId && user?.id) {
            sendChat('__item_preparing_cancelled__', user.id, user.displayName ?? '');
          }
          setPreparingItemId(null);
        }} />
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
                <Icon symbol="hammer.fill" fallback="🔨" size={24} tint={itemMode === 'auction' ? '#1A56DB' : '#6B7280'} />
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
                <Icon symbol="bubble.left.fill" fallback="💬" size={24} tint={itemMode === 'chat' ? '#7C3AED' : '#6B7280'} />
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
                  <Icon symbol="lightbulb.fill" fallback="💡" size={14} tint="#4B5563" />
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
          top: insets.top + 68, left: 16, right: 16,
          borderRadius: 20,
          overflow: 'hidden',
          zIndex: 998,
          shadowColor: '#10B981',
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
        }}>
          <BlurView
            intensity={55}
            tint="dark"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 16, paddingVertical: 14,
              backgroundColor: 'rgba(16,185,129,0.35)',
              borderWidth: 1,
              borderColor: 'rgba(16,185,129,0.5)',
              borderRadius: 20,
            }}
          >
            <Text style={{ fontSize: 28 }}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
                {saleToast.winner} won!
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                {saleToast.title} — {formatPHP(saleToast.amount)}
              </Text>
            </View>
          </BlurView>
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
                    <Icon
                      symbol={
                        opt.mode === 'queue' ? 'shippingbox.fill' :
                        opt.mode === 'now' ? 'hammer.fill' :
                        'tag.fill'
                      }
                      fallback={opt.icon}
                      size={22}
                      tint={active
                        ? opt.mode === 'now' ? '#DC2626'
                          : opt.mode === 'buynow' ? '#10B981'
                          : '#1A56DB'
                        : '#6B7280'
                      }
                    />
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
                  <Icon symbol="storefront.fill" fallback="🏪" size={22} tint={buyNowMode === 'shop' ? '#10B981' : '#6B7280'} />
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
                  <Icon symbol="tv.fill" fallback="📺" size={22} tint={buyNowMode === 'live' ? '#10B981' : '#6B7280'} />
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
            padding: 24, paddingBottom: insets.bottom + 24,
          }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Custom Bid</Text>
              <TouchableOpacity onPress={() => setShowCustomBid(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {currentItem && (
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
                Current: {formatPHP(currentItem.currentPrice)} · Min bid: {formatPHP(
                  currentItem.totalBids === 0
                    ? currentItem.currentPrice
                    : currentItem.currentPrice + getBidIncrement(currentItem.currentPrice)
                )}
              </Text>
            )}

            {/* ── Max Bid toggle section ── */}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              borderWidth: 1, borderColor: maxBidEnabled ? '#1A56DB' : '#374151',
              padding: 14, marginBottom: 16,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: maxBidEnabled ? 12 : 0 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Max Bid</Text>
                  <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2, lineHeight: 16 }}>
                    System auto-bids for you up to your limit. Hidden from others.
                  </Text>
                </View>
                <Switch
                  value={maxBidEnabled}
                  onValueChange={(v) => {
                    setMaxBidEnabled(v);
                    if (!v) setCustomBidInput('');
                  }}
                  trackColor={{ false: '#374151', true: '#1A56DB' }}
                  thumbColor="#fff"
                />
              </View>

              {maxBidEnabled && (
                <>
                  <View style={{
                    backgroundColor: '#111827', borderRadius: 10,
                    borderWidth: 1, borderColor: customBidInput ? '#1A56DB' : '#2D3748',
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 12, marginBottom: 8,
                  }}>
                    <Text style={{ color: '#6B7280', fontSize: 18, marginRight: 6 }}>₱</Text>
                    <TextInput
                      style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', paddingVertical: 12 }}
                      placeholder={myMaxBid ? `Current max: ${formatPHP(myMaxBid)}` : 'Enter max amount'}
                      placeholderTextColor="#4B5563"
                      value={customBidInput}
                      onChangeText={t => setCustomBidInput(t.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric"
                      autoFocus={maxBidEnabled}
                    />
                  </View>
                  {myMaxBid && (
                    <Text style={{ color: '#6B7280', fontSize: 11 }}>
                      Current max: {formatPHP(myMaxBid)} — you can only raise it
                    </Text>
                  )}
                  <TouchableOpacity
                    style={{
                      backgroundColor: customBidInput && !isSubmittingMaxBid ? '#1A56DB' : '#374151',
                      borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10,
                    }}
                    disabled={!customBidInput || isSubmittingMaxBid}
                    onPress={async () => {
                      const latest = currentItemRef.current;
                      if (!latest || !customBidInput || !user?.id) return;
                      const amount = parseInt(customBidInput) * 100;
                      const minAmount = latest.totalBids === 0
                        ? latest.currentPrice
                        : latest.currentPrice + getBidIncrement(latest.currentPrice);
                      if (amount < minAmount) {
                        Alert.alert('Too low', `Min bid is ${formatPHP(minAmount)}`);
                        return;
                      }
                      if (myMaxBid && amount <= myMaxBid) {
                        Alert.alert('Too low', `Must be higher than current max ${formatPHP(myMaxBid)}`);
                        return;
                      }
                      setIsSubmittingMaxBid(true);
                      try {
                        const { apiClient } = await import('../../../src/services/api/client');
                        await apiClient.post('/max-bids', {
                          auctionId: id,
                          itemId: latest.itemId,
                          amount,
                        });
                        setMyMaxBid(amount);
                        setCustomBidInput('');
                        setShowCustomBid(false);
                      } catch (e: any) {
                        Alert.alert('Error', e?.response?.data?.message ?? 'Failed to set max bid');
                      } finally {
                        setIsSubmittingMaxBid(false);
                      }
                    }}
                  >
                    {isSubmittingMaxBid
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                          Set Max Bid{customBidInput ? ` — ${formatPHP(parseInt(customBidInput) * 100)}` : ''}
                        </Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── Divider ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#1F2937' }} />
              <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '600' }}>OR BID MANUALLY</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#1F2937' }} />
            </View>

            {/* ── Direct bid input ── */}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 12,
              borderWidth: 1, borderColor: !maxBidEnabled && customBidInput ? '#1A56DB' : '#374151',
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, marginBottom: 20,
              opacity: maxBidEnabled ? 0.4 : 1,
            }}>
              <Text style={{ color: '#6B7280', fontSize: 18, marginRight: 8 }}>₱</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 22, fontWeight: '700', paddingVertical: 14 }}
                placeholder="0"
                placeholderTextColor="#4B5563"
                value={maxBidEnabled ? '' : customBidInput}
                onChangeText={t => { if (!maxBidEnabled) setCustomBidInput(t.replace(/[^0-9]/g, '')); }}
                keyboardType="numeric"
                autoFocus={!maxBidEnabled}
                editable={!maxBidEnabled}
              />
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: !maxBidEnabled && customBidInput ? '#1A56DB' : '#374151',
                borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                opacity: maxBidEnabled ? 0.4 : 1,
              }}
              onPress={() => {
                if (maxBidEnabled) return;
                if (!profileComplete) {
                  setShowCustomBid(false);
                  setProfileStep('address');
                  setShowProfileGate(true);
                  return;
                }
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
              disabled={maxBidEnabled || !customBidInput}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                Place Bid — {!maxBidEnabled && customBidInput ? formatPHP(parseInt(customBidInput) * 100) : '₱0'}
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
                  if (!editingQueueItem || !editingPrice || !user?.id) return;
                  if (currentItem) {
                    Alert.alert('Item Already Running', 'End or skip the current item first.');
                    return;
                  }
                  const newPrice = parseInt(editingPrice) * 100;
                  setSavingPrice(true);
                  try {
                    const { apiClient } = await import('../../../src/services/api/client');
                    if (newPrice !== editingQueueItem.price) {
                      await apiClient.patch(`/shop-items/${editingQueueItem.id}`, {
                        price: newPrice,
                      });
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
                    // Show this specific item in the item bar for seller + viewers
                    setPreparingItemId(editingQueueItem.id);
                    sendChat(
                      `__item_preparing__:${editingQueueItem.id}`,
                      user.id,
                      user.displayName ?? '',
                    );
                    // Now open Start Item Modal for timer/mode selection
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

      {/* ── Item Detail Sheet ── */}
      <Modal
        visible={!!shopDetailItem}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShopDetailItem(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#111827', paddingTop: insets.top }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderColor: '#1F2937',
          }}>
            <TouchableOpacity
              onPress={() => setShopDetailItem(null)}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16 }}>←</Text>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={1}>
              {shopDetailItem?.title}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {shopDetailItem && (shopDetailItem.photos as any[]).filter((p: any) => p?.url).length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <ScrollView
                  horizontal pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={SCREEN_WIDTH - 40}
                >
                  {(shopDetailItem.photos as any[]).filter((p: any) => p?.url).map((photo: any, i: number) => (
                    <Image
                      key={i}
                      source={{ uri: photo.url }}
                      style={{ width: SCREEN_WIDTH - 40, height: SCREEN_WIDTH - 40, borderRadius: 16, marginRight: 8, backgroundColor: '#1F2937' }}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
                {(shopDetailItem.photos as any[]).filter((p: any) => p?.url).length > 1 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                    {(shopDetailItem.photos as any[]).filter((p: any) => p?.url).map((_: any, i: number) => (
                      <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === 0 ? '#fff' : 'rgba(255,255,255,0.3)' }} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ height: 300, borderRadius: 16, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 64 }}>📦</Text>
              </View>
            )}

            {shopDetailItem?.status === 'LIVE' && (
              <View style={{ alignSelf: 'flex-start', backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>LIVE NOW — BIDDING OPEN</Text>
              </View>
            )}

            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 22, marginBottom: 8 }}>
              {shopDetailItem?.title}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1F2937', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>
                {shopDetailItem?.type === 'BUY_NOW' ? 'Buy Now price' : 'Starting price'}
              </Text>
              <Text style={{ color: shopDetailItem?.type === 'BUY_NOW' ? '#10B981' : '#F59E0B', fontWeight: '800', fontSize: 22 }}>
                {shopDetailItem ? formatPHP(shopDetailItem.price) : ''}
              </Text>
            </View>

            {shopDetailItem && (shopDetailItem as any).description ? (
              <View style={{ backgroundColor: '#1F2937', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</Text>
                <Text style={{ color: '#D1D5DB', fontSize: 14, lineHeight: 22 }}>{(shopDetailItem as any).description}</Text>
              </View>
            ) : null}

            <View style={{
              alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1,
              backgroundColor: shopDetailItem?.type === 'BUY_NOW' ? 'rgba(16,185,129,0.15)' : 'rgba(26,86,219,0.15)',
              borderColor: shopDetailItem?.type === 'BUY_NOW' ? 'rgba(16,185,129,0.4)' : 'rgba(26,86,219,0.4)',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: shopDetailItem?.type === 'BUY_NOW' ? '#10B981' : '#60A5FA' }}>
                {shopDetailItem?.type === 'BUY_NOW' ? '🏷️ Buy Now' : '🔨 Auction Item'}
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Profile Gate Modal ── */}
      <Modal
        visible={showProfileGate}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProfileGate(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' }}>
            <View style={{
              backgroundColor: '#111827',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 24, paddingBottom: insets.bottom + 24,
              maxHeight: '90%',
            }}>
              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
                <Text style={{ fontSize: 28, marginBottom: 8 }}>
                  {profileStep === 'address' ? '📦' : '💳'}
                </Text>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
                  {profileStep === 'address' ? 'Shipping Address' : 'Payment Method'}
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center' }}>
                  {profileStep === 'address'
                    ? 'Required before you can bid — so the seller knows where to ship.'
                    : 'Add at least one so the seller can receive your payment.'}
                </Text>
              </View>

              {/* Step indicators */}
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 16, marginBottom: 20 }}>
                {(['address', 'payment'] as const).map((step, i) => (
                  <View key={step} style={{
                    height: 3, flex: 1, borderRadius: 2,
                    backgroundColor: profileStep === step || (step === 'address' && profileStep === 'payment')
                      ? '#1A56DB' : '#374151',
                  }} />
                ))}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {profileStep === 'address' ? (
                  <View style={{ gap: 10 }}>
                    {([
                      { key: 'name', label: 'Full Name', placeholder: 'Juan dela Cruz', keyboard: 'default' },
                      { key: 'phone', label: 'Phone Number', placeholder: '09XX XXX XXXX', keyboard: 'phone-pad' },
                      { key: 'line1', label: 'Street / Barangay', placeholder: '123 Rizal St., Brgy. San Jose', keyboard: 'default' },
                      { key: 'city', label: 'City / Municipality', placeholder: 'Quezon City', keyboard: 'default' },
                      { key: 'province', label: 'Province', placeholder: 'Metro Manila', keyboard: 'default' },
                      { key: 'postalCode', label: 'Postal Code', placeholder: '1100', keyboard: 'numeric' },
                    ] as const).map(field => (
                      <View key={field.key}>
                        <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                          {field.label.toUpperCase()}
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: '#1F2937', borderRadius: 10,
                            borderWidth: 1, borderColor: addressForm[field.key] ? '#1A56DB' : '#374151',
                            padding: 12, color: '#fff', fontSize: 14,
                          }}
                          placeholder={field.placeholder}
                          placeholderTextColor="#4B5563"
                          value={addressForm[field.key]}
                          onChangeText={val => setAddressForm(prev => ({ ...prev, [field.key]: val }))}
                          keyboardType={field.keyboard as any}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 16 }}>
                    {/* GCash section */}
                    <View style={{
                      backgroundColor: '#1F2937', borderRadius: 14,
                      borderWidth: 1, borderColor: paymentForm.gcashNumber ? '#1A56DB' : '#374151',
                      padding: 14,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Text style={{ fontSize: 20 }}>📱</Text>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>GCash</Text>
                        <Text style={{ color: '#6B7280', fontSize: 11 }}>(optional if bank added)</Text>
                      </View>
                      {[
                        { key: 'gcashNumber', label: 'GCash Number', placeholder: '09XX XXX XXXX', keyboard: 'phone-pad' },
                        { key: 'gcashName', label: 'Account Name', placeholder: 'JUAN D.', keyboard: 'default' },
                      ].map(field => (
                        <View key={field.key} style={{ marginBottom: 10 }}>
                          <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                            {field.label.toUpperCase()}
                          </Text>
                          <TextInput
                            style={{
                              backgroundColor: '#111827', borderRadius: 10,
                              borderWidth: 1, borderColor: paymentForm[field.key as keyof typeof paymentForm] ? '#1A56DB' : '#2D3748',
                              padding: 12, color: '#fff', fontSize: 14,
                            }}
                            placeholder={field.placeholder}
                            placeholderTextColor="#4B5563"
                            value={paymentForm[field.key as keyof typeof paymentForm]}
                            onChangeText={val => setPaymentForm(prev => ({ ...prev, [field.key]: val }))}
                            keyboardType={field.keyboard as any}
                          />
                        </View>
                      ))}
                    </View>

                    {/* Divider */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: '#1F2937' }} />
                      <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '600' }}>OR</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: '#1F2937' }} />
                    </View>

                    {/* Bank section */}
                    <View style={{
                      backgroundColor: '#1F2937', borderRadius: 14,
                      borderWidth: 1, borderColor: paymentForm.bankName ? '#10B981' : '#374151',
                      padding: 14,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Text style={{ fontSize: 20 }}>🏦</Text>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Bank Transfer</Text>
                        <Text style={{ color: '#6B7280', fontSize: 11 }}>(optional if GCash added)</Text>
                      </View>
                      {[
                        { key: 'bankName', label: 'Bank Name', placeholder: 'BPI, BDO, Metrobank...', keyboard: 'default' },
                        { key: 'bankAccountNumber', label: 'Account Number', placeholder: '1234 5678 9012', keyboard: 'numeric' },
                        { key: 'bankAccountName', label: 'Account Name', placeholder: 'JUAN DELA CRUZ', keyboard: 'default' },
                      ].map(field => (
                        <View key={field.key} style={{ marginBottom: 10 }}>
                          <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 }}>
                            {field.label.toUpperCase()}
                          </Text>
                          <TextInput
                            style={{
                              backgroundColor: '#111827', borderRadius: 10,
                              borderWidth: 1, borderColor: paymentForm[field.key as keyof typeof paymentForm] ? '#10B981' : '#2D3748',
                              padding: 12, color: '#fff', fontSize: 14,
                            }}
                            placeholder={field.placeholder}
                            placeholderTextColor="#4B5563"
                            value={paymentForm[field.key as keyof typeof paymentForm]}
                            onChangeText={val => setPaymentForm(prev => ({ ...prev, [field.key]: val }))}
                            keyboardType={field.keyboard as any}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={{ height: 20 }} />
              </ScrollView>

              {/* CTA */}
              <TouchableOpacity
                style={{
                  backgroundColor: savingProfile ? '#374151' : '#1A56DB',
                  borderRadius: 14, paddingVertical: 16,
                  alignItems: 'center', marginTop: 16,
                  opacity: savingProfile ? 0.6 : 1,
                }}
                disabled={savingProfile}
                onPress={async () => {
                  if (profileStep === 'address') {
                    const { name, phone, line1, city, province, postalCode } = addressForm;
                    if (!name || !phone || !line1 || !city || !province || !postalCode) {
                      Alert.alert('Missing Info', 'Please fill in all address fields.');
                      return;
                    }
                    setSavingProfile(true);
                    try {
                      await apiClient.post('/users/me/address', addressForm);
                      setProfileStep('payment');
                    } catch {
                      Alert.alert('Error', 'Failed to save address. Please try again.');
                    } finally {
                      setSavingProfile(false);
                    }
                  } else {
                    const { gcashNumber, gcashName, bankName, bankAccountNumber, bankAccountName } = paymentForm;
                    const hasGcash = gcashNumber && gcashName;
                    const hasBank = bankName && bankAccountNumber && bankAccountName;
                    if (!hasGcash && !hasBank) {
                      Alert.alert('Payment Method Required', 'Add at least one — GCash or Bank Transfer.');
                      return;
                    }
                    setSavingProfile(true);
                    try {
                      await apiClient.patch('/users/me/payment-methods', paymentForm);
                      setProfileComplete(true);
                      setShowProfileGate(false);
                      Alert.alert('✅ Profile Complete!', 'You can now place bids.');
                    } catch {
                      Alert.alert('Error', 'Failed to save payment method. Please try again.');
                    } finally {
                      setSavingProfile(false);
                    }
                  }
                }}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    {profileStep === 'address' ? 'Save Address →' : '✅ Complete Profile'}
                  </Text>
                )}
              </TouchableOpacity>

              {profileStep === 'payment' && (
                <TouchableOpacity
                  style={{ marginTop: 12, alignItems: 'center' }}
                  onPress={() => setProfileStep('address')}
                >
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>← Back to Address</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={{ marginTop: 8, alignItems: 'center' }}
                onPress={() => setShowProfileGate(false)}
              >
                <Text style={{ color: '#4B5563', fontSize: 12 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Reaction Picker Pill ── */}
        {showReactions && (
          <View style={{
            position: 'absolute',
            right: 58,
            bottom: reactButtonBottomRef.current,
            flexDirection: 'row',
            gap: 16,
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.25)',
            zIndex: 100,
          }}>
            {REACTION_ICONS.map(reaction => (
              <TouchableOpacity
                key={reaction.label}
                activeOpacity={0.6}
                onPress={() => {
                  sendReaction(reaction.label, user?.id ?? '');
                  setShowReactions(false);
                }}
              >
                <Icon symbol={reaction.symbol} fallback={reaction.label} size={18} tint="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Co-host: Chat Action Sheet (host → invite a viewer) ── */}
      <Modal
        visible={!!chatActionSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setChatActionSheet(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setChatActionSheet(null)}
        >
          <View style={{
            backgroundColor: '#111827',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 24, paddingBottom: insets.bottom + 24,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 12 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {chatActionSheet?.displayName}
              </Text>
            </View>

            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: 'rgba(124,58,237,0.15)',
                borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)',
                borderRadius: 14, padding: 16, marginBottom: 10,
              }}
              onPress={() => {
                if (!chatActionSheet || !user?.id) return;
                inviteCoHost(user.id, chatActionSheet.userId);
                setChatActionSheet(null);
              }}
            >
              <Text style={{ fontSize: 22 }}>🎥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#A78BFA', fontWeight: '700', fontSize: 14 }}>
                  Invite as Co-host
                </Text>
                <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                  They appear on camera with you. They can't add items or bid.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={() => setChatActionSheet(null)}
            >
              <Text style={{ color: '#6B7280', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Co-host: Invite Received Modal (target sees this) ── */}
      <Modal
        visible={!!coHostInvite}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (coHostInvite && user?.id) declineCoHostInvite(user.id);
          setCoHostInvite(null);
        }}
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
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🎥</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' }}>
                Co-host invite
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{coHostInvite?.hostDisplayName}</Text>
                {' '}wants you to join the live as a co-host.{'\n\n'}
                <Text style={{ color: '#6B7280', fontSize: 12 }}>
                  Your camera and mic will turn on. You can leave anytime.
                </Text>
              </Text>
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: '#7C3AED', borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 10,
              }}
              onPress={async () => {
                if (!coHostInvite || !user?.id) return;
                const peerId = await hms.getLocalPeerId();
                if (!peerId) {
                  Alert.alert('Not connected', 'Wait for the stream to load, then try again.');
                  return;
                }
                acceptCoHostInvite(user.id, user.displayName ?? '', peerId);
                setCoHostInvite(null);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                Accept — Join on camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                borderWidth: 1, borderColor: '#374151',
              }}
              onPress={() => {
                if (coHostInvite && user?.id) declineCoHostInvite(user.id);
                setCoHostInvite(null);
              }}
            >
              <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 14 }}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Hosts bottom sheet ── */}
      <Modal
        visible={hostSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setHostSheetOpen(false);
          setHostSheetView({ type: 'list' });
          setRosterSearch('');
          setInvitedUserIds(new Set());
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              setHostSheetOpen(false);
              setHostSheetView({ type: 'list' });
              setRosterSearch('');
              setInvitedUserIds(new Set());
            }}
            style={{ flex: 1 }}
          />
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{
              backgroundColor: '#111827',
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              paddingTop: 12,
              paddingBottom: insets.bottom + 16,
              paddingHorizontal: hostSheetView.type === 'profile' ? 0 : 16,
              maxHeight: hostSheetView.type === 'profile' ? '88%' : '60%',
              minHeight: hostSheetView.type === 'profile' ? '70%' : undefined,
            }}>
            {/* grab handle */}
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 16, marginHorizontal: 16 }} />

            {hostSheetView.type === 'profile' ? (
              <SellerPublicProfileView
                userId={hostSheetView.userId}
                embedded
                onBack={() => setHostSheetView({ type: 'list' })}
                onAuctionPress={(auctionId) => {
                  setHostSheetOpen(false);
                  setHostSheetView({ type: 'list' });
                  router.push(`/auction/${auctionId}` as any);
                }}
              />
            ) : (
              <>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
                  Live hosts
                </Text>

                {/* Seller row */}
                {auction?.seller && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setHostSheetView({ type: 'profile', userId: auction.seller.id })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
                  >
                    <View style={{
                      width: 44, height: 44, borderRadius: 22,
                      backgroundColor: '#1A56DB',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                        {auction.seller.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                        {auction.seller.displayName}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>
                        Host
                      </Text>
                    </View>
                    <Icon symbol="chevron.right" fallback="›" size={14} tint="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}

                {/* Co-host row */}
                {hasCoHost && auction?.coHost && (
                  <>
                    <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setHostSheetView({ type: 'profile', userId: auction.coHost!.id })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
                    >
                      <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: '#7C3AED',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                          {auction.coHost.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                          {auction.coHost.displayName}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>
                          Co-host
                        </Text>
                      </View>
                      <Icon symbol="chevron.right" fallback="›" size={14} tint="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>

                    {isHost && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          setHostSheetOpen(false);
                          Alert.alert(
                            'Remove co-host?',
                            `${auction.coHost!.displayName} will be returned to viewer mode.`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Remove', style: 'destructive', onPress: () => user?.id && kickCoHost(user.id) },
                            ],
                          );
                        }}
                        style={{
                          marginTop: 12, paddingVertical: 12,
                          backgroundColor: 'rgba(220,38,38,0.15)',
                          borderWidth: 1, borderColor: 'rgba(220,38,38,0.4)',
                          borderRadius: 12, alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#FCA5A5', fontSize: 14, fontWeight: '600' }}>
                          Remove co-host
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* ── INVITE A CO-HOST: viewer roster ── */}
                {isHost && !hasCoHost && (
                  <>
                    <View style={{
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      marginTop: 8,
                    }} />
                    <Text style={{
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: 11, fontWeight: '700',
                      letterSpacing: 0.5,
                      marginTop: 16, marginBottom: 10,
                    }}>
                      INVITE A CO-HOST
                    </Text>

                    <TextInput
                      style={{
                        backgroundColor: '#1F2937',
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: rosterSearch ? '#7C3AED' : '#374151',
                        paddingHorizontal: 12, paddingVertical: 10,
                        color: '#fff', fontSize: 13,
                        marginBottom: 12,
                      }}
                      placeholder="Search viewers..."
                      placeholderTextColor="#4B5563"
                      value={rosterSearch}
                      onChangeText={setRosterSearch}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />

                    {filteredRoster.length === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                        <Text style={{ color: '#4B5563', fontSize: 13 }}>
                          {viewerRoster.length === 0 ? 'No viewers yet' : 'No matches'}
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={{ maxHeight: 240 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                      >
                        {filteredRoster.map(viewer => {
                          const isInvited = invitedUserIds.has(viewer.userId);
                          return (
                            <View
                              key={viewer.userId}
                              style={{
                                flexDirection: 'row', alignItems: 'center',
                                gap: 12, paddingVertical: 10,
                              }}
                            >
                              <View style={{
                                width: 36, height: 36, borderRadius: 18,
                                backgroundColor: '#374151',
                                alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                                  {viewer.displayName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <Text
                                style={{ flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' }}
                                numberOfLines={1}
                              >
                                {viewer.displayName}
                              </Text>
                              <TouchableOpacity
                                onPress={() => {
                                  if (isInvited || !user?.id) return;
                                  inviteCoHost(user.id, viewer.userId);
                                  setInvitedUserIds(prev => new Set([...prev, viewer.userId]));
                                  setTimeout(() => {
                                    setInvitedUserIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(viewer.userId);
                                      return next;
                                    });
                                  }, 3000);
                                }}
                                style={{
                                  backgroundColor: isInvited
                                    ? 'rgba(16,185,129,0.15)'
                                    : 'rgba(124,58,237,0.2)',
                                  borderWidth: 1,
                                  borderColor: isInvited
                                    ? 'rgba(16,185,129,0.4)'
                                    : 'rgba(124,58,237,0.5)',
                                  borderRadius: 8,
                                  paddingHorizontal: 12, paddingVertical: 6,
                                }}
                              >
                                <Text style={{
                                  color: isInvited ? '#10B981' : '#A78BFA',
                                  fontSize: 12, fontWeight: '700',
                                }}>
                                  {isInvited ? 'Invited ✓' : 'Invite'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
                )}
              </>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── Floating Reactions ── */}
      <View
        style={{ position: 'absolute', right: 0, bottom: reactButtonBottomRef.current, width: 80, height: 300 }}
        pointerEvents="none"
      >
        {floatingEmojis.map(item => (
          <FloatingEmoji
            key={item.id}
            item={item}
            onDone={id => setFloatingEmojis(prev => prev.filter(e => e.id !== id))}
          />
        ))}
      </View>

      {/* ── End Live — Unpaid Orders Modal ── */}
      <Modal
        visible={showEndLiveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndLiveModal(false)}
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
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>⚠️</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' }}>
                {endLiveUnpaid.length} unpaid order{endLiveUnpaid.length !== 1 ? 's' : ''}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                These buyers haven't paid yet. What should happen to their orders?
              </Text>
            </View>

            {/* Order list */}
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14,
              padding: 14, marginBottom: 20, gap: 10,
            }}>
              {endLiveUnpaid.map((order, i) => {
                const msLeft = order.paymentDeadline
                  ? new Date(order.paymentDeadline).getTime() - Date.now()
                  : null;
                const minLeft = msLeft !== null ? Math.max(0, Math.floor(msLeft / 60000)) : null;
                return (
                  <View key={order.id} style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingBottom: i < endLiveUnpaid.length - 1 ? 10 : 0,
                    borderBottomWidth: i < endLiveUnpaid.length - 1 ? 1 : 0,
                    borderBottomColor: '#374151',
                  }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                        {order.itemTitle}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>
                        {order.buyerName}
                        {minLeft !== null && (
                          <Text style={{ color: minLeft <= 2 ? '#EF4444' : '#F59E0B' }}>
                            {' · '}{minLeft}m left
                          </Text>
                        )}
                      </Text>
                    </View>
                    <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 13 }}>
                      {formatPHP(order.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Cancel all + end */}
            <TouchableOpacity
              style={{
                backgroundColor: '#DC2626', borderRadius: 14,
                paddingVertical: 14, alignItems: 'center', marginBottom: 10,
                opacity: endingLive ? 0.6 : 1,
              }}
              disabled={endingLive}
              onPress={() => void doEndLive(true)}
            >
              {endingLive ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    Cancel all unpaid + end live
                  </Text>
                  <Text style={{ color: '#FCA5A5', fontSize: 11, marginTop: 2 }}>
                    Orders cancelled · buyers notified
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Wait, end anyway */}
            <TouchableOpacity
              style={{
                backgroundColor: '#1A56DB', borderRadius: 14,
                paddingVertical: 14, alignItems: 'center', marginBottom: 10,
                opacity: endingLive ? 0.6 : 1,
              }}
              disabled={endingLive}
              onPress={() => void doEndLive(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                End live — let them pay
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
                Orders stay open until their 10-min window expires
              </Text>
            </TouchableOpacity>

            {/* Don't end yet */}
            <TouchableOpacity
              style={{
                borderRadius: 14, paddingVertical: 12, alignItems: 'center',
                borderWidth: 1, borderColor: '#374151',
                opacity: endingLive ? 0.4 : 1,
              }}
              disabled={endingLive}
              onPress={() => setShowEndLiveModal(false)}
            >
              <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 14 }}>
                Don't end yet
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Chat Bid Payment Instructions Sheet (Buyer) ── */}
      <Modal
        visible={showChatPaySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChatPaySheet(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}
          activeOpacity={1}
          onPress={() => setShowChatPaySheet(false)}
        />
        <View style={{
          backgroundColor: '#111827',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 24, paddingBottom: insets.bottom + 24,
        }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
            <Text style={{ fontSize: 32, marginBottom: 8 }}>💬</Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
              Send Payment
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
              {chatPayOrder?.itemTitle} — {formatPHP(chatPayOrder?.amount ?? 0)}
            </Text>
          </View>

          {loadingPaymentInfo ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color="#7C3AED" />
              <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 8 }}>Loading payment details...</Text>
            </View>
          ) : sellerPaymentInfo ? (
            <View style={{ gap: 12, marginBottom: 20 }}>
              {/* Seller identity banner */}
              <View style={{
                backgroundColor: 'rgba(124,58,237,0.08)',
                borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)',
                borderRadius: 12, padding: 12,
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: '#7C3AED',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                    {auction?.seller.displayName?.charAt(0).toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '700' }}>SENDING TO</Text>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    {auction?.seller.displayName ?? 'Seller'}
                  </Text>
                </View>
                <Text style={{ fontSize: 18 }}>🔒</Text>
              </View>

              {/* Name mismatch warning */}
              {sellerPaymentInfo.gcash && !namesSeem(sellerPaymentInfo.gcash.name, auction?.seller.displayName ?? '') && (
                <View style={{
                  backgroundColor: 'rgba(245,158,11,0.08)',
                  borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
                  borderRadius: 12, padding: 12,
                  flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                }}>
                  <Text style={{ fontSize: 16 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 12, marginBottom: 2 }}>
                      Name mismatch detected
                    </Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 16 }}>
                      The GCash account name doesn't match the seller's profile. Verify carefully before sending.
                    </Text>
                  </View>
                </View>
              )}

              {sellerPaymentInfo.gcash && (
                <View style={{
                  backgroundColor: '#1F2937', borderRadius: 14,
                  borderWidth: 1, borderColor: 'rgba(26,86,219,0.3)',
                  padding: 16,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 20 }}>📱</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>GCash</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Number</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.gcash.number}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Name</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.gcash.name}</Text>
                  </View>
                </View>
              )}

              {sellerPaymentInfo.bank && (
                <View style={{
                  backgroundColor: '#1F2937', borderRadius: 14,
                  borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
                  padding: 16,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 20 }}>🏦</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{sellerPaymentInfo.bank.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Account Number</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.bank.accountNumber}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Account Name</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{sellerPaymentInfo.bank.accountName}</Text>
                  </View>
                </View>
              )}

              {!sellerPaymentInfo.gcash && !sellerPaymentInfo.bank && (
                <View style={{
                  backgroundColor: '#1F2937', borderRadius: 14, padding: 16,
                  alignItems: 'center',
                }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                    Seller hasn't added payment details yet.{'\n'}Contact them directly to arrange payment.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={{
              backgroundColor: '#1F2937', borderRadius: 14, padding: 16,
              alignItems: 'center', marginBottom: 20,
            }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                Contact the seller directly to arrange payment.
              </Text>
            </View>
          )}

          <View style={{
            backgroundColor: 'rgba(124,58,237,0.1)',
            borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)',
            borderRadius: 12, padding: 14, marginBottom: 20,
          }}>
            <Text style={{ color: '#A78BFA', fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
              Send the exact amount and screenshot your payment.{'\n'}
              The seller will confirm once received.
            </Text>
          </View>

          {/* Screenshot proof */}
          <TouchableOpacity
            style={{
              backgroundColor: '#1F2937',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: chatPayProofUrl ? '#7C3AED' : '#374151',
              borderStyle: chatPayProofUrl ? 'solid' : 'dashed',
              overflow: 'hidden',
              marginBottom: 12,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 72,
            }}
            onPress={() => void handlePickChatProof()}
            disabled={uploadingChatProof}
          >
            {uploadingChatProof ? (
              <View style={{ padding: 16, alignItems: 'center', gap: 6 }}>
                <ActivityIndicator color="#7C3AED" size="small" />
                <Text style={{ color: '#6B7280', fontSize: 12 }}>Uploading...</Text>
              </View>
            ) : chatPayProofUrl ? (
              <View style={{ width: '100%' }}>
                <Image
                  source={{ uri: chatPayProofUrl }}
                  style={{ width: '100%', height: 140, borderRadius: 14 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    borderRadius: 999, width: 28, height: 28,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  onPress={() => setChatPayProofUrl('')}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>✕</Text>
                </TouchableOpacity>
                <View style={{
                  position: 'absolute', bottom: 8, left: 8,
                  backgroundColor: 'rgba(124,58,237,0.9)',
                  borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓ Screenshot attached</Text>
                </View>
              </View>
            ) : (
              <View style={{ padding: 16, alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 24 }}>📸</Text>
                <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600' }}>
                  Attach GCash / bank screenshot
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Reference number input */}
          <View style={{
            backgroundColor: '#1F2937', borderRadius: 14,
            borderWidth: 1, borderColor: '#374151',
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 14, marginBottom: 12,
          }}>
            <Text style={{ color: '#6B7280', fontSize: 13, marginRight: 8 }}>Ref#</Text>
            <TextInput
              style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 }}
              placeholder="GCash ref number or note..."
              placeholderTextColor="#4B5563"
              value={chatPayReference}
              onChangeText={setChatPayReference}
              autoCapitalize="none"
            />
          </View>

          {/* Verification checkbox */}
          {(sellerPaymentInfo?.gcash || sellerPaymentInfo?.bank) && (
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                marginBottom: 12, paddingHorizontal: 2,
              }}
              onPress={() => setVerifiedChatName(prev => !prev)}
              activeOpacity={0.7}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6,
                borderWidth: 2,
                borderColor: verifiedChatName ? '#7C3AED' : '#374151',
                backgroundColor: verifiedChatName ? '#7C3AED' : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {verifiedChatName && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={{ color: '#9CA3AF', fontSize: 12, flex: 1, lineHeight: 18 }}>
                I have verified the account name matches the seller before sending payment
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{
              backgroundColor: (chatPayReference.trim() || chatPayProofUrl) && (verifiedChatName || (!sellerPaymentInfo?.gcash && !sellerPaymentInfo?.bank)) ? '#7C3AED' : '#374151',
              borderRadius: 14, paddingVertical: 14,
              alignItems: 'center', marginBottom: 10,
            }}
            onPress={async () => {
              if (!chatPayOrder || !chatPayReference.trim()) return;
              try {
                await apiClient.patch(`/orders/${chatPayOrder.orderId}/payment-reference`, {
                  reference: chatPayReference.trim() || undefined,
                  proofUrl: chatPayProofUrl || undefined,
                });
                setShowChatPaySheet(false);
                setChatPayReference('');
                Alert.alert('✅ Sent!', 'Your reference number has been sent to the seller.');
              } catch {
                Alert.alert('Error', 'Failed to submit. Try again.');
              }
            }}
            disabled={(!chatPayReference.trim() && !chatPayProofUrl) || uploadingChatProof || !(verifiedChatName || (!sellerPaymentInfo?.gcash && !sellerPaymentInfo?.bank))}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {(!chatPayReference.trim() && !chatPayProofUrl) ? 'Add ref# or screenshot above' : 'Submit Proof'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ paddingVertical: 10, alignItems: 'center' }}
            onPress={() => setShowChatPaySheet(false)}
          >
            <Text style={{ color: '#6B7280', fontSize: 13 }}>I'll do this later</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Seller Chat Bid Action Sheet ── */}
      <Modal
        visible={showSellerChatSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSellerChatSheet(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setShowSellerChatSheet(false)}
        />
        <View style={{
          backgroundColor: '#111827',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 24, paddingBottom: insets.bottom + 24,
        }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#374151', marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }} numberOfLines={1}>
              {sellerChatOrder?.itemTitle}
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>
              Won by {sellerChatOrder?.buyerName} · {formatPHP(sellerChatOrder?.amount ?? 0)}
            </Text>
            {sellerChatOrder?.paymentReference && (
              <View style={{
                backgroundColor: 'rgba(124,58,237,0.1)',
                borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Text style={{ color: '#A78BFA', fontSize: 11, fontWeight: '700' }}>REF#</Text>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  {sellerChatOrder.paymentReference}
                </Text>
              </View>
            )}
          </View>

          {/* Mark as Paid */}
          <TouchableOpacity
            style={{
              backgroundColor: markingPaid ? '#374151' : '#10B981',
              borderRadius: 14, paddingVertical: 14,
              alignItems: 'center', marginBottom: 10,
              opacity: markingPaid ? 0.6 : 1,
            }}
            disabled={markingPaid}
            onPress={async () => {
              if (!sellerChatOrder) return;
              setMarkingPaid(true);
              try {
                await apiClient.patch(`/orders/${sellerChatOrder.orderId}/mark-paid`);
                setSoldItemWinners(prev => ({
                  ...prev,
                  ...Object.fromEntries(
                    Object.entries(prev).filter(([, w]) => w.orderId === sellerChatOrder.orderId)
                      .map(([k, w]) => [k, { ...w, orderStatus: 'PAID' }])
                  ),
                }));
                setShowSellerChatSheet(false);
                Alert.alert('✅ Marked as Paid', `${sellerChatOrder.buyerName}'s order is now confirmed.`);
              } catch {
                Alert.alert('Error', 'Failed to mark as paid. Try again.');
              } finally {
                setMarkingPaid(false);
              }
            }}
          >
            {markingPaid
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✅ Mark as Paid</Text>
            }
          </TouchableOpacity>

          {/* Enter Tracking */}
          <TouchableOpacity
            style={{
              backgroundColor: '#1A56DB', borderRadius: 14,
              paddingVertical: 14, alignItems: 'center', marginBottom: 10,
            }}
            onPress={() => {
              setShowSellerChatSheet(false);
              if (!sellerChatOrder) return;
              setTimeout(() => router.push(`/order/${sellerChatOrder.orderId}` as any), 100);
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>📦 Enter Tracking Number</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ paddingVertical: 12, alignItems: 'center' }}
            onPress={() => setShowSellerChatSheet(false)}
          >
            <Text style={{ color: '#6B7280', fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
