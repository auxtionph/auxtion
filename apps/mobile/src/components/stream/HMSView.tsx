import React from 'react';
import { ViewStyle } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HMSNativeView: React.ComponentType<any>;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  HMSNativeView = require('@100mslive/react-native-hms/lib/commonjs/classes/HmsView').HmsViewComponent;
} catch {
  HMSNativeView = () => null;
}

interface HMSViewProps {
  trackId: string;
  id: string;
  mirror?: boolean;
  scaleType?: string;
  style?: ViewStyle;
  isLocal?: boolean;
}

export const HMSView = ({ trackId, id, mirror = false, scaleType = 'ASPECT_FILL', style, isLocal = false }: HMSViewProps) => {
  if (!HMSNativeView) return null;
  return (
    <HMSNativeView
      trackId={trackId}
      id={id}
      mirror={mirror}
      scaleType={scaleType}
      setZOrderMediaOverlay={isLocal}
      style={style}
    />
  );
};