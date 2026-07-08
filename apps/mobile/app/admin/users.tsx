import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AdminScreen, AdminHeader, Card, Badge, Mono } from '../../src/theme/AdminUI';
import { A } from '../../src/theme/admin';

type Role = 'BUYER' | 'SELLER' | 'ADMIN';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  totalSales: number;
  isEmailVerified: boolean;
  createdAt: string;
  _count: { sellerOrders: number; buyerOrders: number };
}

const ROLE_TONE = { BUYER: 'neutral', SELLER: 'accent', ADMIN: 'violet' } as const;

export default function AdminUsersScreen() {
  const router = useRouter();
  const { user: me } = useAuthStore();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (searchTerm: string, pageNum: number, append: boolean) => {
    try {
      const res = await apiClient.get('/admin/users', {
        params: { search: searchTerm || undefined, page: pageNum, limit: 20 },
      });
      const data = res.data.data ?? res.data;
      const items = (data?.items ?? []) as AdminUser[];
      setUsers(prev => (append ? [...prev, ...items] : items));
      setHasMore(data?.meta?.hasMore ?? false);
      setPage(pageNum);
    } catch {
      if (!append) setUsers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { setLoading(true); void fetchUsers('', 1, false); }, [fetchUsers]);

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLoading(true);
      void fetchUsers(text, 1, false);
    }, 350);
  };

  const onEndReached = () => {
    if (hasMore && !loadingMore && !loading) {
      setLoadingMore(true);
      void fetchUsers(search, page + 1, true);
    }
  };

  const changeRole = async (u: AdminUser, role: Role) => {
    setActioningId(u.id);
    try {
      await apiClient.patch(`/admin/users/${u.id}/role`, { role });
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, role } : x)));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } } };
      const msg = Array.isArray(err.response?.data?.message)
        ? err.response!.data!.message!.join('\n')
        : err.response?.data?.message ?? 'Failed to change role';
      Alert.alert('Error', msg);
    } finally {
      setActioningId(null);
    }
  };

  const promptRoleChange = (u: AdminUser) => {
    if (u.id === me?.id) {
      Alert.alert('Not allowed', 'You cannot change your own role.');
      return;
    }
    const options: { text: string; role?: Role; style?: 'cancel' | 'destructive' }[] = [];
    if (u.role !== 'BUYER') options.push({ text: 'Set as Buyer', role: 'BUYER' });
    if (u.role !== 'SELLER') options.push({ text: 'Set as Seller', role: 'SELLER' });
    if (u.role !== 'ADMIN') options.push({ text: 'Set as Admin', role: 'ADMIN', style: 'destructive' });
    Alert.alert(`Change role: ${u.displayName}`, `Current role: ${u.role}`, [
      ...options.map(o => ({ text: o.text, style: o.style, onPress: () => o.role && void changeRole(u, o.role) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (me?.role !== 'ADMIN') {
    return (
      <AdminScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: A.space.lg }}>
          <Text style={{ color: A.color.ink, fontSize: 17, fontWeight: '600', marginBottom: 8 }}>Not authorized</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: A.color.accent, borderRadius: A.radius.md, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen>
      <AdminHeader title="Users" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: A.space.lg, paddingBottom: A.space.sm }}>
        <TextInput
          style={{
            backgroundColor: A.color.card,
            borderWidth: 1,
            borderColor: search ? A.color.accentLine : A.color.hairline,
            borderRadius: A.radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: A.color.ink,
            fontSize: 14,
          }}
          placeholder="Search by name or email"
          placeholderTextColor={A.color.ink3}
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={A.color.accent} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: A.space.lg, paddingBottom: 32 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Text style={{ color: A.color.ink3 }}>No users found.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={A.color.accent} style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            return (
              <TouchableOpacity
                onPress={() => promptRoleChange(item)}
                disabled={busy}
                activeOpacity={0.85}
                style={{ marginBottom: A.space.sm }}
              >
                <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: A.color.ink, fontSize: 15, fontWeight: '600' }}>{item.displayName}</Text>
                    <Text style={{ color: A.color.ink3, fontSize: 13, marginTop: 2 }}>{item.email}</Text>
                    <Mono style={{ fontSize: 11, color: A.color.ink3, marginTop: 4 }}>
                      {item._count.sellerOrders} sold · {item._count.buyerOrders} bought
                    </Mono>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={A.color.accent} />
                  ) : (
                    <Badge text={item.role} tone={ROLE_TONE[item.role]} />
                  )}
                </Card>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </AdminScreen>
  );
}
