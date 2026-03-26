import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/services/api/client';

export default function RegisterScreen() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (key: string, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.displayName.trim()) e.displayName = 'Display name is required';
    if (!form.email) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/register', {
        displayName: form.displayName,
        email: form.email,
        password: form.password,
      });
      const { user, accessToken, refreshToken } = response.data.data as {
        user: Parameters<typeof setAuth>[0];
        accessToken: string;
        refreshToken: string;
      };
      await setAuth(user, accessToken, refreshToken);
      router.replace('/(main)');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      Alert.alert(
        'Registration Failed',
        err.response?.data?.message ?? 'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    {
      key: 'displayName',
      label: 'Display Name',
      placeholder: 'Juan dela Cruz',
      autoCapitalize: 'words' as const,
      secure: false,
    },
    {
      key: 'email',
      label: 'Email',
      placeholder: 'you@email.com',
      autoCapitalize: 'none' as const,
      keyboardType: 'email-address' as const,
      secure: false,
    },
    {
      key: 'password',
      label: 'Password',
      placeholder: '••••••••',
      autoCapitalize: 'none' as const,
      secure: true,
    },
    {
      key: 'confirmPassword',
      label: 'Confirm Password',
      placeholder: '••••••••',
      autoCapitalize: 'none' as const,
      secure: true,
    },
  ];

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#1E2A3A]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 pt-16 pb-10">

          {/* Back Button */}
          <TouchableOpacity className="mb-8" onPress={() => router.back()}>
            <Text className="text-[#1A56DB] text-base">← Back to Login</Text>
          </TouchableOpacity>

          {/* Header */}
          <Text className="text-4xl font-bold text-white mb-1">
            Create Account
          </Text>
          <Text className="text-sm text-gray-500 mb-8">
            Join Auxtion and start bidding
          </Text>

          {/* Fields */}
          {fields.map(({ key, label, placeholder, autoCapitalize, keyboardType, secure }) => (
            <View key={key} className="mb-4">
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                {label}
              </Text>
              <TextInput
                className={`bg-gray-900 border rounded-xl px-4 py-4 text-white text-base ${
                  errors[key] ? 'border-red-500' : 'border-gray-700'
                }`}
                placeholder={placeholder}
                placeholderTextColor="#4B5563"
                autoCapitalize={autoCapitalize}
                keyboardType={keyboardType ?? 'default'}
                autoCorrect={false}
                secureTextEntry={secure}
                value={form[key as keyof typeof form]}
                onChangeText={v => update(key, v)}
              />
              {errors[key] ? (
                <Text className="text-red-500 text-xs mt-1">{errors[key]}</Text>
              ) : null}
            </View>
          ))}

          {/* Submit Button */}
          <TouchableOpacity
            className={`bg-[#1A56DB] rounded-xl py-4 items-center mt-4 ${loading ? 'opacity-60' : ''}`}
            onPress={() => void handleRegister()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-bold text-base">
                Create Account
              </Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-500 text-sm">Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text className="text-[#1A56DB] text-sm font-semibold">Sign In</Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}