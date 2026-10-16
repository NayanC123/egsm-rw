// src/services/audioVideoService.tsx
// Safe dynamic wrapper around expo-av with zero-crash fallbacks.
// If ExponentAV native module is missing (e.g. running in Expo Go),
// the app runs cleanly without [runtime not ready] boot crashes.

import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';

let NativeAudio: any = null;
let NativeVideo: any = null;
let NativeResizeMode: any = null;
let isNativeAVAvailable: boolean = false;

try {
  // Dynamically require expo-av inside try/catch so Metro doesn't throw at boot
  // if ExponentAV native module is missing from the client binary (e.g. Expo Go).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExpoAV = require('expo-av');
  if (ExpoAV && ExpoAV.Audio) {
    NativeAudio = ExpoAV.Audio;
    NativeVideo = ExpoAV.Video;
    NativeResizeMode = ExpoAV.ResizeMode;
    isNativeAVAvailable = true;
  }
} catch (err) {
  // ExponentAV native module is not linked in this runtime (e.g. Expo Go)
  isNativeAVAvailable = false;
}

export { isNativeAVAvailable };

/**
 * Returns the native Audio module if available in this runtime, otherwise null.
 */
export function getNativeAudio(): any | null {
  return NativeAudio;
}

/**
 * Safe ResizeMode enum / object
 */
export const SafeResizeMode = {
  CONTAIN: NativeResizeMode?.CONTAIN || 'contain',
  COVER: NativeResizeMode?.COVER || 'cover',
  STRETCH: NativeResizeMode?.STRETCH || 'stretch',
};

/**
 * Fallback Video player component used when native ExponentAV is not compiled into the runtime (Expo Go).
 * Renders a clean video card that launches the video in the system/native player via Linking.openURL.
 */
const FallbackVideoPlayer: React.FC<{
  source: { uri: string };
  style?: any;
  useNativeControls?: boolean;
  resizeMode?: any;
}> = ({ source, style }) => {
  return (
    <View style={[styles.fallbackContainer, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.fallbackButton}
        onPress={() => source?.uri && Linking.openURL(source.uri)}
      >
        <View style={styles.playIconCircle}>
          <Text style={styles.playIconText}>▶</Text>
        </View>
        <Text style={styles.fallbackTitle}>Play Video</Text>
        <Text style={styles.fallbackSubtitle}>Tap to open in system player</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Safe Video component:
 * Uses native expo-av Video if available; otherwise renders the fallback player.
 */
export const SafeVideo: React.FC<any> = (props) => {
  if (isNativeAVAvailable && NativeVideo) {
    const Component = NativeVideo;
    return <Component {...props} />;
  }
  return <FallbackVideoPlayer {...props} />;
};

const styles = StyleSheet.create({
  fallbackContainer: {
    backgroundColor: '#050A0E',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fallbackButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  playIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 255, 204, 0.15)',
    borderWidth: 1,
    borderColor: '#00FFCC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  playIconText: {
    color: '#00FFCC',
    fontSize: 20,
    marginLeft: 3, // visual optical center
  },
  fallbackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  fallbackSubtitle: {
    color: '#7E8E9C',
    fontSize: 11,
    marginTop: 2,
  },
});
