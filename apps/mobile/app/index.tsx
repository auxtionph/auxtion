import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/auth.store';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E2A3A' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? '/(main)' : '/(auth)/login'} />;
}
