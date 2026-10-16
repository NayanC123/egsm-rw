// src/services/audioVideoService.tsx
// Completely zero-plugin crash-free implementation. No expo-av, no native crashes on boot.
import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';

export const isNativeAVAvailable: boolean = false;

/**
 * Returns null — voice playback & recording uses pure React Native and Linking.openURL without native plugins.
 */
export function getNativeAudio(): any | null {
  return null;
}

/**
 * Safe ResizeMode enum / object
 */
export const SafeResizeMode = {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'stretch',
};

/**
 * Clean Video player component that launches the video in the system player via Linking.openURL.
 */
export const SafeVideo: React.FC<{
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
    marginLeft: 3,
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
