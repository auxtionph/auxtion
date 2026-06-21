import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  InputAccessoryView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, SFSymbol } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '@/services/api/client';

const NUMERIC_ACCESSORY_ID = 'auxtion-numeric-dismiss';

type AddressForm = {
  name: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
};

type FieldDef = {
  key: keyof AddressForm;
  label: string;
  placeholder: string;
  keyboard: 'default' | 'numeric' | 'phone-pad';
  icon: SFSymbol;
  half?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: 'name',       label: 'Full Name',           placeholder: 'e.g. Juan dela Cruz',         keyboard: 'default',   icon: 'person.fill' },
  { key: 'phone',      label: 'Phone Number',         placeholder: 'e.g. 09171234567',           keyboard: 'phone-pad', icon: 'phone.fill' },
  { key: 'line1',      label: 'Street / Barangay',    placeholder: 'e.g. 123 Rizal St., Brgy. San Jose', keyboard: 'default', icon: 'house.fill' },
  { key: 'city',       label: 'City / Municipality',  placeholder: 'e.g. Quezon City',           keyboard: 'default',   icon: 'building.2.fill', half: true },
  { key: 'province',   label: 'Province',             placeholder: 'e.g. Metro Manila',          keyboard: 'default',   icon: 'map.fill',         half: true },
  { key: 'postalCode', label: 'Postal Code',          placeholder: 'e.g. 1100',                  keyboard: 'numeric',   icon: 'number' },
];

const LAST_KEY: keyof AddressForm = 'postalCode';
const EMPTY_FORM: AddressForm = { name: '', phone: '', line1: '', city: '', province: '', postalCode: '' };

export default function AddressFormScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [form, setForm]             = useState<AddressForm>(EMPTY_FORM);
  const [loading, setLoading]       = useState(isEditing);
  const [saving, setSaving]         = useState(false);
  const [focusedKey, setFocusedKey] = useState<keyof AddressForm | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await apiClient.get('/users/me/addresses');
        const addresses = res.data.data ?? [];
        const existing = addresses.find((a: { id: string }) => a.id === id);
        if (existing) {
          setForm({
            name:       existing.name       ?? '',
            phone:      existing.phone      ?? '',
            line1:      existing.line1      ?? '',
            city:       existing.city       ?? '',
            province:   existing.province   ?? '',
            postalCode: existing.postalCode ?? '',
          });
        }
      } catch {
        /* non-fatal */
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEditing]);

  const handleSave = async () => {
    const { name, phone, line1, city, province, postalCode } = form;
    if (!name || !phone || !line1 || !city || !province || !postalCode) {
      Alert.alert('Missing Info', 'Please fill in all address fields.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await apiClient.patch(`/users/me/addresses/${id}`, form);
      } else {
        await apiClient.post('/users/me/addresses', form);
      }
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldCell = (field: FieldDef) => {
    const focused = focusedKey === field.key;
    const filled  = !!form[field.key];
    const isLastField = field.key === LAST_KEY;
    return (
      <>
        {focused && <View style={styles.activeBar} />}
        <View style={styles.cellInner}>
          <View style={styles.labelRow}>
            <SymbolView
              name={field.icon}
              size={11}
              tintColor={focused ? '#A78BFA' : filled ? '#6B7280' : '#374151'}
              weight="semibold"
            />
            <Text style={[styles.cellLabel, focused && styles.cellLabelFocused, filled && !focused && styles.cellLabelFilled]}>
              {field.label}
            </Text>
          </View>
          <TextInput
            style={[styles.cellInput, filled && styles.cellInputFilled]}
            value={form[field.key]}
            onChangeText={v => setForm(prev => ({ ...prev, [field.key]: v }))}
            onFocus={() => setFocusedKey(field.key)}
            onBlur={() => setFocusedKey(null)}
            placeholder={field.placeholder}
            placeholderTextColor="rgba(75,85,99,0.55)"
            keyboardType={field.keyboard}
            autoCorrect={false}
            autoCapitalize={field.key === 'postalCode' || field.key === 'phone' ? 'none' : 'words'}
            returnKeyType={isLastField ? 'done' : 'next'}
            onSubmitEditing={isLastField ? Keyboard.dismiss : undefined}
            blurOnSubmit={isLastField}
            selectionColor="#A78BFA"
            inputAccessoryViewID={
              Platform.OS === 'ios' && (field.keyboard === 'numeric' || field.keyboard === 'phone-pad')
                ? NUMERIC_ACCESSORY_ID
                : undefined
            }
          />
        </View>
      </>
    );
  };

  const renderField = (field: FieldDef, isLast = false) => (
    <View key={field.key} style={[styles.row, isLast && styles.rowLast]}>
      {renderFieldCell(field)}
    </View>
  );

  const renderHalfPair = (left: FieldDef, right: FieldDef, isLast = false) => (
    <View key={`pair-${left.key}`} style={[styles.halfRow, isLast && styles.rowLast]}>
      <View style={styles.halfCell}>{renderFieldCell(left)}</View>
      <View style={styles.halfDivider} />
      <View style={styles.halfCell}>{renderFieldCell(right)}</View>
    </View>
  );

  const renderFields = () => {
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < FIELDS.length) {
      const field = FIELDS[i];
      const isLast = i >= FIELDS.length - 1;
      if (field.half && FIELDS[i + 1]?.half) {
        elements.push(renderHalfPair(field, FIELDS[i + 1], i + 1 >= FIELDS.length - 1));
        i += 2;
      } else {
        elements.push(renderField(field, isLast));
        i++;
      }
    }
    return elements;
  };

  const filledCount = Object.values(form).filter(Boolean).length;
  const totalCount  = FIELDS.length;
  const isComplete  = filledCount === totalCount;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <SymbolView name="chevron.left" size={20} tintColor="#E5E7EB" weight="semibold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Address' : 'New Address'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#A78BFA" style={{ marginTop: 64 }} />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <LinearGradient
                  colors={['rgba(167,139,250,0.18)', 'rgba(167,139,250,0.04)']}
                  style={styles.heroIconBg}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <SymbolView name="shippingbox.fill" size={26} tintColor="#A78BFA" />
              </View>
              <Text style={styles.heroTitle}>
                {isEditing ? 'Update this address' : 'Where do we ship your wins?'}
              </Text>
              <Text style={styles.heroSubtitle}>
                Sellers use this address to send items you win at auction.
              </Text>
            </View>

            <View style={styles.card}>
              {renderFields()}
            </View>

            <View style={styles.progressRow}>
              <SymbolView
                name={isComplete ? 'checkmark.circle.fill' : 'circle.dotted'}
                size={14}
                tintColor={isComplete ? '#10B981' : '#6B7280'}
                weight="semibold"
              />
              <Text style={[styles.progressText, isComplete && styles.progressTextDone]}>
                {isComplete ? 'All set — ready to save' : `${filledCount} of ${totalCount} fields complete`}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, (saving || !isComplete) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Save Address'}</Text>
                    <SymbolView name="arrow.right" size={15} tintColor="#fff" weight="semibold" />
                  </>
                )
              }
            </TouchableOpacity>

            <View style={styles.trustRow}>
              <SymbolView name="lock.fill" size={11} tintColor="#4B5563" />
              <Text style={styles.trustText}>Only shared with sellers of items you win</Text>
            </View>
          </>
        )}
      </ScrollView>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={NUMERIC_ACCESSORY_ID}>
          <View style={styles.accessory}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={styles.accessoryBtn} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
              <Text style={styles.accessoryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
}

