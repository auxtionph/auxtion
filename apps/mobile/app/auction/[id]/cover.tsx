import { View, Image, TouchableOpacity, StatusBar, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { auctionsApi } from '../../../src/services/api/auctions.api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AuctionCoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    auctionsApi.getById(id).then(a => {
      setCoverUrl(a.coverImageUrl ?? null);
    }).catch(() => router.back());
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" />

      {/* Close button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: 'absolute', top: insets.top + 12, left: 16,
          zIndex: 10,
          backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
          width: 40, height: 40,
          alignItems: 'center', justifyContent: 'center',
        }}
        hitSlop={10}
      >
        <Ionicons name="close" size={22} color="#fff" />
      </TouchableOpacity>

      {/* Full screen image */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.3)" />
        </View>
      )}
    </View>
  );
}