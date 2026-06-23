import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActionSheetIOS, Alert, Platform, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoSlot, PhotoSlotState } from './PhotoSlot';
import { uploadPhotoToCloudinary, CloudinaryPhoto } from '../lib/cloudinary';

type SlotLabels = [string, string, string];

type Props = {
  labels?: SlotLabels;
  initialPhotos?: (CloudinaryPhoto | null)[];
  onChange: (photos: CloudinaryPhoto[]) => void;
  onUploadingChange?: (isUploading: boolean) => void;
};

export function PhotoSlotRow({
  labels = ['Front', 'Back', 'Tag'],
  initialPhotos,
  onChange,
  onUploadingChange,
}: Props) {
  const [slots, setSlots] = useState<PhotoSlotState[]>(() => {
    if (initialPhotos) {
      const seeded = initialPhotos
        .slice(0, 3)
        .map<PhotoSlotState>((p) => (p ? { status: 'done', url: p.url } : { status: 'empty' }));
      while (seeded.length < 3) seeded.push({ status: 'empty' });
      return seeded;
    }
    return [{ status: 'empty' }, { status: 'empty' }, { status: 'empty' }];
  });

  const photoMetaRef = useRef<Map<number, CloudinaryPhoto>>(new Map());
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(() => {
    if (initialPhotos) {
      initialPhotos.forEach((p, i) => {
        if (p) photoMetaRef.current.set(i, p);
      });
    }
    // seed once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = useCallback(
    (next: PhotoSlotState[]) => {
        const photos: CloudinaryPhoto[] = [];
        next.forEach((s, i) => {
        if (s.status === 'done') {
            const meta = photoMetaRef.current.get(i);
            if (meta) photos.push(meta);
        }
        });
        const isUploading = next.some((s) => s.status === 'uploading');
        // Defer to avoid setState-during-render when called from initializer
        setTimeout(() => {
        onChange(photos);
        onUploadingChange?.(isUploading);
        }, 0);
    },
    [onChange, onUploadingChange],
    );

  const updateSlot = useCallback(
    (index: number, next: PhotoSlotState) => {
      setSlots((prev) => {
        const updated = [...prev];
        updated[index] = next;
        emit(updated);
        return updated;
      });
    },
    [emit],
  );

  const startUpload = useCallback(
    async (index: number, localUri: string) => {
      updateSlot(index, { status: 'uploading', localUri, progress: 0 });
      try {
        const result = await uploadPhotoToCloudinary(localUri, 'shop-items', (pct) => {
          setSlots((prev) => {
            const cur = prev[index];
            if (cur.status !== 'uploading') return prev;
            const updated = [...prev];
            updated[index] = { ...cur, progress: pct };
            return updated;
          });
        });
        photoMetaRef.current.set(index, result);
        setSlots((prev) => {
          const updated = [...prev];
          updated[index] = { status: 'done', url: result.url };
          emit(updated);
          return updated;
        });
      } catch (err: any) {
        updateSlot(index, {
          status: 'error',
          localUri,
          message: err.message || 'Upload failed',
        });
      }
    },
    [emit, updateSlot],
  );

  const pickImage = useCallback(
    async (index: number, source: 'camera' | 'library') => {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera access needed', 'Enable camera in Settings.');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Photo access needed', 'Enable photos in Settings.');
          return;
        }
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'] as any,
              quality: 0.85,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'] as any,
              quality: 0.85,
              allowsEditing: false,
            });

      if (result.canceled || !result.assets?.[0]) return;
      startUpload(index, result.assets[0].uri);
    },
    [startUpload],
  );

  const openPicker = useCallback(
    (index: number) => {
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
          (btn) => {
            if (btn === 1) pickImage(index, 'camera');
            if (btn === 2) pickImage(index, 'library');
          },
        );
      } else {
        Alert.alert('Add photo', undefined, [
          { text: 'Take Photo', onPress: () => pickImage(index, 'camera') },
          { text: 'Choose from Library', onPress: () => pickImage(index, 'library') },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    },
    [pickImage],
  );

  const handleRetry = useCallback(
    (index: number) => {
      const cur = slotsRef.current[index];
      if (cur.status === 'error') startUpload(index, cur.localUri);
    },
    [startUpload],
  );

  const handleRemove = useCallback(
    (index: number) => {
      photoMetaRef.current.delete(index);
      updateSlot(index, { status: 'empty' });
    },
    [updateSlot],
  );

  return (
    <View style={styles.row}>
      {slots.map((state, i) => (
        <PhotoSlot
          key={i}
          label={labels[i]}
          state={state}
          onPress={() => openPicker(i)}
          onRetry={() => handleRetry(i)}
          onRemove={() => handleRemove(i)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
});