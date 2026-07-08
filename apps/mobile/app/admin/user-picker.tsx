import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../src/services/api/client';
import { AdminScreen, Card, Badge } from '../../src/theme/AdminUI';
import { A } from '../../src/theme/admin';

type Role = 'BUYER' | 'SELLER' | 'ADMIN';
const ROLE_TONE = { BUYER: 'neutral', SELLER: 'accent', ADMIN: 'violet' } as const;

interface PickUser { id: string; displayName: string; email: string; role: Role; }

export default function UserPickerModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<PickUser[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (term: string) => {
    try {
      const res = await apiClient.get('/admin/users', { params: { search: term || undefined, page: 1, limit: 30 } });
      const data = res.data.data ?? res.data;
      setUsers((data?.items ?? []) as PickUser[]);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setLoading(true); void fetchUsers(''); }, [fetchUsers]);

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setLoading(true);
    searchTimer.current = setTimeout(() => void fetchUsers(text), 350);
  };

  const pick = (u: PickUser) => {
    router.back();
    router.setParams({});
    router.replace({ pathname: '/admin/orders', params: { filterUserId: u.id, filterUserName: u.displayName } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: A.color.surface, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: A.space.lg, paddingTop: 8, paddingBottom: A.space.lg }}>
        <Text style={{ color: A.color.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>Filter by user</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: A.color.accent, fontSize: 15, fontWeight: '500' }}>Cancel</Text>
        </TouchableOpacity>
      </View>

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
          autoFocus
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: A.space.lg, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Text style={{ color: A.color.ink3 }}>No users found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => pick(item)} activeOpacity={0.85} style={{ marginBottom: A.space.sm }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: A.color.ink, fontSize: 15, fontWeight: '600' }}>{item.displayName}</Text>
                  <Text style={{ color: A.color.ink3, fontSize: 13, marginTop: 2 }}>{item.email}</Text>
                </View>
                <Badge text={item.role} tone={ROLE_TONE[item.role]} />
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
