// src/components/stream/HMSView.tsx
import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { HMSVideoViewMode } from '@100mslive/react-native-hms';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hmsInstance: any;
  trackId: string | null | undefined;
  mirror?: boolean;
  style?: ViewStyle;
}

export const HMSVideoView = ({ hmsInstance, trackId, mirror = false, style }: Props) => {
  if (!trackId || !hmsInstance) {
    return (
      <View
        style={[
          { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
          style,
        ]}
      >
        <Text style={{ color: '#6B7280', fontSize: 13 }}>Waiting for video...</Text>
      </View>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const HmsView = hmsInstance.HmsView;

  // ✅ Wrap in View — HmsView renders a Fragment internally and cannot
  //    accept style directly, which causes the React.Fragment style warning
  return (
    <View style={[{ flex: 1 }, style]}>
      <HmsView
        trackId={trackId}
        mirror={mirror}
        scaleType={HMSVideoViewMode.ASPECT_FILL}
        style={{ flex: 1 }}
      />
    </View>
  );
};