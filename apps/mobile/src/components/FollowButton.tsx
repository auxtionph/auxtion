import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';

interface Props {
  following: boolean;
  followerCount: number;
  loading: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
  showCount?: boolean;
}

export function FollowButton({
  following,
  followerCount,
  loading,
  onToggle,
  size = 'md',
  showCount = true,
}: Props) {
  const isSmall = size === 'sm';

  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <TouchableOpacity
        onPress={onToggle}
        disabled={loading}
        style={{
          backgroundColor: following ? 'rgba(255,255,255,0.12)' : '#1A56DB',
          borderWidth: 1,
          borderColor: following ? 'rgba(255,255,255,0.25)' : '#1A56DB',
          borderRadius: 999,
          paddingHorizontal: isSmall ? 12 : 16,
          paddingVertical: isSmall ? 5 : 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          opacity: loading ? 0.6 : 1,
          minWidth: isSmall ? 72 : 88,
          justifyContent: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{
            color: '#fff',
            fontSize: isSmall ? 12 : 13,
            fontWeight: '700',
          }}>
            {following ? '✓ Following' : '+ Follow'}
          </Text>
        )}
      </TouchableOpacity>
      {showCount && followerCount > 0 && (
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
          {followerCount.toLocaleString()} {followerCount === 1 ? 'follower' : 'followers'}
        </Text>
      )}
    </View>
  );
}