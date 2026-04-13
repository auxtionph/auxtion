import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auctionsApi } from '../../src/services/api/auctions.api';

export default function CreateAuctionScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    // Default to 1 hour from now
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const isValid = title.trim().length >= 2;
  const isPast = scheduledDate < new Date();

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });

  const handleCreate = async () => {
    if (!isValid) return;
    if (isPast) {
      Alert.alert('Invalid Schedule', 'Please select a future date and time.');
      return;
    }
    try {
      setSaving(true);
      const auction = await auctionsApi.create({
        title: title.trim(),
        startTime: scheduledDate.toISOString(),
      });
      router.replace(`/auction/${auction.id}`);
    } catch (e) {
      console.error('Create auction error:', e);
      Alert.alert('Error', 'Failed to create auction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#111827' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={{
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: 1, borderColor: '#1F2937',
      }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: '#1A56DB', fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18, flex: 1 }}>
          Create Auction
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: isValid && !saving && !isPast ? '#1A56DB' : '#374151',
            borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
          }}
          onPress={() => void handleCreate()}
          disabled={!isValid || saving || isPast}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{
            color: '#9CA3AF', fontSize: 12, fontWeight: '600',
            marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Auction Title *
          </Text>
          <TextInput
            style={{
              backgroundColor: '#1F2937', borderRadius: 12,
              borderWidth: 1, borderColor: title.length >= 2 ? '#1A56DB' : '#374151',
              padding: 14, color: '#fff', fontSize: 15,
            }}
            placeholder="e.g. Weekend Sneaker Drop"
            placeholderTextColor="#4B5563"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            autoFocus
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
            <Text style={{ color: '#4B5563', fontSize: 11 }}>{title.length}/100</Text>
          </View>
        </View>

        {/* Schedule */}
        <Text style={{
          color: '#9CA3AF', fontSize: 12, fontWeight: '600',
          marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          Scheduled Start *
        </Text>

        {/* Date picker row */}
        <TouchableOpacity
          style={{
            backgroundColor: '#1F2937', borderRadius: 12,
            borderWidth: 1, borderColor: '#374151',
            padding: 14, marginBottom: 10,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
          onPress={() => setShowDatePicker(true)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 18 }}>📅</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Date</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {formatDate(scheduledDate)}
          </Text>
        </TouchableOpacity>

        {/* Time picker row */}
        <TouchableOpacity
          style={{
            backgroundColor: '#1F2937', borderRadius: 12,
            borderWidth: 1, borderColor: '#374151',
            padding: 14, marginBottom: 24,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
          onPress={() => setShowTimePicker(true)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 18 }}>🕐</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Time</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {formatTime(scheduledDate)}
          </Text>
        </TouchableOpacity>

        {isPast && (
          <View style={{
            backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10,
            borderWidth: 1, borderColor: '#DC2626',
            padding: 12, marginBottom: 16, flexDirection: 'row', gap: 8, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 16 }}>⚠️</Text>
            <Text style={{ color: '#F87171', fontSize: 13 }}>
              Please select a future date and time.
            </Text>
          </View>
        )}

        {/* iOS inline pickers */}
        {showDatePicker && (
          <View style={{
            backgroundColor: '#1F2937', borderRadius: 12,
            marginBottom: 12, overflow: 'hidden',
          }}>
            <DateTimePicker
              value={scheduledDate}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              themeVariant="dark"
              onChange={(_, date) => {
                if (date) {
                  const updated = new Date(scheduledDate);
                  updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                  setScheduledDate(updated);
                }
                setShowDatePicker(false);
              }}
            />
          </View>
        )}

        {showTimePicker && (
          <View style={{
            backgroundColor: '#1F2937', borderRadius: 12,
            marginBottom: 12, overflow: 'hidden',
          }}>
            <DateTimePicker
              value={scheduledDate}
              mode="time"
              display="spinner"
              themeVariant="dark"
              onChange={(_, date) => {
                if (date) {
                  const updated = new Date(scheduledDate);
                  updated.setHours(date.getHours(), date.getMinutes());
                  setScheduledDate(updated);
                }
                setShowTimePicker(false);
              }}
            />
          </View>
        )}

        {/* Summary card */}
        {isValid && !isPast && (
          <View style={{
            backgroundColor: '#1F2937', borderRadius: 16,
            padding: 16, borderWidth: 1, borderColor: '#374151',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Preview
            </Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
              {title}
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>
              📅 {formatDate(scheduledDate)} at {formatTime(scheduledDate)}
            </Text>
          </View>
        )}

        {/* Info */}
        {[
          { emoji: '📦', text: 'Add items to your queue after creating' },
          { emoji: '🔴', text: 'Go live anytime — schedule is shown to buyers' },
          { emoji: '🔨', text: 'Buyers bid in real-time with countdown timers' },
        ].map((item, i) => (
          <View key={i} style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: '#1F2937', borderRadius: 12,
            padding: 14, marginBottom: 10,
          }}>
            <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, flex: 1 }}>{item.text}</Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}