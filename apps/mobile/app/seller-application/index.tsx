import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { apiClient } from '../../src/services/api/client';

type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface SellerApplicationRecord {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  description?: string | null;
}

type ViewState = 'loading' | 'form' | 'status';

interface StatusConfigEntry {
  symbol: SFSymbol;
  fallback: string;
  color: string;
  bg: string;
  title: string;
  body: string;
}

const STATUS_CONFIG: Record<ApplicationStatus, StatusConfigEntry> = {
  PENDING: {
    symbol: 'clock.fill' as SFSymbol,
    fallback: '⏳',
    color: '#F59E0B',
    bg: '#F59E0B22',
    title: 'Application Under Review',
    body: 'We\'re reviewing your seller application. You\'ll be notified within 48 hours of submission.',
  },
  APPROVED: {
    symbol: 'checkmark.seal.fill' as SFSymbol,
    fallback: '✅',
    color: '#10B981',
    bg: '#10B98122',
    title: 'You\'re Already a Seller',
    body: 'Your seller application has been approved. Head to My Shop to start listing items.',
  },
  REJECTED: {
    symbol: 'xmark.seal.fill' as SFSymbol,
    fallback: '❌',
    color: '#EF4444',
    bg: '#EF444422',
    title: 'Application Not Approved',
    body: 'Your previous application wasn\'t approved this time. You can submit a new application below.',
  },
};

type Step = 1 | 2 | 3;

interface FormData {
  // Step 1 — Personal Info
  legalName: string;
  phone: string;
  address: string;

  // Step 2 — Selling Info
  shopName: string;
  categories: string[];
  experience: string;

  // Step 3 — ID Verification
  idType: string;
  idNumber: string;
  agreed: boolean;
}

const CATEGORY_OPTIONS = [
  '👗 Fashion', '👟 Sneakers', '📱 Electronics',
  '🏆 Collectibles', '💄 Beauty', '🃏 Trading Cards',
  '💍 Jewelry', '🧸 Toys & Hobbies', '📚 Comics & Anime',
  '⚽ Sports', '🍜 Food & Drink', '🎵 Music',
];

const ID_TYPES = [
  "Driver's License",
  'PhilSys National ID',
  'Passport',
  'SSS ID',
  'UMID',
  'Voter\'s ID',
  'PRC ID',
];

