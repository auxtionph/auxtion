import React from 'react';
import { View, Image, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Photo = { url: string };

type Props = {
  photos?: Photo[] | null;
  sellerAvatarUrl?: string | null;
  size?: number;
  borderRadius?: number;
  containerStyle?: ViewStyle;
};

export function ShopItemPhoto({
  photos,
  sellerAvatarUrl,
  size = 80,
  borderRadius = 10,
  containerStyle,
}: Props) {
  const dim = { width: size, height: size, borderRadius };
  const hasPhoto = Array.isArray(photos) && photos.length > 0 && !!photos[0]?.url;

  if (hasPhoto) {
    return (
      <Image
        source={{ uri: photos![0].url }}
        style={[styles.image, dim as ImageStyle, containerStyle as ImageStyle]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.fallback, dim, containerStyle]}>
      {sellerAvatarUrl ? (
        <Image
          source={{ uri: sellerAvatarUrl }}
          style={{
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: size * 0.55,
          }}
          resizeMode="cover"
        />
      ) : (
        <Ionicons name="person" size={size * 0.4} color="rgba(255,255,255,0.6)" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});