import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { formatPHP } from '@auxtion/utils';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';

interface Stats {
  totalUsers: number;
  totalSellers: number;
  pendingApplications: number;
  openDisputes: number;
  liveAuctions: number;
  totalOrders: number;
  completedOrders: number;
  gmv: number;
}

interface StatCard {
  key: keyof Stats;
  label: string;
  symbol: SFSymbol;
  fallback: string;
  color: string;
  isMoney?: boolean;
}

const STAT_CARDS: StatCard[] = [
  { key: 'totalUsers', label: 'Total Users', symbol: 'person.2.fill' as SFSymbol, fallback: '👥', color: '#60A5FA' },
  { key: 'totalSellers', label: 'Sellers', symbol: 'storefront.fill' as SFSymbol, fallback: '🏪', color: '#1A56DB' },
  { key: 'liveAuctions', label: 'Live Now', symbol: 'dot.radiowaves.left.and.right' as SFSymbol, fallback: '🔴', color: '#EF4444' },
  { key: 'totalOrders', label: 'Total Orders', symbol: 'shippingbox.fill' as SFSymbol, fallback: '📦', color: '#A78BFA' },
  { key: 'completedOrders', label: 'Completed', symbol: 'checkmark.seal.fill' as SFSymbol, fallback: '✅', color: '#10B981' },
  { key: 'gmv', label: 'GMV', symbol: 'banknote.fill' as SFSymbol, fallback: '💰', color: '#F59E0B', isMoney: true },
];

interface SectionLink {
  label: string;
  description: string;
  route: string;
  symbol: SFSymbol;
  fallback: string;
  color: string;
  badgeKey?: keyof Stats;
}

const SECTIONS: SectionLink[] = [
  {
    label: 'Seller Applications',
    description: 'Review, approve, reject, revoke',
    route: '/admin/applications',
    symbol: 'doc.text.fill' as SFSymbol,
    fallback: '📄',
    color: '#1A56DB',
    badgeKey: 'pendingApplications',
  },
  {
    label: 'Disputes',
    description: 'Resolve buyer/seller disputes',
    route: '/admin/disputes',
    symbol: 'exclamationmark.bubble.fill' as SFSymbol,
    fallback: '⚠️',
    color: '#EF4444',
    badgeKey: 'openDisputes',
  },
  {
    label: 'Users',
    description: 'Manage roles and access',
    route: '/admin/users',
    symbol: 'person.3.fill' as SFSymbol,
    fallback: '👥',
    color: '#A78BFA',
  },
  {
    label: 'Orders',
    description: 'Platform-wide order oversight',
    route: '/admin/orders',
    symbol: 'shippingbox.fill' as SFSymbol,
    fallback: '📦',
    color: '#10B981',
  },
];

export default function AdminHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/stats');
      setStats((res.data.data ?? res.data) as Stats);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (user?.role !== 'ADMIN') {
    return (
      <View
        className="flex-1 bg-[#0D1117] items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-white text-lg font-semibold mb-2">Not authorized</Text>
        <Text className="text-gray-400 text-center mb-6">This area is restricted to administrators.</Text>
        <TouchableOpacity onPress={() => router.back()} className="bg-[#1A56DB] rounded-xl px-6 py-3">
          <Text className="text-white font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0D1117]" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-2 pb-4 flex-row items-center gap-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-white font-bold text-xl">Admin</Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56DB" />}
      >
        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#1A56DB" />
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap justify-between mb-2">
              {STAT_CARDS.map(card => (
                <View
                  key={card.key}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3"
                  style={{ width: '48%' }}
                >
                  <View className="flex-row items-center gap-2 mb-2">
                    {Platform.OS === 'ios' ? (
                      <SymbolView name={card.symbol} size={16} tintColor={card.color} />
                    ) : (
                      <Text style={{ fontSize: 14 }}>{card.fallback}</Text>
                    )}
                    <Text className="text-gray-500 text-xs">{card.label}</Text>
                  </View>
                  <Text className="text-white font-bold text-xl">
                    {stats
                      ? card.isMoney
                        ? formatPHP(stats[card.key])
                        : stats[card.key].toLocaleString()
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>

            <Text className="text-gray-500 text-xs font-semibold mt-4 mb-3 uppercase tracking-wide">
              Management
            </Text>

            {SECTIONS.map(section => {
              const badge = section.badgeKey && stats ? stats[section.badgeKey] : 0;
              return (
                <TouchableOpacity
                  key={section.route}
                  onPress={() => router.push(section.route as any)}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3 flex-row items-center"
                >
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: section.color + '22' }}
                  >
                    {Platform.OS === 'ios' ? (
                      <SymbolView name={section.symbol} size={20} tintColor={section.color} />
                    ) : (
                      <Text style={{ fontSize: 18 }}>{section.fallback}</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">{section.label}</Text>
                    <Text className="text-gray-500 text-sm">{section.description}</Text>
                  </View>
                  {badge > 0 && (
                    <View className="bg-[#EF4444] rounded-full min-w-6 h-6 px-2 items-center justify-center mr-2">
                      <Text className="text-white text-xs font-bold">{badge}</Text>
                    </View>
                  )}
                  <Text className="text-gray-600 text-lg">›</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
