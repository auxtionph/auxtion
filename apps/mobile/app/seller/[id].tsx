import { View, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SellerPublicProfileView } from '../../src/components/SellerPublicProfileView';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      <StatusBar barStyle="light-content" />
      <SellerPublicProfileView userId={id} onBack={() => router.back()} />
    </View>
  );
}