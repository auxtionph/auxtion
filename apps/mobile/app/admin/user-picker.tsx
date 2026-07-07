import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../src/services/api/client';

type Role = 'BUYER' | 'SELLER' | 'ADMIN';

interface PickUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

const ROLE_COLOR: Record<Role, string> = {
  BUYER: '#6B7280',
  SELLER: '#1A56DB',
  ADMIN: '#A78BFA',
};

export default function UserPickerModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<PickUser[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (term: string) => {
    try {
      const res = await apiClient.get('/admin/users', {
        params: { search: term || undefined, page: 1, limit: 30 },
      });
      const data = res.data.data ?? res.data;
      setUsers((data?.items ?? []) as PickUser[]);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchUsers('');
  }, [fetchUsers]);

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setLoading(true);
    searchTimer.current = setTimeout(() => {
      void fetchUsers(text);
    }, 350);
  };

  const pick = (u: PickUser) => {
    router.back();
    router.setParams({}); // no-op guard
    // Pass selection back to orders screen via navigation params
    router.replace({
      pathname: '/admin/orders',
      params: { filterUserId: u.id, filterUserName: u.displayName },
    });
  };

  return (
    <View className="flex-1 bg-[#0D1117]" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-2 pb-3 flex-row items-center justify-between">
        <Text className="text-white font-bold text-lg">Filter by User</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">Cancel</Text>
        </TouchableOpacity>
      </View>

      <View className="px-6 pb-3">
        <TextInput
          className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white"
          placeholder="Search by name or email"
          placeholderTextColor="#4B5563"
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoFocus
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">No users found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => pick(item)}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3 flex-row items-center"
            >
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">{item.displayName}</Text>
                <Text className="text-gray-500 text-sm">{item.email}</Text>
              </View>
              <View
                className="rounded-full px-3 py-1"
                style={{ backgroundColor: ROLE_COLOR[item.role] + '22' }}
              >
                <Text className="text-xs font-semibold" style={{ color: ROLE_COLOR[item.role] }}>
                  {item.role}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
