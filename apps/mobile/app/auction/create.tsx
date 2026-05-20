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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { auctionsApi } from '../../src/services/api/auctions.api';
import { useAuthStore } from '../../src/stores/auth.store';
import { AuctionCoverSlot } from '../../src/components/AuctionCoverSlot';

export default function CreateAuctionScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
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

  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [isCoverUploading, setIsCoverUploading] = useState(false);

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
        coverImageUrl: coverImageUrl || undefined,
      });
      router.replace(`/auction/${auction.id}`);
    } catch (e) {
      console.error('Create auction error:', e);
      Alert.alert('Error', 'Failed to create auction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const [takenSlots, setTakenSlots] = useState<{ hour: number; minute: number; title: string }[]>([]);
  const isSlotTaken = (hour: number, minute: number) => {
    // Convert hour from 12h to 24h for comparison
    return takenSlots.some(s => s.hour === hour && s.minute === minute);
  };

  useEffect(() => {
    if (!user?.id) return;
    const dateStr = scheduledDate.toISOString().split('T')[0];
    void auctionsApi.getScheduledSlots(user.id, dateStr).then(slots => {
      setTakenSlots(slots);
    }).catch(() => {});
  }, [scheduledDate.toDateString(), user?.id]);
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
            backgroundColor: isValid && !saving && !isPast && !isCoverUploading && !isSlotTaken(scheduledDate.getHours(), scheduledDate.getMinutes()) ? '#1A56DB' : '#374151',
            borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
          }}
          onPress={() => void handleCreate()}
          disabled={!isValid || saving || isPast || isCoverUploading || isSlotTaken(scheduledDate.getHours(), scheduledDate.getMinutes())}
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

        {/* Cover Photo */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              color: '#9CA3AF', fontSize: 12, fontWeight: '600',
              marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Cover Photo
            </Text>
            <AuctionCoverSlot
              onUploaded={setCoverImageUrl}
              onUploadingChange={setIsCoverUploading}
            />
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

        {/* After the time picker row TouchableOpacity, add: */}
        {isSlotTaken(scheduledDate.getHours(), scheduledDate.getMinutes()) && (
          <View style={{
            backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10,
            borderWidth: 1, borderColor: '#DC2626',
            padding: 12, marginBottom: 16, flexDirection: 'row', gap: 8, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 16 }}>⚠️</Text>
            <Text style={{ color: '#F87171', fontSize: 13 }}>
              This time slot is already taken. Please select a different time.
            </Text>
          </View>
        )}

        {/* Date Picker Modal */}
        <Modal visible={showDatePicker} transparent animationType="slide">
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          />
          <View style={{ backgroundColor: '#1F2937', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={{ color: '#1A56DB', fontSize: 15, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {/* Month */}
              <View style={{ flex: 2 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 8 }}>MONTH</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                    <TouchableOpacity
                      key={m}
                      style={{
                        padding: 10, borderRadius: 8, marginBottom: 4,
                        backgroundColor: scheduledDate.getMonth() === i ? '#1A56DB' : '#111827',
                      }}
                      onPress={() => {
                        const d = new Date(scheduledDate);
                        d.setMonth(i);
                        setScheduledDate(d);
                      }}
                    >
                      <Text style={{ color: '#fff', textAlign: 'center' }}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Day */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 8 }}>DAY</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {Array.from(
                    { length: new Date(scheduledDate.getFullYear(), scheduledDate.getMonth() + 1, 0).getDate() },
                    (_, i) => i + 1
                  ).map(d => (
                    <TouchableOpacity
                      key={d}
                      style={{
                        padding: 10, borderRadius: 8, marginBottom: 4,
                        backgroundColor: scheduledDate.getDate() === d ? '#1A56DB' : '#111827',
                      }}
                      onPress={() => {
                        const date = new Date(scheduledDate);
                        date.setDate(d);
                        setScheduledDate(date);
                      }}
                    >
                      <Text style={{ color: '#fff', textAlign: 'center' }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Year */}
              <View style={{ flex: 1.5 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 8 }}>YEAR</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i).map(y => (
                    <TouchableOpacity
                      key={y}
                      style={{
                        padding: 10, borderRadius: 8, marginBottom: 4,
                        backgroundColor: scheduledDate.getFullYear() === y ? '#1A56DB' : '#111827',
                      }}
                      onPress={() => {
                        const d = new Date(scheduledDate);
                        d.setFullYear(y);
                        setScheduledDate(d);
                      }}
                    >
                      <Text style={{ color: '#fff', textAlign: 'center' }}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>

        {/* Time Picker Modal */}
        <Modal visible={showTimePicker} transparent animationType="slide">
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
            activeOpacity={1}
            onPress={() => setShowTimePicker(false)}
          />
          <View style={{ backgroundColor: '#1F2937', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={{ color: '#1A56DB', fontSize: 15, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {/* Hour */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 8 }}>HOUR</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => {
                    const isPM = scheduledDate.getHours() >= 12;
                    const hour24 = isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                    const taken = isSlotTaken(hour24, scheduledDate.getMinutes());
                    const isSelected = (scheduledDate.getHours() % 12 || 12) === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        disabled={taken}
                        style={{
                          padding: 10, borderRadius: 8, marginBottom: 4,
                          backgroundColor: isSelected ? '#1A56DB' : taken ? '#3B1515' : '#111827',
                          opacity: taken ? 0.7 : 1,
                        }}
                        onPress={() => {
                          const d = new Date(scheduledDate);
                          const isPM = scheduledDate.getHours() >= 12;
                          d.setHours(isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h));
                          setScheduledDate(d);
                        }}
                      >
                        <Text style={{ color: taken ? '#EF4444' : '#fff', textAlign: 'center' }}>
                          {h}{taken ? ' ✕' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {/* Minute */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 8 }}>MIN</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {[0, 15, 30, 45].map(m => {
                    const taken = isSlotTaken(scheduledDate.getHours(), m);
                    const isSelected = scheduledDate.getMinutes() === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        disabled={taken}
                        style={{
                          padding: 10, borderRadius: 8, marginBottom: 4,
                          backgroundColor: isSelected ? '#1A56DB' : taken ? '#3B1515' : '#111827',
                          opacity: taken ? 0.7 : 1,
                        }}
                        onPress={() => {
                          const d = new Date(scheduledDate);
                          d.setMinutes(m);
                          setScheduledDate(d);
                        }}
                      >
                        <Text style={{ color: taken ? '#EF4444' : '#fff', textAlign: 'center' }}>
                          {String(m).padStart(2, '0')}{taken ? ' ✕' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              {/* AM/PM */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 8 }}>AM/PM</Text>
                {['AM', 'PM'].map(period => (
                  <TouchableOpacity
                    key={period}
                    style={{
                      padding: 10, borderRadius: 8, marginBottom: 4,
                      backgroundColor: (scheduledDate.getHours() >= 12 ? 'PM' : 'AM') === period ? '#1A56DB' : '#111827',
                    }}
                    onPress={() => {
                      const d = new Date(scheduledDate);
                      const h = d.getHours();
                      if (period === 'AM' && h >= 12) d.setHours(h - 12);
                      if (period === 'PM' && h < 12) d.setHours(h + 12);
                      setScheduledDate(d);
                    }}
                  >
                    <Text style={{ color: '#fff', textAlign: 'center' }}>{period}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>

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