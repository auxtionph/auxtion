import React, { useState } from 'react';
import {
  View,
  Image,
  Pressable,
  Text,
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { uploadPhotoToCloudinary } from '../lib/cloudinary';

type Props = {
  onUploaded: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

type SlotState =
  | { status: 'empty' }
  | { status: 'uploading'; localUri: string; progress: number }
  | { status: 'done'; url: string }
  | { status: 'error'; localUri: string };

export function AuctionCoverSlot({ onUploaded, onUploadingChange }: Props) {
  const [slot, setSlot] = useState<SlotState>({ status: 'empty' });

  const upload = async (localUri: string) => {
    setSlot({ status: 'uploading', localUri, progress: 0 });
    onUploadingChange?.(true);
    try {
      const result = await uploadPhotoToCloudinary(localUri, (pct) => {
        setSlot((prev) =>
          prev.status === 'uploading' ? { ...prev, progress: pct } : prev,
        );
      });
      setSlot({ status: 'done', url: result.url });
      onUploaded(result.url);
      onUploadingChange?.(false);
    } catch {
      setSlot({ status: 'error', localUri });
      onUploadingChange?.(false);
      Alert.alert('Upload failed', 'Tap to retry.');
    }
  };

  const pick = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Camera access needed'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Photo access needed'); return; }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });

    if (result.canceled || !result.assets?.[0]) return;
    upload(result.assets[0].uri);
  };

  const openPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (btn) => {
          if (btn === 1) pick('camera');
          if (btn === 2) pick('library');
        },
      );
    } else {
      Alert.alert('Add cover photo', undefined, [
        { text: 'Take Photo', onPress: () => pick('camera') },
        { text: 'Choose from Library', onPress: () => pick('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const remove = () => {
    setSlot({ status: 'empty' });
    onUploaded('');
  };

  if (slot.status === 'empty') {
    return (
      <Pressable onPress={openPicker} style={styles.empty}>
        <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.4)" />
        <Text style={styles.emptyLabel}>Add Cover Photo</Text>
        <Text style={styles.emptySubLabel}>Optional · shows on your auction page</Text>
      </Pressable>
    );
  }

  if (slot.status === 'uploading') {
    return (
      <View style={styles.filled}>
        <Image source={{ uri: slot.localUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.progressText}>{Math.round(slot.progress * 100)}%</Text>
        </View>
      </View>
    );
  }

  if (slot.status === 'error') {
    return (
      <Pressable onPress={() => upload(slot.localUri)} style={styles.filled}>
        <Image source={{ uri: slot.localUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={[styles.overlay, styles.errorOverlay]}>
          <Ionicons name="refresh" size={28} color="#fff" />
          <Text style={styles.progressText}>Tap to retry</Text>
        </View>
      </Pressable>
    );
  }

  // done
  return (
    <View style={styles.filled}>
      <Image source={{ uri: slot.url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      <Pressable onPress={remove} style={styles.removeBtn} hitSlop={10}>
        <Ionicons name="close-circle" size={24} color="#fff" />
      </Pressable>
      <Pressable onPress={openPicker} style={styles.changeBtn}>
        <Text style={styles.changeBtnText}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  emptySubLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
  },
  filled: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorOverlay: {
    backgroundColor: 'rgba(220,38,38,0.6)',
  },
  progressText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  changeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  changeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});