export default function SellerApplicationScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const insets = useSafeAreaInsets();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [existingApp, setExistingApp] = useState<SellerApplicationRecord | null>(null);

  const checkExistingApplication = useCallback(async () => {
    try {
      const res = await apiClient.get<SellerApplicationRecord>('/seller-applications/me');
      setExistingApp(res.data);
      setViewState('status');
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      if (err.response?.status === 404) {
        setViewState('form');
      } else {
        Alert.alert('Error', 'Could not check application status. Please try again.');
        setViewState('form');
      }
    }
  }, []);

  useEffect(() => {
    void checkExistingApplication();
  }, [checkExistingApplication]);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    legalName: '',
    phone: '',
    address: '',
    shopName: '',
    categories: [],
    experience: '',
    idType: '',
    idNumber: '',
    agreed: false,
  });

  const update = (key: keyof FormData, value: string | boolean | string[]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleCategory = (cat: string) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : prev.categories.length < 3
        ? [...prev.categories, cat]
        : prev.categories,
    }));
  };

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!form.legalName.trim()) { Alert.alert('Required', 'Please enter your legal name'); return false; }
      if (!form.phone.trim()) { 
    Alert.alert('Required', 'Please enter your phone number'); 
        
    }
    if (!/^(09|\+639)\d{9}$/.test(form.phone.trim())) {
        Alert.alert('Invalid Phone', 'Enter a valid PH number\nExample: 09171234567 or +639171234567');
        return false;
    }
    if (!form.address.trim()) { Alert.alert('Required', 'Please enter your address'); return false; }
    }
    if (step === 2) {
      if (!form.shopName.trim()) { Alert.alert('Required', 'Please enter your shop name'); return false; }
      if (form.categories.length === 0) { Alert.alert('Required', 'Select at least one category'); return false; }
    }
    if (step === 3) {
      if (!form.idType) { Alert.alert('Required', 'Please select an ID type'); return false; }
      if (!form.idNumber.trim()) { Alert.alert('Required', 'Please enter your ID number'); return false; }
      if (!form.agreed) { Alert.alert('Required', 'Please agree to the terms'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < 3) setStep((step + 1) as Step);
    else void handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
        try {
            await apiClient.post('/seller-applications', {
            fullName: form.legalName,
            idImageUrl: `ID-${form.idType}-${form.idNumber}`,
            contactNo: form.phone,
            description: `Shop: ${form.shopName}. Categories: ${form.categories.join(', ')}. Experience: ${form.experience || 'None provided'}`,
            payoutInfo: form.address,
            });
            Alert.alert(
            '🎉 Application Submitted!',
            'We will review your application within 48 hours. You will be notified once approved.',
            [{ text: 'OK', onPress: () => router.replace('/(main)') }],
            );
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string | string[] } } };
            const msg = Array.isArray(err.response?.data?.message)
            ? err.response!.data!.message!.join('\n')
            : err.response?.data?.message ?? 'Failed to submit application';
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

  const StepIndicator = () => (
    <View className="flex-row items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map(s => (
        <View key={s} className="flex-row items-center">
          <View className={`w-8 h-8 rounded-full items-center justify-center ${
            s === step ? 'bg-[#1A56DB]' :
            s < step ? 'bg-green-600' : 'bg-gray-800'
          }`}>
            {s < step ? (
              <Text className="text-white text-sm font-bold">✓</Text>
            ) : (
              <Text className="text-white text-sm font-bold">{s}</Text>
            )}
          </View>
          {s < 3 && (
            <View className={`w-12 h-0.5 mx-1 ${s < step ? 'bg-green-600' : 'bg-gray-700'}`} />
          )}
        </View>
      ))}
    </View>
  );

  const stepTitles = {
    1: { title: 'Personal Info', subtitle: 'Tell us about yourself' },
    2: { title: 'Shop Details', subtitle: 'What will you be selling?' },
    3: { title: 'ID Verification', subtitle: 'Verify your identity' },
  };

  if (viewState === 'loading') {
    return (
      <View
        className="flex-1 bg-[#1E2A3A] items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  if (viewState === 'status' && existingApp) {
    const cfg = STATUS_CONFIG[existingApp.status];
    return (
      <View
        className="flex-1 bg-[#1E2A3A] px-6"
        style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mb-6">
          <Text className="text-[#1A56DB] text-base">← Back</Text>
        </TouchableOpacity>
        <View className="flex-1 items-center justify-center">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: cfg.bg }}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView name={cfg.symbol} size={36} tintColor={cfg.color} />
            ) : (
              <Text style={{ fontSize: 36 }}>{cfg.fallback}</Text>
            )}
          </View>
          <Text className="text-white font-bold text-xl text-center mb-3">
            {cfg.title}
          </Text>
          <Text className="text-gray-400 text-base text-center leading-6 mb-8">
            {cfg.body}
          </Text>
          {existingApp.status === 'APPROVED' && (
            <TouchableOpacity
              className="rounded-2xl py-4 px-8 items-center bg-[#1A56DB] w-full"
              onPress={() => router.replace('/seller/shop' as any)}
            >
              <Text className="text-white font-semibold text-base">Go to My Shop</Text>
            </TouchableOpacity>
          )}
          {existingApp.status === 'REJECTED' && (
            <TouchableOpacity
              className="rounded-2xl py-4 px-8 items-center bg-[#1A56DB] w-full"
              onPress={() => setViewState('form')}
            >
              <Text className="text-white font-semibold text-base">Submit New Application</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#1E2A3A]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View className="pt-14 px-6 pb-4 flex-row items-center gap-4">
        <TouchableOpacity onPress={() => step > 1 ? setStep((step - 1) as Step) : router.back()}>
          <Text className="text-[#1A56DB] text-base">← Back</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white font-bold text-lg">
            {stepTitles[step].title}
          </Text>
          <Text className="text-gray-500 text-sm">
            {stepTitles[step].subtitle}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StepIndicator />

        {/* ── Step 1: Personal Info ── */}
        {step === 1 && (
          <View className="gap-4">
            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Legal Full Name *
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white"
                placeholder="As it appears on your government ID"
                placeholderTextColor="#4B5563"
                value={form.legalName}
                onChangeText={v => update('legalName', v)}
                autoCapitalize="words"
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Mobile Number *
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white"
                placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                placeholderTextColor="#4B5563"
                value={form.phone}
                onChangeText={v => update('phone', v)}
                keyboardType="phone-pad"
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Home Address *
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white"
                placeholder="Street, Barangay, City, Province"
                placeholderTextColor="#4B5563"
                value={form.address}
                onChangeText={v => update('address', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ minHeight: 80 }}
              />
            </View>

            <View className="bg-blue-900/30 border border-blue-800 rounded-xl p-4">
              <Text className="text-blue-300 text-sm">
                ℹ️ Your personal information is kept private and used only for identity verification purposes.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 2: Shop Details ── */}
        {step === 2 && (
          <View className="gap-4">
            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Shop Name *
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white"
                placeholder="e.g. Juan's Sneaker Shop"
                placeholderTextColor="#4B5563"
                value={form.shopName}
                onChangeText={v => update('shopName', v)}
                autoCapitalize="words"
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-2">
                What will you sell? * (pick up to 3)
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(cat => {
                  const selected = form.categories.includes(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      className={`px-3 py-2 rounded-full border ${
                        selected
                          ? 'bg-[#1A56DB] border-[#1A56DB]'
                          : 'bg-gray-900 border-gray-700'
                      }`}
                      onPress={() => toggleCategory(cat)}
                    >
                      <Text className={`text-xs font-semibold ${
                        selected ? 'text-white' : 'text-gray-400'
                      }`}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                Selling Experience (optional)
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white"
                placeholder="Tell us about your selling experience (Shopee, Lazada, Facebook, etc.)"
                placeholderTextColor="#4B5563"
                value={form.experience}
                onChangeText={v => update('experience', v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{ minHeight: 100 }}
              />
            </View>
          </View>
        )}

        {/* ── Step 3: ID Verification ── */}
        {step === 3 && (
          <View className="gap-4">
            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-2">
                ID Type *
              </Text>
              <View className="gap-2">
                {ID_TYPES.map(type => (
                  <TouchableOpacity
                    key={type}
                    className={`flex-row items-center gap-3 px-4 py-3 rounded-xl border ${
                      form.idType === type
                        ? 'bg-blue-900/30 border-[#1A56DB]'
                        : 'bg-gray-900 border-gray-700'
                    }`}
                    onPress={() => update('idType', type)}
                  >
                    <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                      form.idType === type ? 'border-[#1A56DB]' : 'border-gray-600'
                    }`}>
                      {form.idType === type && (
                        <View className="w-2.5 h-2.5 rounded-full bg-[#1A56DB]" />
                      )}
                    </View>
                    <Text className={`text-sm ${
                      form.idType === type ? 'text-white font-semibold' : 'text-gray-400'
                    }`}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text className="text-sm font-semibold text-gray-300 mb-1">
                ID Number *
              </Text>
              <TextInput
                className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white"
                placeholder="Enter your ID number"
                placeholderTextColor="#4B5563"
                value={form.idNumber}
                onChangeText={v => update('idNumber', v)}
                autoCapitalize="characters"
              />
            </View>

            {/* Terms Agreement */}
            <TouchableOpacity
              className={`flex-row items-start gap-3 p-4 rounded-xl border ${
                form.agreed ? 'bg-blue-900/30 border-[#1A56DB]' : 'bg-gray-900 border-gray-700'
              }`}
              onPress={() => update('agreed', !form.agreed)}
            >
              <View className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 flex-shrink-0 ${
                form.agreed ? 'bg-[#1A56DB] border-[#1A56DB]' : 'border-gray-600'
              }`}>
                {form.agreed && <Text className="text-white text-xs">✓</Text>}
              </View>
              <Text className="text-gray-300 text-sm flex-1">
                I confirm that the information I provided is accurate and I agree to Auxtion's{' '}
                <Text className="text-[#1A56DB]">Terms of Service</Text> and{' '}
                <Text className="text-[#1A56DB]">Seller Policy</Text>.
              </Text>
            </TouchableOpacity>

            <View className="bg-yellow-900/30 border border-yellow-800 rounded-xl p-4">
              <Text className="text-yellow-300 text-sm">
                ⏱️ Applications are reviewed within 48 hours. You'll receive a notification once your application is approved or rejected.
              </Text>
            </View>
          </View>
        )}

        <View className="h-32" />
      </ScrollView>

      {/* Bottom CTA */}
      <View className="px-6 pb-10 pt-4 border-t border-gray-800 bg-[#1E2A3A]">
        <TouchableOpacity
          className={`rounded-2xl py-4 items-center ${loading ? 'bg-blue-800 opacity-60' : 'bg-[#1A56DB]'}`}
          onPress={handleNext}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">
              {step === 3 ? 'Submit Application' : `Next — Step ${step + 1} of 3`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}