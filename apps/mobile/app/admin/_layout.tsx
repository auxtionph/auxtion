import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0D1117' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="applications" />
      <Stack.Screen name="users" />
    </Stack>
  );
}
