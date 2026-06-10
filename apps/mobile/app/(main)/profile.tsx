import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';

type Screen = 'main' | 'edit';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, clearAuth, setAuth, accessToken } = useAuthStore();
  const [screen, setScreen] = useState<Screen>('main');

  // Edit form state
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

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
        const refreshToken = (await import('expo-secure-store'))
          .getItemAsync('refreshToken');
        await setAuth(updatedUser, accessToken, await refreshToken ?? '');
      }
      Alert.alert('Success', 'Profile updated');
      setScreen('main');
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (screen === 'edit') {
    return (
      <ScrollView className="flex-1 bg-[#1E2A3A]" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="pt-14 px-6 pb-10">
          {/* Header */}
          <View className="flex-row items-center gap-4 mb-8">
            <TouchableOpacity onPress={() => setScreen('main')}>
              <Text className="text-[#1A56DB] text-base">← Back</Text>
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold">Edit Profile</Text>
          </View>

          {/* Avatar */}
          <View className="items-center mb-8">
            <View className="w-24 h-24 rounded-full bg-[#1A56DB] items-center justify-center mb-3">
              <Text className="text-white text-4xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity>
              <Text className="text-[#1A56DB] text-sm font-semibold">
                Change Photo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View className="gap-4">
            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Display Name
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white text-base"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor="#4B5563"
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Email
              </Text>
              <View className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-4">
                <Text className="text-gray-500">{user?.email}</Text>
              </View>
              <Text className="text-gray-600 text-xs mt-1">
                Email cannot be changed
              </Text>
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Phone Number
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white text-base"
                value={phone}
                onChangeText={setPhone}
                placeholder="+63 9XX XXX XXXX"
                placeholderTextColor="#4B5563"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            className={`bg-[#1A56DB] rounded-2xl py-4 items-center mt-8 ${saving ? 'opacity-60' : ''}`}
            onPress={() => void handleSaveProfile()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-bold text-base">Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Main profile screen
  const menuItems = [
    {
      section: 'Account',
      items: [
        { icon: '✏️', label: 'Edit Profile', action: () => setScreen('edit') },
        { icon: '🔔', label: 'Notifications', action: () => {} },
        { icon: '🔒', label: 'Privacy & Security', action: () => {} },
      ],
    },
    {
      section: 'Selling',
      items: [
        {
          icon: '🏪',
          label: user?.role === 'SELLER' ? 'My Shop' : 'Become a Seller',
          action: () => router.push('/(main)/sell'),
        },
        { icon: '📦', label: 'My Orders', action: () => router.push('/(main)/activity') },
        ...(user?.role === 'SELLER' ? [{
          icon: '🚚',
          label: 'Manage Shipments',
          action: () => router.push('/seller/orders'),
        },
        {
          icon: '💳',
          label: 'Payment Settings',
          action: () => router.push('/seller/payment-settings'),
        },] : []),
        { icon: '💰', label: 'Payouts', action: () => {} },
      ],
    },
    {
      section: 'Support',
      items: [
        { icon: '❓', label: 'Help Center', action: () => {} },
        { icon: '📋', label: 'Terms of Service', action: () => {} },
        { icon: '🔏', label: 'Privacy Policy', action: () => {} },
      ],
    },
  ];

  return (
    <ScrollView className="flex-1 bg-[#1E2A3A]">
      <View className="pt-14 pb-10">

        {/* Header */}
        <View className="px-6 mb-6">
          <Text className="text-white text-2xl font-bold">Account</Text>
        </View>

        {/* Profile Card */}
        <View className="mx-6 bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6 flex-row items-center gap-4">
          <View className="w-16 h-16 rounded-full bg-[#1A56DB] items-center justify-center">
            <Text className="text-white text-2xl font-bold">
              {user?.displayName?.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">{user?.displayName}</Text>
            <Text className="text-gray-500 text-sm">{user?.email}</Text>
            <View className="flex-row gap-2 mt-1">
            <View className={`rounded-full px-2 py-0.5 ${
                user?.role === 'SELLER' ? 'bg-blue-900' : 'bg-gray-800'
                }`}>
                <Text className={`text-xs font-semibold ${
                    user?.role === 'SELLER' ? 'text-blue-300' : 'text-gray-400'
                }`}>
                {user?.role}
                </Text>
            </View>
            </View>
          </View>
          <TouchableOpacity
            className="bg-gray-800 rounded-full px-3 py-1.5"
            onPress={() => setScreen('edit')}
          >
            <Text className="text-white text-xs font-semibold">Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Menu Sections */}
        {menuItems.map(({ section, items }) => (
          <View key={section} className="mb-6">
            <Text className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-6 mb-2">
              {section}
            </Text>
            <View className="mx-6 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {items.map(({ icon, label, action }, index) => (
                <TouchableOpacity
                  key={label}
                  className={`flex-row items-center gap-4 px-5 py-4 ${
                    index < items.length - 1 ? 'border-b border-gray-800' : ''
                  }`}
                  onPress={action}
                >
                  <Text className="text-xl">{icon}</Text>
                  <Text className="text-white text-base flex-1">{label}</Text>
                  <Text className="text-gray-600 text-lg">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <View className="mx-6">
          <TouchableOpacity
            className="border border-red-800 rounded-2xl py-4 items-center"
            onPress={handleLogout}
          >
            <Text className="text-red-500 font-semibold text-base">Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text className="text-gray-700 text-xs text-center mt-6">
          Auxtion v1.0.0
        </Text>

      </View>
    </ScrollView>
  );
}