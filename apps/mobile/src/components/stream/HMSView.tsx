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
  setZOrderMediaOverlay?: boolean;
  autoSimulcast?: boolean;
  style?: ViewStyle;
}

export const HMSView = ({ trackId, id, mirror = false, scaleType = 'ASPECT_FILL', setZOrderMediaOverlay = false, autoSimulcast = true, style }: HMSViewProps) => {
  if (!HMSNativeView) return null;
  return (
    <HMSNativeView
      trackId={trackId}
      id={id}
      mirror={mirror}
      scaleType={scaleType}
      setZOrderMediaOverlay={setZOrderMediaOverlay}
      autoSimulcast={autoSimulcast}
      style={style}
    />
  );
};