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
import { useState, useCallback, useRef } from 'react';
import { shopItemsApi } from '../../../../src/services/api/shop-items.api';
import { computeMinimumOffer, formatPHP } from '@auxtion/utils';
import { apiClient } from '../../../../src/services/api/client';
import { PhotoSlotRow } from '../../../../src/components/PhotoSlotRow';
import type { CloudinaryPhoto } from '../../../../src/lib/cloudinary';

export default function AddItemScreen() {
  const { id: auctionId, type: typeParam } = useLocalSearchParams<{ id: string; type?: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<CloudinaryPhoto[]>([]);
  const [isPhotosUploading, setIsPhotosUploading] = useState(false);
  const [itemType, setItemType] = useState<'AUCTION' | 'BUY_NOW'>(
    typeParam === 'BUY_NOW' ? 'BUY_NOW' : 'AUCTION'
  );

  const photosRef = useRef(photos);
  photosRef.current = photos;

  const price = parseInt(priceInput.replace(/[^0-9]/g, ''), 10) || 0;
  const isValid = title.trim().length > 0 && price >= 1;

  const handleSave = async () => {
    if (!isValid) return;
    if (isPhotosUploading) {
      Alert.alert('Still uploading', 'Wait for photos to finish.');
      return;
    }
    try {
      setSaving(true);

      const newItem = await shopItemsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        photos: photosRef.current,
        price: price * 100,
        type: itemType,
      });

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
          {itemType === 'BUY_NOW' ? 'Add Buy Now Item' : 'Add Item to Queue'}
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: isValid && !saving && !isPhotosUploading ? '#1A56DB' : '#374151',
            borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
          }}
          onPress={() => void handleSave()}
          disabled={!isValid || saving || isPhotosUploading}
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
        {/* Photos */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{
            color: '#9CA3AF', fontSize: 12, fontWeight: '600',
            marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Photos
          </Text>
          <PhotoSlotRow
            labels={['Front', 'Back', 'Tag']}
            onChange={setPhotos}
            onUploadingChange={setIsPhotosUploading}
          />
          {photos.length === 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              marginTop: 8, paddingHorizontal: 12, paddingVertical: 8,
              backgroundColor: 'rgba(245,158,11,0.08)',
              borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
            }}>
              <Text style={{ fontSize: 14 }}>💡</Text>
              <Text style={{ color: '#f59e0b', fontSize: 12, flex: 1 }}>
                Add photos to boost visibility and buyer trust.
              </Text>
            </View>
          )}
        </View>

        {/* Type selector */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Item Type
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 14,
                borderRadius: 14, borderWidth: 1,
                backgroundColor: itemType === 'AUCTION' ? 'rgba(26,86,219,0.15)' : '#111827',
                borderColor: itemType === 'AUCTION' ? '#1A56DB' : '#1F2937',
              }}
              onPress={() => setItemType('AUCTION')}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>🔨</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Queue</Text>
              <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>Auctioned live</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 14,
                borderRadius: 14, borderWidth: 1,
                backgroundColor: itemType === 'BUY_NOW' ? 'rgba(16,185,129,0.15)' : '#111827',
                borderColor: itemType === 'BUY_NOW' ? '#10B981' : '#1F2937',
              }}
              onPress={() => setItemType('BUY_NOW')}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>🏷️</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Buy Now</Text>
              <Text style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>Fixed price</Text>
            </TouchableOpacity>
          </View>
        </View>

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
            Description (optional)
          </Text>
          <TextInput
            style={{
              backgroundColor: '#111827', borderRadius: 12,
              borderWidth: 1, borderColor: description ? '#1A56DB' : '#1F2937',
              padding: 14, color: '#fff', fontSize: 15,
              minHeight: 100, textAlignVertical: 'top',
            }}
            placeholder="Condition, brand, size, notes..."
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
              onChangeText={(text) => setPriceInput(text.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
            />
          </View>
          {price > 0 && (
            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 6 }}>
              Minimum offer: {formatPHP(computeMinimumOffer(price * 100))} (70% of starting price)
            </Text>
          )}
        </View>

        {/* Preview */}
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
                <Text style={{ color: itemType === 'BUY_NOW' ? '#10B981' : '#F59E0B', fontSize: 13 }}>
                  {itemType === 'BUY_NOW' ? 'Buy Now · ' : 'Starting at · '}{formatPHP(price * 100)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}