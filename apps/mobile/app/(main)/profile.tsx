import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';

// ── Cross-platform icon (SF Symbol on iOS, text fallback on Android) ─────────
function Icon({
  symbol,
  fallback,
  size = 20,
  tint = '#6B7280',
}: {
  symbol: SFSymbol;
  fallback: string;
  size?: number;
  tint?: string;
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={symbol}
        size={size}
        tintColor={tint}
        weight="semibold"
        type="hierarchical"
      />
    );
  }
  return <Text style={{ fontSize: size - 4, color: tint }}>{fallback}</Text>;
}

// ── Segmented completion arc ─────────────────────────────────────────────────
function CompletionArc({
  pct,
  initial,
  color,
}: {
  pct: number;
  initial: string;
  color: string;
}) {
  const r = 54;
  const circumference = 2 * Math.PI * r; // ~339.3
  const segments = 12;
  const segLen = circumference / segments;   // ~28.3
  const gap = 5;
  const dash = segLen - gap;               // ~23.3
  const filledSegments = Math.round((pct / 100) * segments);
  const filledLen = filledSegments * segLen;
  const emptyLen = circumference - filledLen;

  return (
    <View style={{ position: 'relative', width: 120, height: 120, marginBottom: 14 }}>
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute' }}>
        {/* Track */}
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke="#1F2937"
          strokeWidth="5"
        />
        {/* Filled arc */}
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset="0"
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{
            strokeDasharray: `${filledLen > 0 ? dash : 0} ${gap}`,
            // clip to pct using a second dasharray trick
          }}
        />
        {/* Avatar bg */}
        <circle cx="60" cy="60" r="48" fill="#1A56DB" />
        <text
          x="60" y="70"
          textAnchor="middle"
          fontSize="30"
          fontWeight="800"
          fill="#fff"
          fontFamily="system-ui"
        >
          {initial}
        </text>
      </svg>
      {/* Badge */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        alignSelf: 'center',
        left: 0, right: 0,
        alignItems: 'center',
      }}>
        <View style={{
          backgroundColor: color,
          borderRadius: 8,
          paddingHorizontal: 9,
          paddingVertical: 2,
          borderWidth: 2,
          borderColor: '#0D1117',
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
            {pct}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Profile status ────────────────────────────────────────────────────────────
interface ProfileStatus {
  isComplete: boolean;
  hasAddress: boolean;
  hasPaymentMethod: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────
type Screen = 'main' | 'edit';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, clearAuth, setAuth, accessToken } = useAuthStore();

  const [screen, setScreen] = useState<Screen>('main');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);

  const isSeller = user?.role === 'SELLER';

  const fetchProfileStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/users/me/profile-status');
      setProfileStatus(res.data.data as ProfileStatus);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    void fetchProfileStatus();
  }, [fetchProfileStatus]);

  const completionPct = (() => {
    if (!profileStatus) return 0;
    let pct = 0;
    if (profileStatus.hasAddress) pct += 50;
    if (profileStatus.hasPaymentMethod) pct += 50;
    return pct;
  })();

  const arcColor =
    completionPct === 100 ? '#10B981' :
    completionPct >= 50   ? '#F59E0B' :
                            '#EF4444';

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.patch('/users/me', {
        displayName: displayName.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      const updatedUser = response.data.data as typeof user;
      if (updatedUser && accessToken) {
        const SecureStore = await import('expo-secure-store');
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        await setAuth(updatedUser, accessToken, refreshToken ?? '');
      }
      Alert.alert('Saved', 'Profile updated', [
        { text: 'OK', onPress: () => setScreen('main') },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // ── EDIT SCREEN ──────────────────────────────────────────────────────────
  if (screen === 'edit') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
        {/* Header */}
        <View style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderBottomWidth: 1,
          borderColor: '#1F2937',
        }}>
          <TouchableOpacity
            onPress={() => setScreen('main')}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: '#1F2937',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon symbol="chevron.left" fallback="←" size={18} tint="#fff" />
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18, flex: 1 }}>
            Edit Profile
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: '#1A56DB',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 10,
            }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity>
              <Text style={{ color: '#60A5FA', fontSize: 13, fontWeight: '600' }}>
                Change Photo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Display name */}
          <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
          <View style={[styles.fieldWrap, { borderColor: displayName ? '#1A56DB' : '#1F2937' }]}>
            <TextInput
              style={styles.fieldInput}
              placeholder="Your display name"
              placeholderTextColor="#374151"
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          {/* Email (read-only) */}
          <Text style={styles.fieldLabel}>EMAIL</Text>
          <View style={[styles.fieldWrap, { borderColor: '#1F2937', backgroundColor: '#0F1419', marginBottom: 6 }]}>
            <Text style={{ color: '#4B5563', fontSize: 15, paddingVertical: 14 }}>
              {user?.email}
            </Text>
          </View>
          <Text style={{ color: '#4B5563', fontSize: 11, marginBottom: 20 }}>
            Email cannot be changed
          </Text>

          {/* Phone */}
          <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
          <View style={[styles.fieldWrap, { borderColor: phone ? '#1A56DB' : '#1F2937' }]}>
            <TextInput
              style={styles.fieldInput}
              placeholder="+63 9XX XXX XXXX"
              placeholderTextColor="#374151"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          {/* Save */}
          <TouchableOpacity
            style={{
              backgroundColor: '#1A56DB',
              borderRadius: 14, paddingVertical: 16,
              alignItems: 'center', marginTop: 8,
              opacity: saving ? 0.6 : 1,
            }}
            onPress={() => void handleSaveProfile()}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save Changes</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── MAIN SCREEN ──────────────────────────────────────────────────────────
  const quickActions = isSeller
    ? [
        { symbol: 'building.storefront.fill' as SFSymbol, fallback: '🏪', label: 'My Shop', color: '#1A56DB', bg: '#1A56DB22', action: () => router.push('/seller/shop' as any) },
        { symbol: 'shippingbox.fill' as SFSymbol, fallback: '📦', label: 'My Orders', color: '#A78BFA', bg: '#7C3AED22', action: () => router.push('/(main)/activity') },
        { symbol: 'shippingbox.and.arrow.backward.fill' as SFSymbol, fallback: '🚚', label: 'Shipments', color: '#10B981', bg: '#10B98122', action: () => router.push('/seller/orders' as any) },
        { symbol: 'creditcard.fill' as SFSymbol, fallback: '💳', label: 'Payments', color: '#F59E0B', bg: '#F59E0B22', action: () => router.push('/seller/payment-settings' as any) },
      ]
    : [
        { symbol: 'shippingbox.fill' as SFSymbol, fallback: '📦', label: 'My Orders', color: '#60A5FA', bg: '#1A56DB22', action: () => router.push('/(main)/activity') },
        { symbol: 'bell.fill' as SFSymbol, fallback: '🔔', label: 'Activity', color: '#A78BFA', bg: '#7C3AED22', action: () => router.push('/(main)/activity') },
        { symbol: 'mappin.circle.fill' as SFSymbol, fallback: '📍', label: 'Address', color: '#10B981', bg: '#10B98122', action: () => router.push('/profile/address' as any) },
        { symbol: 'creditcard.fill' as SFSymbol, fallback: '💳', label: 'Payment', color: '#F59E0B', bg: '#F59E0B22', action: () => router.push('/seller/payment-settings' as any) },
      ];

  const settingsItems = [
    { symbol: 'pencil' as SFSymbol, fallback: '✏️', label: 'Edit Profile', action: () => setScreen('edit') },
    { symbol: 'mappin.and.ellipse' as SFSymbol, fallback: '📍', label: 'Shipping Address', action: () => router.push('/profile/address' as any) },
    { symbol: 'creditcard' as SFSymbol, fallback: '💳', label: 'Payment Methods', action: () => router.push('/seller/payment-settings' as any) },
    ...(!isSeller ? [{
      symbol: 'building.storefront' as SFSymbol,
      fallback: '🏪',
      label: 'Become a Seller',
      action: () => router.push('/seller/shop' as any),
    }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* Header */}
        <View style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>Profile</Text>
          <TouchableOpacity
            onPress={() => setScreen('edit')}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: '#1F2937',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon symbol="gearshape" fallback="⚙️" size={17} tint="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Avatar + arc */}
        <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 20 }}>
          {/* SVG arc ring */}
          <View style={{ width: 120, height: 120, marginBottom: 14, position: 'relative' }}>
            {completionPct === 100 ? (
              <ArcRing pct={100} color="#10B981" initial={user?.displayName?.charAt(0).toUpperCase() ?? '?'} />
            ) : completionPct >= 50 ? (
              <ArcRing pct={50} color="#F59E0B" initial={user?.displayName?.charAt(0).toUpperCase() ?? '?'} />
            ) : (
              <ArcRing pct={0} color="#EF4444" initial={user?.displayName?.charAt(0).toUpperCase() ?? '?'} />
            )}
          </View>

          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20, marginBottom: 2 }}>
            {user?.displayName}
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 10 }}>
            {user?.email}
          </Text>

          <View style={{
            borderRadius: 999,
            paddingHorizontal: 10, paddingVertical: 3,
            borderWidth: 1,
            borderColor: isSeller ? '#1A56DB55' : '#6B758055',
            backgroundColor: isSeller ? '#1A56DB18' : '#6B758018',
          }}>
            <Text style={{
              color: isSeller ? '#60A5FA' : '#9CA3AF',
              fontSize: 10, fontWeight: '800', letterSpacing: 0.5,
            }}>
              {isSeller ? 'SELLER' : 'BUYER'}
            </Text>
          </View>
        </View>

        {/* Completion banner — buyers only when incomplete */}
        {!isSeller && profileStatus && !profileStatus.isComplete && (
          <TouchableOpacity
            style={{
              marginHorizontal: 20, marginBottom: 20,
              backgroundColor: 'rgba(245,158,11,0.08)',
              borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
              borderRadius: 14, padding: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12,
            }}
            onPress={() => {
              if (!profileStatus.hasAddress) router.push('/profile/address' as any);
              else router.push('/seller/payment-settings' as any);
            }}
            activeOpacity={0.8}
          >
            <Icon symbol="exclamationmark.triangle.fill" fallback="⚠️" size={20} tint="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 13 }}>
                Complete your profile to bid
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>
                {!profileStatus.hasAddress && !profileStatus.hasPaymentMethod
                  ? 'Add shipping address and payment method'
                  : !profileStatus.hasAddress
                    ? 'Add a shipping address'
                    : 'Add a payment method'}
              </Text>
            </View>
            <Icon symbol="chevron.right" fallback="›" size={14} tint="#F59E0B" />
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {quickActions.map(action => (
              <TouchableOpacity
                key={action.label}
                style={{
                  width: '47.5%',
                  backgroundColor: '#111827',
                  borderWidth: 1, borderColor: '#1F2937',
                  borderRadius: 16, padding: 16,
                }}
                onPress={action.action}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: action.bg,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 10,
                }}>
                  <Icon symbol={action.symbol} fallback={action.fallback} size={22} tint={action.color} />
                </View>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Settings list */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Text style={{
            color: '#6B7280', fontSize: 11, fontWeight: '700',
            letterSpacing: 0.5, marginBottom: 10, paddingHorizontal: 4,
          }}>
            SETTINGS
          </Text>
          <View style={{
            backgroundColor: '#111827',
            borderRadius: 16, overflow: 'hidden',
            borderWidth: 1, borderColor: '#1F2937',
          }}>
            {settingsItems.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: idx < settingsItems.length - 1 ? 1 : 0,
                  borderBottomColor: '#1F2937',
                }}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <Icon symbol={item.symbol} fallback={item.fallback} size={18} tint="#6B7280" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500', flex: 1 }}>
                  {item.label}
                </Text>
                <Icon symbol="chevron.right" fallback="›" size={13} tint="#4B5563" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout */}
        <View style={{ paddingHorizontal: 20 }}>
          <TouchableOpacity
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
              borderRadius: 14, paddingVertical: 14,
              alignItems: 'center',
            }}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: '#374151', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
          Auxtion v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Arc ring component (pure RN — no SVG dep needed) ─────────────────────────
