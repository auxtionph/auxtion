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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';
import { auctionsApi, SellerAuction } from '../../src/services/api/auctions.api';

export default function SellScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSeller = user?.role === 'SELLER';

  const [auctions, setAuctions] = useState<SellerAuction[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [goingLive, setGoingLive] = useState<string | null>(null);
  const [showQuickLive, setShowQuickLive] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

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

  const handleGoLive = async (auctionId: string) => {
    setGoingLive(auctionId);
    try {
      await auctionsApi.goLive(auctionId);
      router.push(`/auction/${auctionId}/live?role=broadcaster`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to go live.');
    } finally {
      setGoingLive(null);
    }
  };

  const handleQuickLive = async () => {
    if (!quickTitle.trim()) return;
    setLoading(true);
    setShowQuickLive(false);
    try {
      const res = await apiClient.post('/auctions', {
        title: quickTitle.trim(),
        startTime: new Date().toISOString(),
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
              disabled={quickTitle.trim().length < 2 || loading}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>🔴 Start Live</Text>
              <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 2 }}>You'll go live immediately</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}