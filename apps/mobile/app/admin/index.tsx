import { ScrollView, TouchableOpacity, View, Text, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { formatPHP } from '@auxtion/utils';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AdminScreen, AdminHeader, Eyebrow, StatTile, Card } from '../../src/theme/AdminUI';
import { A, AdminStatusTone } from '../../src/theme/admin';

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
  tone: AdminStatusTone;
  isMoney?: boolean;
  live?: boolean;
}

const STAT_CARDS: StatCard[] = [
  { key: 'totalUsers', label: 'Total Users', tone: 'accent' },
  { key: 'totalSellers', label: 'Sellers', tone: 'violet' },
  { key: 'liveAuctions', label: 'Live Now', tone: 'red', live: true },
  { key: 'totalOrders', label: 'Total Orders', tone: 'accent' },
  { key: 'completedOrders', label: 'Completed', tone: 'emerald' },
  { key: 'gmv', label: 'GMV', tone: 'amber', isMoney: true },
];

interface SectionLink {
  label: string;
  description: string;
  route: string;
  glyph: string;
  tone: AdminStatusTone;
  badgeKey?: keyof Stats;
}

const SECTIONS: SectionLink[] = [
  {
    label: 'Seller Applications',
    description: 'Review, approve, revoke',
    route: '/admin/applications',
    glyph: '▤',
    tone: 'accent',
    badgeKey: 'pendingApplications',
  },
  {
    label: 'Disputes',
    description: 'Resolve buyer & seller claims',
    route: '/admin/disputes',
    glyph: '⚠',
    tone: 'red',
    badgeKey: 'openDisputes',
  },
  {
    label: 'Users',
    description: 'Manage roles & access',
    route: '/admin/users',
    glyph: '◕',
    tone: 'violet',
  },
  {
    label: 'Orders',
    description: 'Platform-wide oversight',
    route: '/admin/orders',
    glyph: '▦',
    tone: 'emerald',
  },
];

const TONE_HEX: Record<AdminStatusTone, string> = {
  accent: A.color.accent,
  amber: A.color.amber,
  emerald: A.color.emerald,
  red: A.color.red,
  violet: A.color.violet,
  cyan: A.color.cyan,
  neutral: A.color.ink3,
};

export default function AdminHub() {
  const router = useRouter();
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
      <AdminScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: A.space.lg }}>
          <Text style={{ color: A.color.ink, fontSize: 17, fontWeight: '600', marginBottom: 8 }}>
            Not authorized
          </Text>
          <Text style={{ color: A.color.ink2, textAlign: 'center', marginBottom: 20 }}>
            This area is restricted to administrators.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ backgroundColor: A.color.accent, borderRadius: A.radius.md, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen>
      <AdminHeader title="Admin" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={A.color.accent} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={A.color.accent} />
          </View>
        ) : (
          <>
            <Eyebrow>OVERVIEW</Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: A.space.sm, paddingHorizontal: A.space.lg, marginBottom: A.space.lg }}>
              {STAT_CARDS.map(card => (
                <View key={card.key} style={{ width: '47.5%' }}>
                  <StatTile
                    label={card.label}
                    tone={card.tone}
                    live={card.live}
                    value={
                      stats
                        ? card.isMoney
                          ? formatPHP(stats[card.key])
                          : stats[card.key].toLocaleString()
                        : '—'
                    }
                  />
                </View>
              ))}
            </View>

            <Eyebrow>MANAGE</Eyebrow>
            <View style={{ paddingHorizontal: A.space.lg }}>
              {SECTIONS.map(section => {
                const badge = section.badgeKey && stats ? stats[section.badgeKey] : 0;
                const hex = TONE_HEX[section.tone];
                return (
                  <TouchableOpacity
                    key={section.route}
                    activeOpacity={0.85}
                    onPress={() => router.push(section.route as any)}
                    style={{ marginBottom: A.space.sm }}
                  >
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: A.space.md }}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 11,
                          backgroundColor: hex + '22',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 17, color: hex }}>{section.glyph}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: A.color.ink, fontSize: 15, fontWeight: '600' }}>{section.label}</Text>
                        <Text style={{ color: A.color.ink3, fontSize: 12.5, marginTop: 1 }}>{section.description}</Text>
                      </View>
                      {badge > 0 && (
                        <View
                          style={{
                            backgroundColor: A.color.red,
                            minWidth: 22,
                            height: 22,
                            borderRadius: 11,
                            paddingHorizontal: 6,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', fontFamily: A.mono }}>{badge}</Text>
                        </View>
                      )}
                      <Text style={{ color: A.color.ink3, fontSize: 18 }}>›</Text>
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </AdminScreen>
  );
}
