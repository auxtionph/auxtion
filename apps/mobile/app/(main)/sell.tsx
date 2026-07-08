import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A } from '../../src/theme/admin';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';
import { auctionsApi, SellerAuction } from '../../src/services/api/auctions.api';
import { AuctionCoverSlot } from '../../src/components/AuctionCoverSlot';


export default function SellScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSeller = user?.role === 'SELLER';
  const isAdmin = user?.role === 'ADMIN';
  const insets = useSafeAreaInsets();

  const [auctions, setAuctions] = useState<SellerAuction[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [goingLive, setGoingLive] = useState<string | null>(null);
  const [showQuickLive, setShowQuickLive] = useState(false);
  const [pendingGoLiveId, setPendingGoLiveId] = useState<string | null>(null);
  const [showGoLiveConfirm, setShowGoLiveConfirm] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCoverUrl, setQuickCoverUrl] = useState('');
  const [isQuickCoverUploading, setIsQuickCoverUploading] = useState(false);
  const [confirmCoverUrl, setConfirmCoverUrl] = useState('');
  const [isConfirmCoverUploading, setIsConfirmCoverUploading] = useState(false);

  const fetchAuctions = async () => {
    try {
      const all = await auctionsApi.getSellerAuctions(user?.id ?? '');
      setAuctions(all.filter(a => a.status === 'SCHEDULED' || a.status === 'LIVE'));
    } catch {
      // ignore
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!isSeller) return;
      setLoading(true);
      void fetchAuctions().finally(() => setLoading(false));
    }, [isSeller])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAuctions();
    setRefreshing(false);
  };

  const handleGoLive = (auctionId: string) => {
    // Check if seller already has a live auction
    const alreadyLive = auctions.find(a => a.status === 'LIVE');
    if (alreadyLive) {
      Alert.alert(
        'Already Live',
        `You already have a live auction "${alreadyLive.title}". End it first before starting a new one.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Rejoin Live',
            onPress: () => router.push(`/auction/${alreadyLive.id}/live?role=broadcaster`),
          },
        ]
      );
      return;
    }
     setConfirmCoverUrl('');
    setIsConfirmCoverUploading(false); 
    setPendingGoLiveId(auctionId);
    setShowGoLiveConfirm(true);
  };

  const confirmGoLive = async () => {
    if (!pendingGoLiveId) return;
    setShowGoLiveConfirm(false);
    setGoingLive(pendingGoLiveId);
    try {
      await auctionsApi.goLive(pendingGoLiveId);
      // Only patch cover if seller explicitly uploaded a new one
      if (confirmCoverUrl && confirmCoverUrl !== '__replace__') {
        await apiClient.patch(`/auctions/${pendingGoLiveId}`, {
          coverImageUrl: confirmCoverUrl,
        });
      }
      setConfirmCoverUrl('');
      router.push(`/auction/${pendingGoLiveId}/live?role=broadcaster`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to go live.');
    } finally {
      setGoingLive(null);
      setPendingGoLiveId(null);
    }
  };

  const handleQuickLive = async () => {
    if (!quickTitle.trim()) return;

    // Check if seller already has a live auction
    const alreadyLive = auctions.find(a => a.status === 'LIVE');
    if (alreadyLive) {
      setShowQuickLive(false);
      Alert.alert(
        'Already Live',
        `You already have a live auction "${alreadyLive.title}". End it first before starting a new one.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Rejoin Live',
            onPress: () => router.push(`/auction/${alreadyLive.id}/live?role=broadcaster`),
          },
        ]
      );
      return;
    }

    setLoading(true);
    setShowQuickLive(false);
    try {
      const res = await apiClient.post('/auctions', {
        title: quickTitle.trim(),
        startTime: new Date().toISOString(),
        coverImageUrl: quickCoverUrl || undefined,
      });
      const auctionId = (res.data.data as { id: string }).id;
      await auctionsApi.goLive(auctionId);
      setQuickTitle('');
      router.push(`/auction/${auctionId}/live?role=broadcaster`);
    } catch {
      Alert.alert('Error', 'Failed to start live auction.');
    } finally {
      setLoading(false);
    }
  };

  const formatSchedule = (startTime: string) => {
    const d = new Date(startTime);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString();

    const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (isToday) return `Today at ${time}`;
    if (isTomorrow) return `Tomorrow at ${time}`;
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ` at ${time}`;
  };

  const getTimeUntil = (startTime: string) => {
    const diff = new Date(startTime).getTime() - Date.now();
    if (diff < 0) return 'Overdue';
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `in ${days}d ${hours % 24}h`;
    if (hours > 0) return `in ${hours}h ${mins % 60}m`;
    return `in ${mins}m`;
  };

  if (isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: A.color.surface, paddingTop: insets.top }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: A.mono, fontSize: 11, letterSpacing: 1.5, color: A.color.ink3, marginBottom: 12 }}>ADMIN ACCOUNT</Text>
          <Text style={{ color: A.color.ink, fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            This tab is for sellers
          </Text>
          <Text style={{ color: A.color.ink2, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
            Admin accounts manage the platform, not sell. Head to the Admin Panel to review applications, users, and orders.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/admin' as any)}
            style={{
              backgroundColor: A.color.accent,
              borderRadius: 14,
              paddingHorizontal: 28,
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Open Admin Panel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isSeller) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#111827' }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, paddingTop: 56, paddingHorizontal: 24, paddingBottom: 40 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Become a Seller</Text>
          <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 32 }}>
            Apply to sell on Auxtion and reach thousands of buyers
          </Text>
          {[
            { icon: '🔴', title: 'Go Live & Sell', desc: 'Host live auction streams and sell items in real-time' },
            { icon: '💰', title: 'Earn Money', desc: 'Get paid directly to your GCash or bank account' },
            { icon: '🛍️', title: 'Manage Your Shop', desc: 'List items with Buy Now pricing or auction format' },
            { icon: '⭐', title: 'Build Your Brand', desc: 'Grow your follower base and get repeat buyers' },
          ].map(({ icon, title, desc }) => (
            <View key={title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
              <Text style={{ fontSize: 28 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{title}</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>{desc}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={{ backgroundColor: '#1A56DB', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 16 }}
            onPress={() => router.push('/seller-application')}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Apply to Sell</Text>
            <Text style={{ color: '#BFDBFE', fontSize: 12, marginTop: 2 }}>Free to apply • Admin reviews within 48 hours</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#111827' }}>
      {/* Header */}
      <View style={{
        paddingTop: 56, paddingHorizontal: 24, paddingBottom: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderBottomWidth: 1, borderColor: '#1F2937',
      }}>
        <View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>My Auctions</Text>
          <Text style={{ color: '#6B7280', fontSize: 13 }}>
            {auctions.filter(a => a.status === 'LIVE').length > 0
              ? `${auctions.filter(a => a.status === 'LIVE').length} live now`
              : `${auctions.filter(a => a.status === 'SCHEDULED').length} scheduled`}
          </Text>
        </View>
        <TouchableOpacity
          style={{ backgroundColor: '#1A56DB', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}
          onPress={() => router.push('/auction/create')}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>+ Create</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Go Live */}
      <TouchableOpacity
        style={{
          margin: 16, marginBottom: 8,
          backgroundColor: '#DC2626', borderRadius: 14,
          padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
          opacity: loading ? 0.6 : 1,
        }}
        onPress={() => {
          setQuickTitle(`${user?.displayName ?? 'Seller'}'s Live Auction`);
          setShowQuickLive(true);
        }}
        disabled={loading}
      >
        <Text style={{ fontSize: 24 }}>🔴</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Go Live Now</Text>
          <Text style={{ color: '#FCA5A5', fontSize: 12 }}>Start an instant live auction</Text>
        </View>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18 }}>→</Text>}
      </TouchableOpacity>

      {/* Auction List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#1A56DB" />}
      >
        {loading && auctions.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <ActivityIndicator color="#1A56DB" />
          </View>
        )}

        {!loading && auctions.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 48 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🏷️</Text>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 }}>No auctions yet</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
              Create your first auction to get started
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#1A56DB', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
              onPress={() => router.push('/auction/create')}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Create Auction</Text>
            </TouchableOpacity>
          </View>
        )}

        {auctions.map(auction => {
          const isLive = auction.status === 'LIVE';
          const itemCount = auction.shopItems.length;
          const queuedCount = auction.shopItems.filter(i => i.status === 'QUEUED').length;

          return (
            <TouchableOpacity
              key={auction.id}
              style={{
                backgroundColor: '#1F2937', borderRadius: 16,
                padding: 16, marginBottom: 12,
                borderWidth: isLive ? 1 : 0,
                borderColor: isLive ? '#DC2626' : 'transparent',
              }}
              onPress={() => router.push(`/auction/${auction.id}`)}
              activeOpacity={0.8}
            >
              {/* Status badge + title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{
                  backgroundColor: isLive ? '#DC2626' : '#374151',
                  borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                }}>
                  {isLive && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />}
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {isLive ? 'LIVE' : 'SCHEDULED'}
                  </Text>
                </View>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15, flex: 1 }} numberOfLines={1}>
                  {auction.title}
                </Text>
              </View>

              {/* Schedule info */}
              {!isLive && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Text style={{ fontSize: 13 }}>📅</Text>
                  <Text style={{ color: '#9CA3AF', fontSize: 13 }}>
                    {formatSchedule(auction.startTime)}
                  </Text>
                  <Text style={{ color: '#4B5563', fontSize: 12 }}>·</Text>
                  <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>
                    {getTimeUntil(auction.startTime)}
                  </Text>
                </View>
              )}

              {/* Item count */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Text style={{ fontSize: 13 }}>📦</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>
                  {itemCount === 0
                    ? 'No items added'
                    : `${queuedCount} item${queuedCount !== 1 ? 's' : ''} queued`}
                </Text>
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {isLive ? (
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                    onPress={() => router.push(`/auction/${auction.id}/live?role=broadcaster`)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>🔴 Rejoin Live</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{
                      flex: 1, backgroundColor: '#1A56DB', borderRadius: 10,
                      paddingVertical: 10, alignItems: 'center',
                      opacity: goingLive === auction.id ? 0.6 : 1,
                    }}
                    onPress={() => void handleGoLive(auction.id)}
                    disabled={goingLive === auction.id}
                  >
                    {goingLive === auction.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>🔴 Go Live</Text>
                    }
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{ backgroundColor: '#374151', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' }}
                  onPress={() => router.push(`/auction/${auction.id}`)}
                >
                  <Text style={{ color: '#9CA3AF', fontWeight: '600', fontSize: 13 }}>Manage</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Quick Live Modal */}
      <Modal visible={showQuickLive} transparent animationType="slide" onRequestClose={() => setShowQuickLive(false)}>
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, justifyContent: 'flex-end' }}
          >
            <TouchableOpacity
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }}
              activeOpacity={1}
              onPress={() => setShowQuickLive(false)}
            />
            <View style={{
              backgroundColor: '#1F2937',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 24, paddingBottom: 48,
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>🔴 Go Live Now</Text>
              <TouchableOpacity onPress={() => setShowQuickLive(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Live Title *
            </Text>
            <TextInput
              style={{
                backgroundColor: '#111827', borderRadius: 12,
                borderWidth: 1, borderColor: quickTitle.trim().length >= 2 ? '#1A56DB' : '#374151',
                padding: 14, color: '#fff', fontSize: 15, marginBottom: 24,
              }}
              placeholder="e.g. Weekend Sneaker Drop"
              placeholderTextColor="#4B5563"
              value={quickTitle}
              onChangeText={setQuickTitle}
              maxLength={100}
              autoFocus
            />

            {/* Cover Photo */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  color: '#9CA3AF', fontSize: 12, fontWeight: '600',
                  marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  Cover Photo
                </Text>
                <AuctionCoverSlot
                  onUploaded={setQuickCoverUrl}
                  onUploadingChange={setIsQuickCoverUploading}
                />
              </View>

              {/* Info */}
              <View style={{
                backgroundColor: '#111827', borderRadius: 12,
                padding: 14, marginBottom: 24,
                flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              }}>
              <Text style={{ fontSize: 16 }}>💡</Text>
              <Text style={{ color: '#6B7280', fontSize: 13, flex: 1 }}>
                Going live now will immediately create a room and let viewers join. Add items to your queue once you're live.
              </Text>
            </View>

            {/* Go Live button */}
            <TouchableOpacity
              style={{
                backgroundColor: quickTitle.trim().length >= 2 ? '#DC2626' : '#374151',
                borderRadius: 16, paddingVertical: 18, alignItems: 'center',
              }}
              onPress={() => void handleQuickLive()}
              disabled={quickTitle.trim().length < 2 || loading || isQuickCoverUploading}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>🔴 Start Live</Text>
              <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>You'll go live immediately</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── Go Live Confirmation Modal ── */}
      <Modal
        visible={showGoLiveConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowGoLiveConfirm(false);
          setPendingGoLiveId(null);
          setConfirmCoverUrl('');
          setIsConfirmCoverUploading(false);
        }}
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
                {(() => {
                  const auction = auctions.find(a => a.id === pendingGoLiveId);
                  return auction
                    ? `"${auction.title}" will go live and viewers will be able to join and bid.`
                    : 'Your auction will go live and viewers will be able to join.';
                })()}
              </Text>
            </View>

            {/* Cover Photo */}
            {(() => {
              const pendingAuction = auctions.find(a => a.id === pendingGoLiveId);
              const existingCover = (pendingAuction as any)?.coverImageUrl;
              if (existingCover && !confirmCoverUrl) {
                return (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Cover Photo
                    </Text>
                    <View style={{ position: 'relative', height: 100, borderRadius: 12, overflow: 'hidden' }}>
                      <Image source={{ uri: existingCover }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <TouchableOpacity
                        onPress={() => setConfirmCoverUrl('__replace__')}
                        style={{
                          position: 'absolute', bottom: 8, right: 8,
                          backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
                          paddingHorizontal: 10, paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }
              return (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Cover Photo
                  </Text>
                  <AuctionCoverSlot
                    onUploaded={setConfirmCoverUrl}
                    onUploadingChange={setIsConfirmCoverUploading}
                  />
                </View>
              );
            })()}

              {/* Checklist */}
              <View style={{
                backgroundColor: '#1F2937', borderRadius: 14,
                padding: 16, marginBottom: 24, gap: 10,
              }}>
              {(() => {
                const auction = auctions.find(a => a.id === pendingGoLiveId);
                const itemCount = auction?.shopItems.length ?? 0;
                return (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 16 }}>{itemCount > 0 ? '✅' : '⚠️'}</Text>
                      <Text style={{ color: itemCount > 0 ? '#10B981' : '#F59E0B', fontSize: 13 }}>
                        {itemCount > 0
                          ? `${itemCount} item${itemCount !== 1 ? 's' : ''} ready`
                          : 'No items added — you can add mid-live'}
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
                  </>
                );
              })()}
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={{
                backgroundColor: '#DC2626', borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 10,
              }}
              onPress={() => void confirmGoLive()}
              disabled={!!goingLive || isConfirmCoverUploading}
            >
              {goingLive ? (
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
              onPress={() => {
                setShowGoLiveConfirm(false);
                setPendingGoLiveId(null);
                setConfirmCoverUrl('');
                setIsConfirmCoverUploading(false);
              }}
            >
              <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>Not yet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}