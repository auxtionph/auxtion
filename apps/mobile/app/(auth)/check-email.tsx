import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../src/services/api/client';

export default function CheckEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{
    email?: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown(value => Math.max(value - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email) {
      setMessage({
        type: 'error',
        text: 'Please register again or contact support.',
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await apiClient.post('/auth/resend-verification', { email });
      setCooldown(60);
      setMessage({
        type: 'success',
        text: 'A new verification link has been sent to your email.',
      });
    } catch (error: unknown) {
      const err = error as {
        response?: { status?: number; data?: { message?: string } };
      };
      const responseMessage = err.response?.data?.message;

      if (err.response?.status === 429) {
        setMessage({
          type: 'error',
          text: 'Too many attempts. Please wait before requesting another link.',
        });
        return;
      }

      if (responseMessage?.toLowerCase().includes('already verified')) {
        setMessage({
          type: 'error',
          text: 'Your email is already verified. Please log in.',
        });
        setTimeout(() => router.replace('/(auth)/login'), 1200);
        return;
      }

      setMessage({
        type: 'error',
        text: responseMessage ?? 'Something went wrong',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-[#1E2A3A] px-6">
      <Text className="text-4xl font-bold text-white text-center mb-3">
        Check your email
      </Text>
      <Text className="text-gray-300 text-base text-center leading-6 mb-8">
        We sent a verification link to {email ?? 'your email'}. Please check your inbox.
      </Text>

      {message ? (
        <View
          className={`rounded-xl px-4 py-3 mb-4 ${
            message.type === 'success' ? 'bg-emerald-900/50' : 'bg-red-900/50'
          }`}
        >
          <Text
            className={`text-sm text-center ${
              message.type === 'success' ? 'text-emerald-200' : 'text-red-200'
            }`}
          >
            {message.text}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        className={`bg-[#1A56DB] rounded-xl py-4 items-center ${
          loading || cooldown > 0 ? 'opacity-60' : ''
        }`}
        onPress={() => void handleResend()}
        disabled={loading || cooldown > 0}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-white font-bold text-base">
            {cooldown > 0
              ? `Resend available in ${cooldown}s`
              : 'Resend Verification Email'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        className="mt-6 items-center"
        onPress={() => router.replace('/(auth)/login')}
      >
        <Text className="text-[#1A56DB] text-sm font-semibold">
          Back to Login
        </Text>
      </TouchableOpacity>
    </View>
  );
}
