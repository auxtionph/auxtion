import React from 'react';
import { View, Text, ViewStyle, Platform } from 'react-native';

interface Props {
  style?: ViewStyle;
}

const Placeholder = ({ style }: Props) => (
  <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }, style]}>
    <Text style={{ fontSize: 48 }}>📷</Text>
    <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8 }}>Live Camera</Text>
  </View>
);

// Only use native module on real device builds
// requireNativeComponent crashes on simulator — use placeholder instead
const IS_REAL_DEVICE = Platform.OS === 'ios';

let Native: React.ComponentType<Props> | null = null;

if (IS_REAL_DEVICE) {
  try {
    const RN = require('react-native');
    const component = RN.requireNativeComponent('HMSCameraPreview');
    // Test it's actually registered by checking it's not undefined
    if (component && typeof component === 'object') {
      Native = component as React.ComponentType<Props>;
    }
  } catch {
    Native = null;
  }
}

class SafeHMSCameraPreview extends React.Component<Props, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  render() {
    if (this.state.crashed || !Native) {
      return <Placeholder style={this.props.style} />;
    }
    return <Native style={this.props.style} />;
  }
}

export const HMSCameraPreview = (props: Props) => <SafeHMSCameraPreview {...props} />;
export default HMSCameraPreview;
