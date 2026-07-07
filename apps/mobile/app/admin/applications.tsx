import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';

type AppStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Application {
  id: string;
  fullName: string;
  idImageUrl: string | null;
  idType: string | null;
  idNumberMasked: string | null;
  contactNo: string;
  description: string;
  payoutInfo: string;
  status: AppStatus;
  rejectedReason: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
  };
}

const STATUS_TABS: AppStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

const STATUS_COLOR: Record<AppStatus, string> = {
  PENDING: '#F59E0B',
  APPROVED: '#10B981',
  REJECTED: '#EF4444',
};

export default function AdminApplicationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<AppStatus>('PENDING');
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async (status: AppStatus) => {
    try {
      const res = await apiClient.get('/seller-applications', {
        params: { status },
      });
      const data = (res.data.data ?? res.data ?? []) as Application[];
      setApps(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'Could not load applications.');
      setApps([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(activeTab);
  }, [activeTab, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(activeTab);
  }, [activeTab, load]);

  const review = async (id: string, status: 'APPROVED' | 'REJECTED', rejectedReason?: string) => {
    setActioningId(id);
    try {
      await apiClient.patch(`/seller-applications/${id}/review`, {
        status,
        ...(rejectedReason ? { rejectedReason } : {}),
      });
      setApps(prev => prev.filter(a => a.id !== id));
      setExpandedId(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } } };
      const msg = Array.isArray(err.response?.data?.message)
        ? err.response!.data!.message!.join('\n')
        : err.response?.data?.message ?? 'Action failed';
      Alert.alert('Error', msg);
    } finally {
      setActioningId(null);
    }
  };

  const confirmApprove = (app: Application) => {
    Alert.alert(
      'Approve Application',
      `Approve ${app.fullName} (${app.user.email}) as a seller?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => void review(app.id, 'APPROVED') },
      ],
    );
  };

  const confirmReject = (app: Application) => {
    Alert.prompt(
      'Reject Application',
      `Reason for rejecting ${app.fullName}? (shown to applicant)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: (reason?: string) => {
            if (!reason || !reason.trim()) {
              Alert.alert('Reason required', 'You must provide a rejection reason.');
              return;
            }
            void review(app.id, 'REJECTED', reason.trim());
          },
        },
      ],
      'plain-text',
    );
  };

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
        <Text className="text-white font-bold text-lg">Seller Applications</Text>
      </View>

      <View className="flex-row px-6 gap-2 mb-2">
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 rounded-xl py-2.5 items-center ${
              activeTab === tab ? 'bg-[#1A56DB]' : 'bg-gray-900 border border-gray-700'
            }`}
          >
            <Text className={`text-xs font-semibold ${activeTab === tab ? 'text-white' : 'text-gray-400'}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A56DB" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56DB" />}
        >
          {apps.length === 0 ? (
            <View className="items-center justify-center py-20">
              <Text className="text-gray-500">No {activeTab.toLowerCase()} applications.</Text>
            </View>
          ) : (
            apps.map(app => {
              const expanded = expandedId === app.id;
              const busy = actioningId === app.id;
              return (
                <TouchableOpacity
                  key={app.id}
                  activeOpacity={0.9}
                  onPress={() => setExpandedId(expanded ? null : app.id)}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-white font-semibold text-base">{app.fullName}</Text>
                      <Text className="text-gray-500 text-sm">{app.user.email}</Text>
                    </View>
                    <View
                      className="rounded-full px-3 py-1"
                      style={{ backgroundColor: STATUS_COLOR[app.status] + '22' }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: STATUS_COLOR[app.status] }}>
                        {app.status}
                      </Text>
                    </View>
                  </View>

                  {expanded && (
                    <View className="mt-4 gap-3">
                      {app.idImageUrl ? (
                        <Image
                          source={{ uri: app.idImageUrl }}
                          style={{ width: '100%', height: 200, borderRadius: 12 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="bg-gray-800 rounded-xl items-center justify-center" style={{ height: 200 }}>
                          <Text className="text-gray-500 text-sm">No ID photo</Text>
                        </View>
                      )}

                      <View className="gap-1.5">
                        <DetailRow label="ID Type" value={app.idType ?? '—'} />
                        <DetailRow label="ID Number" value={app.idNumberMasked ?? '—'} />
                        <DetailRow label="Contact" value={app.contactNo} />
                        <DetailRow label="Payout" value={app.payoutInfo} />
                        <DetailRow label="Details" value={app.description} />
                        <DetailRow label="Applied" value={new Date(app.createdAt).toLocaleDateString()} />
                      </View>

                      {app.status === 'REJECTED' && app.rejectedReason && (
                        <View className="bg-red-900/20 border border-red-800/40 rounded-xl p-3">
                          <Text className="text-red-400 text-sm">Reason: {app.rejectedReason}</Text>
                        </View>
                      )}

                      {app.status === 'APPROVED' && (
                        <View className="mt-1">
                          <TouchableOpacity
                            disabled={busy}
                            onPress={() => {
                              Alert.prompt(
                                'Revoke Seller',
                                `Why is ${app.fullName}'s seller status being revoked? (shown to user)`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Revoke',
                                    style: 'destructive',
                                    onPress: async (reason?: string) => {
                                      if (!reason || !reason.trim()) {
                                        Alert.alert('Reason required', 'You must provide a revocation reason.');
                                        return;
                                      }
                                      setActioningId(app.id);
                                      try {
                                        await apiClient.patch(
                                          `/seller-applications/${app.id}/revoke`,
                                          { reason: reason.trim() },
                                        );
                                        setApps(prev => prev.filter(a => a.id !== app.id));
                                        setExpandedId(null);
                                      } catch {
                                        Alert.alert('Error', 'Failed to revoke seller.');
                                      } finally {
                                        setActioningId(null);
                                      }
                                    },
                                  },
                                ],
                                'plain-text',
                              );
                            }}
                            className="rounded-xl py-3 items-center bg-gray-800 border border-red-800/50"
                          >
                            {busy ? (
                              <ActivityIndicator color="#EF4444" />
                            ) : (
                              <Text className="text-red-400 font-semibold">Revoke Seller Status</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      {app.status === 'PENDING' && (
                        <View className="flex-row gap-3 mt-1">
                          <TouchableOpacity
                            disabled={busy}
                            onPress={() => confirmReject(app)}
                            className="flex-1 rounded-xl py-3 items-center bg-gray-800 border border-red-800/50"
                          >
                            {busy ? (
                              <ActivityIndicator color="#EF4444" />
                            ) : (
                              <Text className="text-red-400 font-semibold">Reject</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            disabled={busy}
                            onPress={() => confirmApprove(app)}
                            className="flex-1 rounded-xl py-3 items-center bg-[#10B981]"
                          >
                            {busy ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text className="text-white font-semibold">Approve</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row">
      <Text className="text-gray-500 text-sm w-24">{label}</Text>
      <Text className="text-gray-300 text-sm flex-1">{value}</Text>
    </View>
  );
}
