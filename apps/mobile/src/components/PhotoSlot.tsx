import React from 'react';
import {
  View,
  Pressable,
  Image,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type PhotoSlotState =
  | { status: 'empty' }
  | { status: 'uploading'; localUri: string; progress: number }
  | { status: 'done'; url: string }
  | { status: 'error'; localUri: string; message: string };

type Props = {
  label: string;
  state: PhotoSlotState;
  onPress: () => void;
  onRetry: () => void;
  onRemove: () => void;
  size?: number;
};

export function PhotoSlot({ label, state, onPress, onRetry, onRemove, size = 100 }: Props) {
  const dim = { width: size, height: size };

  if (state.status === 'empty') {
    return (
      <Pressable onPress={onPress} style={[styles.slot, styles.empty, dim]}>
        <Ionicons name="camera-outline" size={28} color="rgba(255,255,255,0.7)" />
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  }

  if (state.status === 'uploading') {
    return (
      <View style={[styles.slot, dim]}>
        <Image source={{ uri: state.localUri }} style={[styles.image, dim]} />
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.progressText}>{Math.round(state.progress * 100)}%</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={[styles.slot, dim]}>
        <Image source={{ uri: state.localUri }} style={[styles.image, dim]} />
        <Pressable onPress={onRetry} style={[styles.overlay, styles.errorOverlay]}>
          <Ionicons name="refresh" size={24} color="#fff" />
          <Text style={styles.errorText}>Retry</Text>
        </Pressable>
        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={10}>
          <Ionicons name="close-circle" size={22} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.slot, dim]}>
      <Image source={{ uri: state.url }} style={[styles.image, dim]} />
      <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={10}>
        <Ionicons name="close-circle" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    backgroundColor: 'rgba(220,38,38,0.65)',
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  errorText: {
    color: '#fff',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
});