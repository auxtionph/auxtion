import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';

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

const ROLE_COLOR: Record<Role, string> = {
  BUYER: '#6B7280',
  SELLER: '#1A56DB',
  ADMIN: '#A78BFA',
};

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    setLoading(true);
    void fetchUsers('', 1, false);
  }, [fetchUsers]);

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

    Alert.alert(
      `Change role: ${u.displayName}`,
      `Current role: ${u.role}`,
      [
        ...options.map(o => ({
          text: o.text,
          style: o.style,
          onPress: () => o.role && void changeRole(u, o.role),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  if (me?.role !== 'ADMIN') {
    return (
      <View
        className="flex-1 bg-[#0D1117] items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="text-white text-lg font-semibold mb-2">Not authorized</Text>
        <TouchableOpacity onPress={() => router.back()} className="bg-[#1A56DB] rounded-xl px-6 py-3 mt-4">
          <Text className="text-white font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0D1117]" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-2 pb-3 flex-row items-center gap-4">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg">Users</Text>
      </View>

      <View className="px-6 pb-3">
        <TextInput
          className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white"
          placeholder="Search by name or email"
          placeholderTextColor="#4B5563"
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">No users found.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color="#1A56DB" style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => {
            const busy = actioningId === item.id;
            return (
              <TouchableOpacity
                onPress={() => promptRoleChange(item)}
                disabled={busy}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3 flex-row items-center"
              >
                <View className="flex-1">
                  <Text className="text-white font-semibold text-base">{item.displayName}</Text>
                  <Text className="text-gray-500 text-sm">{item.email}</Text>
                  <Text className="text-gray-600 text-xs mt-1">
                    {item._count.sellerOrders} sold · {item._count.buyerOrders} bought
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color="#1A56DB" />
                ) : (
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ backgroundColor: ROLE_COLOR[item.role] + '22' }}
                  >
                    <Text className="text-xs font-semibold" style={{ color: ROLE_COLOR[item.role] }}>
                      {item.role}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
