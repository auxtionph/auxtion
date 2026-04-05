import { requireNativeComponent, ViewStyle, Platform, View, Text } from 'react-native';

let HMSCameraPreviewNative: React.ComponentType<{ style?: ViewStyle }> | null = null;

try {
  HMSCameraPreviewNative = requireNativeComponent<{ style?: ViewStyle }>('HMSCameraPreview');
} catch {
  HMSCameraPreviewNative = null;
}

interface Props {
  style?: ViewStyle;
}

export const HMSCameraPreview = ({ style }: Props) => {
  if (!HMSCameraPreviewNative) {
    return (
      <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }, style]}>
        <Text style={{ color: '#fff', fontSize: 48 }}>📷</Text>
        <Text style={{ color: '#6B7280', fontSize: 14, marginTop: 8 }}>Camera preview</Text>
      </View>
    );
  }
  return <HMSCameraPreviewNative style={style} />;
};