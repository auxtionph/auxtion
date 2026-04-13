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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { shopItemsApi } from '../../../../src/services/api/shop-items.api';
import { computeMinimumOffer, formatPHP } from '@auxtion/utils';
import { apiClient } from '../../../../src/services/api/client';

export default function AddItemScreen() {
  const { id: auctionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [saving, setSaving] = useState(false);

  const price = parseInt(priceInput.replace(/[^0-9]/g, ''), 10) || 0;
  const isValid = title.trim().length > 0 && price >= 1;

  const handleSave = async () => {
    if (!isValid) return;
    try {
        setSaving(true);

        // Step 1: Create item (no auctionId in DTO — backend doesn't accept it on create)
        const newItem = await shopItemsApi.create({
        title: title.trim(),
        description: description.trim().length >= 10 ? description.trim() : `${title.trim()} - auction item`,
        photos: [],
        price: price * 100,
        type: 'AUCTION',
        });

        // Step 2: Assign item to this auction via dedicated endpoint
        await apiClient.post(`/auctions/${auctionId}/items/${newItem.id}`);

        router.back();
    } catch (e) {
        console.log('Add item error:', JSON.stringify(e));
        Alert.alert('Error', 'Failed to add item. Please try again.');
    } finally {
        setSaving(false);
    }
    };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#1E2A3A' }}
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
          Add Item to Queue
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: isValid && !saving ? '#1A56DB' : '#374151',
            borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
          }}
          onPress={() => void handleSave()}
          disabled={!isValid || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo placeholder */}
        <TouchableOpacity style={{
          width: '100%', height: 180,
          backgroundColor: '#111827', borderRadius: 16,
          borderWidth: 2, borderColor: '#1F2937', borderStyle: 'dashed',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
        }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>📷</Text>
          <Text style={{ color: '#1A56DB', fontWeight: '600', fontSize: 14 }}>Add Photos</Text>
          <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Photo upload coming soon</Text>
        </TouchableOpacity>

        {/* Title */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Item Title *
          </Text>
          <TextInput
            style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: title ? '#1A56DB' : '#1F2937',
              padding: 14, color: '#fff', fontSize: 15,
            }}
            placeholder="e.g. Nike Air Jordan 1 Size 10"
            placeholderTextColor="#4B5563"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <Text style={{ color: '#4B5563', fontSize: 11, marginTop: 4, textAlign: 'right' }}>
            {title.length}/100
          </Text>
        </View>

        {/* Description */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Description
          </Text>
          <TextInput
            style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: description ? '#1A56DB' : '#1F2937',
              padding: 14, color: '#fff', fontSize: 15,
              minHeight: 100, textAlignVertical: 'top',
            }}
            placeholder="Describe the item condition, brand, size, etc."
            placeholderTextColor="#4B5563"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
          />
        </View>

        {/* Starting Price */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Starting Price (₱) *
          </Text>
          <View style={{
            backgroundColor: '#111827', borderRadius: 12,
            borderWidth: 1, borderColor: price > 0 ? '#1A56DB' : '#1F2937',
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
          }}>
            <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 8 }}>₱</Text>
            <TextInput
              style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '600', paddingVertical: 14 }}
              placeholder="0"
              placeholderTextColor="#4B5563"
              value={priceInput}
              onChangeText={(text) => {
                const cleaned = text.replace(/[^0-9]/g, '');
                setPriceInput(cleaned);
              }}
              keyboardType="numeric"
            />
          </View>
          {price > 0 && (
            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 6 }}>
              Minimum offer will e {formatPHP(computeMinimumOffer(price * 100))} (70% of starting price)

            </Text>
          )}
        </View>

        {/* Preview Card */}
        {title && price > 0 && (
          <View style={{
            backgroundColor: '#111827', borderRadius: 16,
            padding: 16, borderWidth: 1, borderColor: '#1F2937',
          }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Preview
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>📦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={{ color: '#F59E0B', fontSize: 13 }}>
                  Starting at {formatPHP(price * 100)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}