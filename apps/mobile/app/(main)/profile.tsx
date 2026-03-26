import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

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

  return (
    <View className="flex-1 bg-[#1E2A3A]">
      <View className="pt-14 px-6">
        <Text className="text-white text-2xl font-bold mb-6">Account</Text>

        {/* Avatar + Name */}
        <View className="items-center mb-8">
          <View className="w-20 h-20 rounded-full bg-[#1A56DB] items-center justify-center mb-3">
            <Text className="text-white text-3xl font-bold">
              {user?.displayName?.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text className="text-white text-xl font-bold">{user?.displayName}</Text>
          <Text className="text-gray-500 text-sm">{user?.email}</Text>
          <View className="mt-2 bg-gray-800 rounded-full px-3 py-1">
            <Text className="text-gray-400 text-xs font-semibold">
              {user?.role}
            </Text>
          </View>
        </View>

        {/* Menu Items */}
        {[
          { icon: '👤', label: 'Edit Profile', action: () => {} },
          { icon: '🔔', label: 'Notifications', action: () => {} },
          { icon: '💳', label: 'Payment Methods', action: () => {} },
          { icon: '📦', label: 'My Orders', action: () => {} },
          { icon: '⭐', label: 'Become a Seller', action: () => router.push('/(main)/sell') },
          { icon: '❓', label: 'Help & Support', action: () => {} },
        ].map(({ icon, label, action }) => (
          <TouchableOpacity
            key={label}
            className="flex-row items-center gap-4 py-4 border-b border-gray-800"
            onPress={action}
          >
            <Text className="text-xl">{icon}</Text>
            <Text className="text-white text-base flex-1">{label}</Text>
            <Text className="text-gray-600">›</Text>
          </TouchableOpacity>
        ))}

        {/* Logout */}
        <TouchableOpacity
          className="mt-8 py-4 items-center border border-red-800 rounded-2xl"
          onPress={handleLogout}
        >
          <Text className="text-red-500 font-semibold">Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}