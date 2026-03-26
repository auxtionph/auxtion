import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email) { setError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      // Always show success to prevent email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View className="flex-1 bg-[#1E2A3A] justify-center px-6">
        <View className="bg-gray-900 border border-gray-700 rounded-2xl p-8 items-center">
          <Text className="text-5xl mb-4">📬</Text>
          <Text className="text-white text-xl font-bold text-center mb-2">
            Check Your Email
          </Text>
          <Text className="text-gray-400 text-sm text-center mb-8">
            If an account exists for {email}, we've sent a password reset link.
          </Text>
          <TouchableOpacity
            className="bg-[#1A56DB] rounded-xl py-4 px-8 w-full items-center"
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text className="text-white font-bold text-base">Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#1E2A3A]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">

        {/* Back */}
        <TouchableOpacity className="mb-8" onPress={() => router.back()}>
          <Text className="text-[#1A56DB] text-base">← Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <Text className="text-4xl font-bold text-white mb-2">
          Reset Password
        </Text>
        <Text className="text-sm text-gray-500 mb-8">
          Enter your email and we'll send you a reset link.
        </Text>

        {/* Email Field */}
        <Text className="text-sm font-semibold text-gray-300 mb-1">Email</Text>
        <TextInput
          className={`bg-gray-900 border rounded-xl px-4 py-4 text-white text-base mb-1 ${
            error ? 'border-red-500' : 'border-gray-700'
          }`}
          placeholder="you@email.com"
          placeholderTextColor="#4B5563"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        {error ? (
          <Text className="text-red-500 text-xs mb-4">{error}</Text>
        ) : (
          <View className="mb-4" />
        )}

        {/* Submit */}
        <TouchableOpacity
          className={`bg-[#1A56DB] rounded-xl py-4 items-center ${loading ? 'opacity-60' : ''}`}
          onPress={() => void handleSubmit()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">Send Reset Link</Text>
          )}
        </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}