const DIVIDER = 'rgba(255,255,255,0.06)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F17' },

  header: {
    backgroundColor: '#0B0F17',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#F9FAFB', letterSpacing: -0.3 },
  headerSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, gap: 18 },

  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 4, gap: 12 },
  heroIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.18)',
    overflow: 'hidden',
  },
  heroIconBg: { ...StyleSheet.absoluteFillObject },
  heroTitle: {
    fontSize: 19, fontWeight: '700', color: '#F9FAFB',
    letterSpacing: -0.4, textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13, color: '#6B7280', textAlign: 'center',
    lineHeight: 18, paddingHorizontal: 24, maxWidth: 320,
  },

  card: {
    backgroundColor: '#10172A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },

  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
    position: 'relative',
    minHeight: 70,
  },
  rowLast: { borderBottomWidth: 0 },
  cellInner: { flex: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 11, justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cellLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#374151',
  },
  cellLabelFilled: { color: '#6B7280' },
  cellLabelFocused: { color: '#A78BFA' },
  cellInput: {
    fontSize: 15.5,
    color: '#9CA3AF',
    padding: 0,
    margin: 0,
    fontWeight: '500',
  },
  cellInputFilled: { color: '#F9FAFB', fontWeight: '500' },

  activeBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: '#A78BFA',
    borderTopLeftRadius: 3, borderBottomLeftRadius: 3,
    zIndex: 1,
  },

  halfRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
    minHeight: 70,
  },
  halfCell: { flex: 1, position: 'relative' },
  halfDivider: { width: StyleSheet.hairlineWidth, backgroundColor: DIVIDER },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  progressText: { fontSize: 12, fontWeight: '500', color: '#6B7280', letterSpacing: -0.1 },
  progressTextDone: { color: '#10B981' },

  saveBtn: {
    backgroundColor: '#1A56DB',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },

  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
  },
  trustText: { fontSize: 11, color: '#4B5563', fontWeight: '500', letterSpacing: -0.05 },

  accessory: {
    backgroundColor: '#161B27',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  accessoryBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  accessoryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A78BFA',
    letterSpacing: -0.2,
  },
});