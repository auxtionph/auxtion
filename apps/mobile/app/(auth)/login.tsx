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
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';

export default function LoginScreen() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loginMessage, setLoginMessage] = useState('');

  const validate = () => {
    const e: { email?: string; password?: string } = {};
    if (!email) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Minimum 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setLoginMessage('');
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data.data as {
        user: Parameters<typeof setAuth>[0];
        accessToken: string;
        refreshToken: string;
      };
      await setAuth(user, accessToken, refreshToken);
      router.replace('/(main)');
    } catch (error: unknown) {
      const err = error as {
        response?: { status?: number; data?: { message?: string } };
      };
      const message = err.response?.data?.message ?? 'Invalid credentials';

      if (
        err.response?.status === 403 &&
        message === 'Please verify your email before logging in.'
      ) {
        setLoginMessage(
          'Please verify your email before logging in. Check your inbox.',
        );
        return;
      }

      Alert.alert('Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#1E2A3A]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">

        {/* Logo */}
        <Text className="text-5xl font-bold text-[#1A56DB] text-center mb-1">
          Auxtion
        </Text>
        <Text className="text-sm text-gray-500 text-center mb-10">
          Live Auction Marketplace
        </Text>

        {/* Email */}
        <Text className="text-sm font-semibold text-gray-300 mb-1">Email</Text>
        <TextInput
          className={`bg-gray-900 border rounded-xl px-4 py-4 text-white text-base mb-1 ${errors.email ? 'border-red-500' : 'border-gray-700'}`}
          placeholder="you@email.com"
          placeholderTextColor="#4B5563"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        {errors.email ? (
          <Text className="text-red-500 text-xs mb-3">{errors.email}</Text>
        ) : (
          <View className="mb-3" />
        )}

        {/* Password */}
        <Text className="text-sm font-semibold text-gray-300 mb-1">Password</Text>
        <TextInput
          className={`bg-gray-900 border rounded-xl px-4 py-4 text-white text-base mb-1 ${errors.password ? 'border-red-500' : 'border-gray-700'}`}
          placeholder="••••••••"
          placeholderTextColor="#4B5563"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {errors.password ? (
          <Text className="text-red-500 text-xs mb-2">{errors.password}</Text>
        ) : (
          <View className="mb-2" />
        )}

        {loginMessage ? (
          <Text className="text-red-400 text-sm mb-4 leading-5">
            {loginMessage}
          </Text>
        ) : null}

        {/* Forgot Password */}
        <TouchableOpacity
          className="mb-6"
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text className="text-[#1A56DB] text-sm text-right">
            Forgot password?
          </Text>
        </TouchableOpacity>

        {/* Login Button */}
        <TouchableOpacity
          className={`bg-[#1A56DB] rounded-xl py-4 items-center ${loading ? 'opacity-60' : ''}`}
          onPress={() => void handleLogin()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">Sign In</Text>
          )}
        </TouchableOpacity>

        {/* Register Link */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-gray-500 text-sm">Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text className="text-[#1A56DB] text-sm font-semibold">Sign Up</Text>
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}
