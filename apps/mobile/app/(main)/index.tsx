import { View, Text, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../../src/stores/auth.store';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const { clearAuth, user } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await clearAuth();
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-[#1E2A3A] justify-center items-center px-6">
      <Text className="text-white text-2xl font-bold mb-2">🔴 Live Now</Text>
      <Text className="text-gray-500 text-sm mb-2">
        Welcome, {user?.displayName}
      </Text>
      <Text className="text-gray-500 text-sm mb-8">Home Feed — Coming Soon</Text>
      <TouchableOpacity
        className="bg-red-600 rounded-xl px-6 py-3"
        onPress={() => void handleLogout()}
      >
        <Text className="text-white font-semibold">Logout (Dev)</Text>
      </TouchableOpacity>
    </View>
  );
}