function ArcRing({ pct, color, initial }: { pct: number; color: string; initial: string }) {
  // We fake the segmented arc using a View-based approach:
  // Outer ring border with colored segments done via SVG (RN supports basic SVG via react-native-svg
  // but since we're keeping deps minimal, use a border + clip approach)
  // For now: colored border ring with completion badge — clean and device-tested
  const segments = 12;
  const filled = Math.round((pct / 100) * segments);

  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ring — track */}
      <View style={{
        position: 'absolute',
        width: 120, height: 120, borderRadius: 60,
        borderWidth: 4,
        borderColor: '#1F2937',
      }} />
      {/* Filled arc — using border trick: only show top+right sides for 50%, all for 100% */}
      {pct > 0 && (
        <View style={{
          position: 'absolute',
          width: 120, height: 120, borderRadius: 60,
          borderWidth: 4,
          borderTopColor: color,
          borderRightColor: pct >= 50 ? color : 'transparent',
          borderBottomColor: pct === 100 ? color : 'transparent',
          borderLeftColor: pct === 100 ? color : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }} />
      )}
      {/* Avatar */}
      <View style={{
        width: 104, height: 104, borderRadius: 52,
        backgroundColor: '#1A56DB',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>
          {initial}
        </Text>
      </View>
      {/* Badge */}
      <View style={{
        position: 'absolute', bottom: -2,
        backgroundColor: color,
        borderRadius: 8, paddingHorizontal: 9, paddingVertical: 2,
        borderWidth: 2, borderColor: '#0D1117',
      }}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
          {pct}%
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  fieldLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fieldWrap: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  fieldInput: {
    color: '#fff',
    fontSize: 15,
    paddingVertical: 14,
  },
};