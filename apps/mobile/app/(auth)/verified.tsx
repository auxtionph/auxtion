import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function EmailVerifiedScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 justify-center bg-[#1E2A3A] px-6">
      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-500 mb-6">
          <Text className="text-white text-xl font-bold">OK</Text>
        </View>

        <Text className="text-4xl font-bold text-white text-center mb-3">
          Email verified
        </Text>
        <Text className="text-gray-300 text-base text-center leading-6 mb-8">
          Your Auxtion account is ready. Sign in to continue bidding and selling.
        </Text>

        <TouchableOpacity
          className="bg-[#1A56DB] rounded-xl py-4 px-8 items-center w-full"
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text className="text-white font-bold text-base">Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
