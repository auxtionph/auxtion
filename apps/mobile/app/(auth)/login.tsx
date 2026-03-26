import { View, Text, StyleSheet } from 'react-native';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Auxtion</Text>
      <Text style={styles.subtitle}>Login — Coming Soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E2A3A', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 36, fontWeight: 'bold', color: '#1A56DB', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6B7280' },
});
