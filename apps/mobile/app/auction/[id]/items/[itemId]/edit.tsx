import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PhotoSlotRow } from '../../../../../src/components/PhotoSlotRow';
import { shopItemsApi, ShopItemPhoto } from '../../../../../src/services/api/shop-items.api';
import type { CloudinaryPhoto } from '../../../../../src/lib/cloudinary';

export default function ItemEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [priceText, setPriceText] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<CloudinaryPhoto[]>([]);
  const [initialPhotos, setInitialPhotos] = useState<(CloudinaryPhoto | null)[] | undefined>();
  const [isPhotosUploading, setIsPhotosUploading] = useState(false);
  const [itemType, setItemType] = useState<'AUCTION' | 'BUY_NOW'>('AUCTION');
  const mountedRef = useRef(false);


  const handlePhotosChange = useCallback((p: CloudinaryPhoto[]) => {
    if (!mountedRef.current) {
        mountedRef.current = true;
        return;
    }
    setPhotos(p);
    }, []);

  // Ref-mirror for photos — read inside async handlers without stale closure
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const item = await shopItemsApi.getById(itemId);
        if (cancelled) return;

        setTitle(item.title ?? '');
        setPriceText(String(Math.floor((item.price ?? 0) / 100)));
        setDescription(item.description ?? '');
        setItemType((item.type as 'AUCTION' | 'BUY_NOW') ?? 'AUCTION');

        const existing = (item.photos as ShopItemPhoto[]) ?? [];
        const seeded: (CloudinaryPhoto | null)[] = [
          existing[0]
            ? { url: existing[0].url, publicId: existing[0].publicId, width: existing[0].width ?? 0, height: existing[0].height ?? 0 }
            : null,
          existing[1]
            ? { url: existing[1].url, publicId: existing[1].publicId, width: existing[1].width ?? 0, height: existing[1].height ?? 0 }
            : null,
          existing[2]
            ? { url: existing[2].url, publicId: existing[2].publicId, width: existing[2].width ?? 0, height: existing[2].height ?? 0 }
            : null,
        ];
        setInitialPhotos(seeded);
        setPhotos(existing.map((p) => ({ url: p.url, publicId: p.publicId, width: p.width ?? 0, height: p.height ?? 0 })));
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to load item');
        router.back();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [itemId, router]);

  const handleSave = useCallback(async () => {
    if (isPhotosUploading) {
      Alert.alert('Still uploading', 'Wait for photos to finish.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title required');
      return;
    }
    const priceCentavos = Math.round(parseFloat(priceText) * 100);
    if (isNaN(priceCentavos) || priceCentavos <= 0) {
      Alert.alert('Invalid price', 'Enter a price greater than 0.');
      return;
    }

    setSaving(true);
    try {
      await shopItemsApi.update(itemId, {
        title: title.trim(),
        price: priceCentavos,
        description: description.trim() || undefined,
        photos: photosRef.current,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }, [itemId, title, priceText, description, isPhotosUploading, router]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const showPhotoWarning = photos.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {itemType === 'BUY_NOW' ? '🏷️ Edit Buy Now Item' : '🔨 Edit Queue Item'}
        </Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving || isPhotosUploading}
          style={[styles.saveBtn, (saving || isPhotosUploading) && styles.saveBtnDisabled]}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photos</Text>
          {initialPhotos !== undefined && (
            <PhotoSlotRow
              labels={['Front', 'Back', 'Tag']}
              initialPhotos={initialPhotos}
              onChange={setPhotos}
              onUploadingChange={setIsPhotosUploading}
            />
          )}
          {showPhotoWarning && (
            <View style={styles.warning}>
              <Ionicons name="information-circle-outline" size={16} color="#f59e0b" />
              <Text style={styles.warningText}>
                Add photos to boost visibility and buyer trust.
              </Text>
            </View>
          )}
        </View>

        {/* Item type — read only */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={styles.sectionLabel}>Item Type</Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: itemType === 'BUY_NOW'
              ? 'rgba(16,185,129,0.1)' : 'rgba(26,86,219,0.1)',
            borderRadius: 10, padding: 14,
            borderWidth: 1,
            borderColor: itemType === 'BUY_NOW'
              ? 'rgba(16,185,129,0.3)' : 'rgba(26,86,219,0.3)',
          }}>
            <Text style={{ fontSize: 20 }}>{itemType === 'BUY_NOW' ? '🏷️' : '🔨'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                {itemType === 'BUY_NOW' ? 'Buy Now' : 'Auction Queue'}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                Type cannot be changed after creation
              </Text>
            </View>
          </View>
        </View>

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Vintage Levi's 501"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={styles.input}
          />
        </View>

        {/* Price */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Starting Price (₱)</Text>
          <TextInput
            value={priceText}
            onChangeText={setPriceText}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.3)"
            style={styles.input}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Condition, size, notes..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            multiline
            numberOfLines={4}
            style={[styles.input, styles.textarea]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 12,
    flex: 1,
  },
});