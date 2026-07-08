import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';
import { useAuthStore } from '../../src/stores/auth.store';
import { AdminScreen, AdminHeader, Card, Badge, Tab } from '../../src/theme/AdminUI';
import { A, AdminStatusTone } from '../../src/theme/admin';

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
  user: { id: string; email: string; displayName: string; createdAt: string };
}

const STATUS_TABS: { label: string; value: AppStatus }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const STATUS_TONE: Record<AppStatus, AdminStatusTone> = {
  PENDING: 'amber',
  APPROVED: 'emerald',
  REJECTED: 'red',
};

export default function AdminApplicationsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AppStatus>('PENDING');
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async (status: AppStatus) => {
    try {
      const res = await apiClient.get('/seller-applications', { params: { status } });
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

  useEffect(() => { setLoading(true); void load(activeTab); }, [activeTab, load]);
  const onRefresh = useCallback(() => { setRefreshing(true); void load(activeTab); }, [activeTab, load]);

  const review = async (id: string, status: 'APPROVED' | 'REJECTED', rejectedReason?: string) => {
    setActioningId(id);
    try {
      await apiClient.patch(`/seller-applications/${id}/review`, {
        status, ...(rejectedReason ? { rejectedReason } : {}),
      });
      setApps(prev => prev.filter(a => a.id !== id));
      setExpandedId(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } } };
      const msg = Array.isArray(err.response?.data?.message)
        ? err.response!.data!.message!.join('\n')
        : err.response?.data?.message ?? 'Action failed';
      Alert.alert('Error', msg);
    } finally { setActioningId(null); }
  };

  const confirmApprove = (app: Application) => {
    Alert.alert('Approve Application', `Approve ${app.fullName} (${app.user.email}) as a seller?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => void review(app.id, 'APPROVED') },
    ]);
  };

  const confirmReject = (app: Application) => {
    Alert.prompt('Reject Application', `Reason for rejecting ${app.fullName}? (shown to applicant)`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: (reason?: string) => {
        if (!reason?.trim()) { Alert.alert('Reason required', 'You must provide a rejection reason.'); return; }
        void review(app.id, 'REJECTED', reason.trim());
      }},
    ], 'plain-text');
  };

  if (user?.role !== 'ADMIN') {
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
      <AdminHeader title="Applications" onBack={() => router.back()} />

      <View style={{ flexDirection: 'row', paddingHorizontal: A.space.lg, gap: 8, marginBottom: A.space.sm }}>
        {STATUS_TABS.map(tab => (
          <Tab key={tab.value} label={tab.label} on={activeTab === tab.value} onPress={() => setActiveTab(tab.value)} />
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={A.color.accent} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: A.space.lg, paddingTop: 8, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={A.color.accent} />}
        >
          {apps.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 80 }}>
              <Text style={{ color: A.color.ink3 }}>No {activeTab.toLowerCase()} applications.</Text>
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
                  style={{ marginBottom: A.space.sm }}
                >
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: A.color.ink, fontSize: 15, fontWeight: '600' }}>{app.fullName}</Text>
                        <Text style={{ color: A.color.ink3, fontSize: 13, marginTop: 2 }}>{app.user.email}</Text>
                      </View>
                      <Badge text={app.status} tone={STATUS_TONE[app.status]} />
                    </View>

                    {expanded && (
                      <View style={{ marginTop: 16, gap: 12 }}>
                        {app.idImageUrl ? (
                          <Image
                            source={{ uri: app.idImageUrl }}
                            style={{ width: '100%', height: 200, borderRadius: A.radius.md }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ height: 200, backgroundColor: A.color.raised, borderRadius: A.radius.md, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: A.color.ink3, fontSize: 13 }}>No ID photo</Text>
                          </View>
                        )}

                        <View style={{ gap: 6 }}>
                          <DetailRow label="ID Type" value={app.idType ?? '—'} />
                          <DetailRow label="ID Number" value={app.idNumberMasked ?? '—'} />
                          <DetailRow label="Contact" value={app.contactNo} />
                          <DetailRow label="Payout" value={app.payoutInfo} />
                          <DetailRow label="Details" value={app.description} />
                          <DetailRow label="Applied" value={new Date(app.createdAt).toLocaleDateString()} />
                        </View>

                        {app.status === 'REJECTED' && app.rejectedReason && (
                          <View style={{ backgroundColor: A.color.red + '15', borderWidth: 1, borderColor: A.color.red + '30', borderRadius: A.radius.md, padding: 12 }}>
                            <Text style={{ color: A.color.red, fontSize: 13 }}>Reason: {app.rejectedReason}</Text>
                          </View>
                        )}

                        {app.status === 'APPROVED' && (
                          <TouchableOpacity
                            disabled={busy}
                            onPress={() => {
                              Alert.prompt('Revoke Seller', `Why is ${app.fullName}'s seller status being revoked?`, [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Revoke', style: 'destructive', onPress: async (reason?: string) => {
                                  if (!reason?.trim()) { Alert.alert('Reason required', 'You must provide a revocation reason.'); return; }
                                  setActioningId(app.id);
                                  try {
                                    await apiClient.patch(`/seller-applications/${app.id}/revoke`, { reason: reason.trim() });
                                    setApps(prev => prev.filter(a => a.id !== app.id));
                                    setExpandedId(null);
                                  } catch { Alert.alert('Error', 'Failed to revoke seller.'); }
                                  finally { setActioningId(null); }
                                }},
                              ], 'plain-text');
                            }}
                            style={{ borderRadius: A.radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: A.color.raised, borderWidth: 1, borderColor: A.color.red + '50' }}
                          >
                            {busy ? <ActivityIndicator color={A.color.red} /> : <Text style={{ color: A.color.red, fontWeight: '600' }}>Revoke Seller Status</Text>}
                          </TouchableOpacity>
                        )}

                        {app.status === 'PENDING' && (
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                            <TouchableOpacity
                              disabled={busy}
                              onPress={() => confirmReject(app)}
                              style={{ flex: 1, borderRadius: A.radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: A.color.raised, borderWidth: 1, borderColor: A.color.red + '50' }}
                            >
                              {busy ? <ActivityIndicator color={A.color.red} /> : <Text style={{ color: A.color.red, fontWeight: '600' }}>Reject</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={busy}
                              onPress={() => confirmApprove(app)}
                              style={{ flex: 1, borderRadius: A.radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: A.color.emerald }}
                            >
                              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Approve</Text>}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </AdminScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ color: A.color.ink3, fontSize: 13, width: 90 }}>{label}</Text>
      <Text style={{ color: A.color.ink2, fontSize: 13, flex: 1 }}>{value}</Text>
    </View>
  );
}
