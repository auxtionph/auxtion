import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { apiClient } from '@/services/api/client';

interface Address {
  id: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
}

export default function AddressListScreen() {
  const insets = useSafeAreaInsets();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId]       = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await apiClient.get('/users/me/addresses');
      setAddresses(res.data.data ?? []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchAddresses();
    }, [fetchAddresses]),
  );

  const handleSetDefault = async (id: string) => {
    setBusyId(id);
    try {
      await apiClient.patch(`/users/me/addresses/${id}/default`);
      void fetchAddresses();
    } catch {
      Alert.alert('Error', 'Could not set default address.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (address: Address) => {
    Alert.alert(
      'Remove Address',
      `Remove "${address.name}'s" address? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(address.id);
            try {
              await apiClient.delete(`/users/me/addresses/${address.id}`);
              void fetchAddresses();
            } catch {
              Alert.alert('Error', 'Could not remove address.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <SymbolView name="chevron.left" size={20} tintColor="#E5E7EB" weight="semibold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shipping Addresses</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void fetchAddresses(); }}
            tintColor="#A78BFA"
          />
        }
      >
        {loading ? (
          <ActivityIndicator color="#A78BFA" style={{ marginTop: 64 }} />
        ) : addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <SymbolView name="shippingbox.fill" size={28} tintColor="#A78BFA" />
            </View>
            <Text style={styles.emptyTitle}>No addresses yet</Text>
            <Text style={styles.emptySubtitle}>
              Add a shipping address so sellers know where to send your wins.
            </Text>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.card}>
              {addr.isDefault && (
                <View style={styles.defaultBadge}>
                  <SymbolView name="checkmark.circle.fill" size={11} tintColor="#10B981" weight="semibold" />
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              )}

              <Text style={styles.cardName}>{addr.name}</Text>
              <Text style={styles.cardPhone}>{addr.phone}</Text>
              <Text style={styles.cardAddress} numberOfLines={2}>
                {addr.line1}, {addr.city}, {addr.province} {addr.postalCode}
              </Text>

              <View style={styles.cardActions}>
                {!addr.isDefault && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleSetDefault(addr.id)}
                    disabled={busyId === addr.id}
                  >
                    {busyId === addr.id ? (
                      <ActivityIndicator size="small" color="#A78BFA" />
                    ) : (
                      <Text style={styles.actionBtnText}>Set as Default</Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(`/profile/address-form?id=${addr.id}` as any)}
                >
                  <SymbolView name="pencil" size={13} tintColor="#9CA3AF" weight="semibold" />
                  <Text style={styles.actionBtnTextSecondary}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDelete(addr)}
                  disabled={busyId === addr.id}
                >
                  <SymbolView name="trash" size={13} tintColor="#EF4444" weight="semibold" />
                  <Text style={styles.actionBtnTextDanger}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/profile/address-form' as any)}
          activeOpacity={0.85}
        >
          <SymbolView name="plus" size={15} tintColor="#A78BFA" weight="semibold" />
          <Text style={styles.addBtnText}>Add New Address</Text>
        </TouchableOpacity>

        <View style={styles.trustRow}>
          <SymbolView name="lock.fill" size={11} tintColor="#4B5563" />
          <Text style={styles.trustText}>Only shared with sellers of items you win</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const DIVIDER = 'rgba(255,255,255,0.06)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F17' },

  header: {
    backgroundColor: '#0B0F17',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#F9FAFB', letterSpacing: -0.3 },
  headerSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },

  emptyState: { alignItems: 'center', paddingTop: 56, gap: 12, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(167,139,250,0.10)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.18)',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#F9FAFB' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: '#10172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
  },
  defaultBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 10,
  },
  defaultBadgeText: { color: '#10B981', fontSize: 10.5, fontWeight: '700' },

  cardName: { fontSize: 15.5, fontWeight: '700', color: '#F9FAFB' },
  cardPhone: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  cardAddress: { fontSize: 13, color: '#6B7280', marginTop: 6, lineHeight: 18 },

  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DIVIDER,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11,
  },
  actionBtnText: { color: '#A78BFA', fontSize: 12.5, fontWeight: '700' },
  actionBtnTextSecondary: { color: '#9CA3AF', fontSize: 12.5, fontWeight: '600' },
  actionBtnTextDanger: { color: '#EF4444', fontSize: 12.5, fontWeight: '600' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)', borderStyle: 'dashed',
    borderRadius: 14, paddingVertical: 15,
    marginTop: 4,
  },
  addBtnText: { color: '#A78BFA', fontSize: 14.5, fontWeight: '700' },

  trustRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: 8,
  },
  trustText: { fontSize: 11, color: '#4B5563', fontWeight: '500', letterSpacing: -0.05 },
});