import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../src/services/api/client';

type Tab = 'gcash' | 'bank';

const BANK_OPTIONS = [
  'BPI', 'BDO', 'Metrobank', 'UnionBank', 'RCBC',
  'Landbank', 'PNB', 'Security Bank', 'EastWest', 'Other',
];

function GCashPreviewCard({ number, name }: { number: string; name: string }) {
  const isEmpty = !number && !name;
  return (
    <View style={{
      width: '100%', height: 180,
      borderRadius: 20, overflow: 'hidden',
      backgroundColor: '#1A56DB',
      padding: 24,
      shadowColor: '#1A56DB',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 8,
    }}>
      <View style={{
        position: 'absolute', top: -40, right: -40,
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(255,255,255,0.06)',
      }} />
      <View style={{
        position: 'absolute', bottom: -60, right: 40,
        width: 220, height: 220, borderRadius: 110,
        backgroundColor: 'rgba(255,255,255,0.04)',
      }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: '#00C2FF',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 16 }}>📱</Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 }}>GCash</Text>
        </View>
        <View style={{
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>RECEIVE</Text>
        </View>
      </View>
      <Text style={{
        color: isEmpty ? 'rgba(255,255,255,0.3)' : '#fff',
        fontSize: 22, fontWeight: '700', letterSpacing: 3,
        marginTop: 20, marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      }}>
        {isEmpty ? '09XX XXX XXXX' : number.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3') || '09XX XXX XXXX'}
      </Text>
      <Text style={{
        color: isEmpty ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)',
        fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {isEmpty ? 'ACCOUNT NAME' : name.toUpperCase() || 'ACCOUNT NAME'}
      </Text>
    </View>
  );
}

function BankPreviewCard({ bankName, accountNumber, accountName }: {
  bankName: string; accountNumber: string; accountName: string;
}) {
  const maskedNumber = accountNumber.length > 4
    ? `•••• ${accountNumber.slice(-4)}`
    : accountNumber || '•••• ••••';
  const isEmpty = !bankName && !accountNumber && !accountName;
  return (
    <View style={{
      width: '100%', height: 180,
      borderRadius: 20, overflow: 'hidden',
      backgroundColor: '#0F4C35',
      padding: 24,
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 8,
    }}>
      <View style={{
        position: 'absolute', top: -40, left: -40,
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: 'rgba(16,185,129,0.1)',
      }} />
      <View style={{
        position: 'absolute', bottom: -40, right: -20,
        width: 160, height: 160, borderRadius: 80,
        backgroundColor: 'rgba(16,185,129,0.07)',
      }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 22 }}>🏦</Text>
          <Text style={{
            color: isEmpty ? 'rgba(255,255,255,0.3)' : '#fff',
            fontWeight: '800', fontSize: 16,
          }}>
            {isEmpty ? 'Bank Transfer' : bankName || 'Select Bank'}
          </Text>
        </View>
        <View style={{
          backgroundColor: 'rgba(16,185,129,0.2)',
          borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
          borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
        }}>
          <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>RECEIVE</Text>
        </View>
      </View>
      <Text style={{
        color: isEmpty ? 'rgba(255,255,255,0.2)' : '#fff',
        fontSize: 22, fontWeight: '700', letterSpacing: 3,
        marginTop: 20, marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      }}>
        {maskedNumber}
      </Text>
      <Text style={{
        color: isEmpty ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)',
        fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {isEmpty ? 'ACCOUNT NAME' : accountName.toUpperCase() || 'ACCOUNT NAME'}
      </Text>
    </View>
  );
}

export default function PaymentSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('gcash');
  const [showBankPicker, setShowBankPicker] = useState(false);

  const [gcashNumber, setGcashNumber] = useState('');
  const [gcashName, setGcashName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  useEffect(() => { void fetchPaymentInfo(); }, []);

  const fetchPaymentInfo = async () => {
    try {
      const res = await apiClient.get('/users/me');
      const user = res.data.data as {
        gcashNumber?: string; gcashName?: string;
        bankName?: string; bankAccountNumber?: string; bankAccountName?: string;
      };
      setGcashNumber(user.gcashNumber ?? '');
      setGcashName(user.gcashName ?? '');
      setBankName(user.bankName ?? '');
      setBankAccountNumber(user.bankAccountNumber ?? '');
      setBankAccountName(user.bankAccountName ?? '');
      if (!user.gcashNumber && user.bankName) setActiveTab('bank');
    } catch {
      Alert.alert('Error', 'Failed to load payment info');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (gcashNumber.trim() && !/^09\d{9}$/.test(gcashNumber.trim())) {
      Alert.alert('Invalid GCash Number', 'Must be 11 digits starting with 09 (e.g. 09171234567).');
      return;
    }
    if ((gcashNumber.trim() && !gcashName.trim()) || (!gcashNumber.trim() && gcashName.trim())) {
      Alert.alert('Incomplete GCash', 'Enter both GCash number and account name.');
      return;
    }
    if (gcashName.trim() && gcashName.trim().length < 2) {
      Alert.alert('Invalid Name', 'GCash account name must be at least 2 characters.');
      return;
    }
    const bankFilled = [bankName, bankAccountNumber.trim(), bankAccountName.trim()].filter(Boolean).length;
    if (bankFilled > 0 && bankFilled < 3) {
      Alert.alert('Incomplete Bank Info', 'Fill in all bank fields or leave them all empty.');
      return;
    }
    if (bankAccountNumber.trim() && bankAccountNumber.trim().length < 10) {
      Alert.alert('Invalid Account Number', 'Bank account number must be at least 10 digits.');
      return;
    }
    if (bankAccountName.trim() && bankAccountName.trim().length < 2) {
      Alert.alert('Invalid Name', 'Bank account name must be at least 2 characters.');
      return;
    }
    const hasGcash = gcashNumber.trim() && gcashName.trim();
    const hasBank = bankName && bankAccountNumber.trim() && bankAccountName.trim();
    if (!hasGcash && !hasBank) {
      Alert.alert('No Payment Method', 'Add at least one payment method.');
      return;
    }

    const summary: string[] = [];
    if (hasGcash) summary.push(`📱 GCash\n   ${gcashNumber.trim()}\n   ${gcashName.trim()}`);
    if (hasBank) summary.push(`🏦 ${bankName}\n   ${bankAccountNumber.trim()}\n   ${bankAccountName.trim()}`);

    Alert.alert(
      'Confirm Payment Details',
      `Buyers will send money to:\n\n${summary.join('\n\n')}\n\nA security push notification will be sent after saving.`,
      [
        { text: 'Go Back', style: 'cancel' },
        {
          text: 'Save & Confirm',
          onPress: async () => {
            setSaving(true);
            try {
              await apiClient.patch('/users/me/payment-methods', {
                gcashNumber: gcashNumber.trim() || null,
                gcashName: gcashName.trim() || null,
                bankName: bankName || null,
                bankAccountNumber: bankAccountNumber.trim() || null,
                bankAccountName: bankAccountName.trim() || null,
              });
              setSaving(false);
              Alert.alert(
                '✅ Saved',
                'Payment details updated. A security notification has been sent.',
                [{ text: 'OK', onPress: () => router.back() }],
              );
            } catch (e: unknown) {
              setSaving(false);
              const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
              Alert.alert('Error', msg ?? 'Failed to save. Try again.');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1A56DB" />
      </View>
    );
  }

  const hasGcash = !!(gcashNumber.trim() && gcashName.trim());
  const hasBank = !!(bankName && bankAccountNumber.trim() && bankAccountName.trim());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0D1117' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20, paddingBottom: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: 1, borderColor: '#1F2937',
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>Payment Method</Text>
          <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>Buyers send money here for Chat Bid wins</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Tab switcher */}
        <View style={{
          flexDirection: 'row',
          marginHorizontal: 20, marginTop: 20, marginBottom: 24,
          backgroundColor: '#111827',
          borderRadius: 14, padding: 4,
          borderWidth: 1, borderColor: '#1F2937',
        }}>
          {(['gcash', 'bank'] as Tab[]).map(tab => {
            const isActive = activeTab === tab;
            const isSet = tab === 'gcash' ? hasGcash : hasBank;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => { setActiveTab(tab); setShowBankPicker(false); }}
                style={{
                  flex: 1, flexDirection: 'row',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 10, borderRadius: 10,
                  backgroundColor: isActive
                    ? tab === 'gcash' ? '#1A56DB' : '#065F46'
                    : 'transparent',
                }}
              >
                <Text style={{ fontSize: 16 }}>{tab === 'gcash' ? '📱' : '🏦'}</Text>
                <Text style={{ color: isActive ? '#fff' : '#6B7280', fontSize: 14, fontWeight: '700' }}>
                  {tab === 'gcash' ? 'GCash' : 'Bank'}
                </Text>
                {isSet && (
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: isActive ? 'rgba(255,255,255,0.6)' : '#10B981',
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Live Preview Card */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={{ color: '#4B5563', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>
            PREVIEW — WHAT BUYERS WILL SEE
          </Text>
          {activeTab === 'gcash' ? (
            <GCashPreviewCard number={gcashNumber} name={gcashName} />
          ) : (
            <BankPreviewCard bankName={bankName} accountNumber={bankAccountNumber} accountName={bankAccountName} />
          )}
        </View>

        {/* GCash Fields */}
        {activeTab === 'gcash' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              GCASH NUMBER
            </Text>
            <View style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: gcashNumber ? '#1A56DB' : '#1F2937',
              paddingHorizontal: 16, marginBottom: 16,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}>
              <Text style={{ color: '#4B5563', fontSize: 15 }}>🇵🇭</Text>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 }}
                placeholder="09XX XXX XXXX"
                placeholderTextColor="#374151"
                value={gcashNumber}
                onChangeText={setGcashNumber}
                keyboardType="phone-pad"
                maxLength={11}
              />
              {gcashNumber.length === 11 && /^09\d{9}$/.test(gcashNumber) && (
                <Text style={{ color: '#10B981', fontSize: 16 }}>✓</Text>
              )}
            </View>

            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              REGISTERED NAME
            </Text>
            <View style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: gcashName ? '#1A56DB' : '#1F2937',
              paddingHorizontal: 16, marginBottom: 8,
            }}>
              <TextInput
                style={{ color: '#fff', fontSize: 16, paddingVertical: 14 }}
                placeholder="Full name as shown in GCash"
                placeholderTextColor="#374151"
                value={gcashName}
                onChangeText={setGcashName}
                autoCapitalize="words"
              />
            </View>
            <Text style={{ color: '#4B5563', fontSize: 11, marginBottom: 20 }}>
              Must match exactly — buyers verify before sending payment
            </Text>
            {hasGcash && (
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: '#374151', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => { setGcashNumber(''); setGcashName(''); }}
              >
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Remove GCash</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Bank Fields */}
        {activeTab === 'bank' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              BANK
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#111827', borderRadius: 12,
                borderWidth: 1, borderColor: bankName ? '#10B981' : '#1F2937',
                paddingHorizontal: 16, paddingVertical: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 4,
              }}
              onPress={() => setShowBankPicker(!showBankPicker)}
            >
              <Text style={{ color: bankName ? '#fff' : '#374151', fontSize: 16 }}>
                {bankName || 'Select your bank...'}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 12 }}>{showBankPicker ? '▴' : '▾'}</Text>
            </TouchableOpacity>

            {showBankPicker && (
              <View style={{
                backgroundColor: '#111827', borderRadius: 12,
                borderWidth: 1, borderColor: '#1F2937',
                marginTop: 4, marginBottom: 16, overflow: 'hidden',
              }}>
                {BANK_OPTIONS.map((bank, idx) => (
                  <TouchableOpacity
                    key={bank}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: '#1F2937',
                      backgroundColor: bankName === bank ? 'rgba(16,185,129,0.08)' : 'transparent',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    }}
                    onPress={() => { setBankName(bank); setShowBankPicker(false); }}
                  >
                    <Text style={{
                      color: bankName === bank ? '#10B981' : '#fff',
                      fontSize: 15, fontWeight: bankName === bank ? '700' : '400',
                    }}>
                      {bank}
                    </Text>
                    {bankName === bank && <Text style={{ color: '#10B981' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!showBankPicker && <View style={{ height: 16 }} />}

            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              ACCOUNT NUMBER
            </Text>
            <View style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: bankAccountNumber ? '#10B981' : '#1F2937',
              paddingHorizontal: 16, marginBottom: 16,
            }}>
              <TextInput
                style={{ color: '#fff', fontSize: 16, paddingVertical: 14 }}
                placeholder="0000 0000 0000"
                placeholderTextColor="#374151"
                value={bankAccountNumber}
                onChangeText={v => setBankAccountNumber(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
              />
            </View>

            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
              ACCOUNT NAME
            </Text>
            <View style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: bankAccountName ? '#10B981' : '#1F2937',
              paddingHorizontal: 16, marginBottom: 8,
            }}>
              <TextInput
                style={{ color: '#fff', fontSize: 16, paddingVertical: 14 }}
                placeholder="Full name on the account"
                placeholderTextColor="#374151"
                value={bankAccountName}
                onChangeText={setBankAccountName}
                autoCapitalize="words"
              />
            </View>
            <Text style={{ color: '#4B5563', fontSize: 11, marginBottom: 20 }}>
              Must match your bank records exactly
            </Text>
            {hasBank && (
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: '#374151', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => { setBankName(''); setBankAccountNumber(''); setBankAccountName(''); }}
              >
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Remove Bank</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Status row */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 16 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: hasGcash ? 'rgba(26,86,219,0.08)' : 'rgba(255,255,255,0.03)',
            borderRadius: 10, padding: 10,
            borderWidth: 1, borderColor: hasGcash ? 'rgba(26,86,219,0.2)' : '#1F2937',
          }}>
            <Text style={{ fontSize: 14 }}>📱</Text>
            <Text style={{ color: hasGcash ? '#60A5FA' : '#374151', fontSize: 12, fontWeight: '600' }}>
              GCash {hasGcash ? '✓' : 'not set'}
            </Text>
          </View>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: hasBank ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
            borderRadius: 10, padding: 10,
            borderWidth: 1, borderColor: hasBank ? 'rgba(16,185,129,0.2)' : '#1F2937',
          }}>
            <Text style={{ fontSize: 14 }}>🏦</Text>
            <Text style={{ color: hasBank ? '#10B981' : '#374151', fontSize: 12, fontWeight: '600' }}>
              Bank {hasBank ? '✓' : 'not set'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Save CTA */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16,
        backgroundColor: '#0D1117',
        borderTopWidth: 1, borderColor: '#1F2937',
      }}>
        {!hasGcash && !hasBank && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={{ fontSize: 14 }}>⚠️</Text>
            <Text style={{ color: '#F59E0B', fontSize: 12, flex: 1 }}>
              Add at least one payment method to receive Chat Bid payments
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={{
            backgroundColor: (hasGcash || hasBank) ? '#1A56DB' : '#1F2937',
            borderRadius: 16, paddingVertical: 16,
            alignItems: 'center',
            opacity: saving ? 0.6 : 1,
          }}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: (hasGcash || hasBank) ? '#fff' : '#4B5563', fontWeight: '800', fontSize: 16 }}>
              Save Payment Details
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}