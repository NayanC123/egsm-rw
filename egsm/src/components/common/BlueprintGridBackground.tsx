// src/components/common/BlueprintGridBackground.tsx
// Full-screen architectural graph-paper / blueprint background.
// STRICT ANTI-CRASH: Only built-in React Native Animated, Easing, Dimensions, View.
// pointerEvents="none" — never intercepts touches. absoluteFillObject positioning.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const MINOR_GRID = 24;   // px — minor hairline grid spacing
const MAJOR_GRID = 120;  // px — major blueprint grid spacing (every 5th line)
const TICK_SIZE  = 5;    // px — crosshair tick accent size

const BlueprintGridBackground: React.FC = () => {
  const { isDark } = useTheme();

  // ── Responsive to orientation changes ──────────────────────────
  const [dims, setDims] = React.useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => {
      setDims(screen);
    });
    return () => sub.remove();
  }, []);

  const { width, height } = dims;

  // ── Color tokens (theme-aware) ──────────────────────────────────
  const minorLineColor  = isDark ? 'rgba(0, 255, 204, 0.035)' : 'rgba(5, 10, 14, 0.045)';
  const majorLineColor  = isDark ? 'rgba(0, 255, 204, 0.08)'  : 'rgba(0, 184, 148, 0.09)';
  const tickColor       = isDark ? 'rgba(0, 255, 204, 0.10)'  : 'rgba(0, 184, 148, 0.12)';

  // ── Breathing ambient glow animations ──────────────────────────
  const glowAnim1 = useRef(new Animated.Value(0)).current;
  const glowAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim1, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim1, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim2, {
          toValue: 1,
          duration: 7200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim2, {
          toValue: 0,
          duration: 7200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Stagger the second loop so they breathe at different phases
    const staggerTimer = setTimeout(() => loop2.start(), 3000);
    loop1.start();

    return () => {
      clearTimeout(staggerTimer);
      loop1.stop();
      loop2.stop();
    };
  }, [glowAnim1, glowAnim2]);

  // Scale glow opacity: subtle pulse between 0.6 and 1.0
  const glow1Opacity = glowAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.0],
  });
  const glow2Opacity = glowAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.0],
  });
  // Slight scale drift for the breathing feel
  const glow1Scale = glowAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const glow2Scale = glowAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  // ── Build grid lines ────────────────────────────────────────────
  const verticalLines: React.ReactElement[] = [];
  const horizontalLines: React.ReactElement[] = [];
  const crosshairs: React.ReactElement[] = [];

  // Vertical lines
  for (let x = MINOR_GRID; x < width; x += MINOR_GRID) {
    const isMajor = x % MAJOR_GRID === 0;
    verticalLines.push(
      <View
        key={`v${x}`}
        style={[
          styles.vLine,
          {
            left: x,
            height,
            backgroundColor: isMajor ? majorLineColor : minorLineColor,
            width: isMajor ? 1 : 1,
            opacity: isMajor ? 1 : 0.8,
          },
        ]}
        pointerEvents="none"
      />
    );
  }

  // Horizontal lines
  for (let y = MINOR_GRID; y < height; y += MINOR_GRID) {
    const isMajor = y % MAJOR_GRID === 0;
    horizontalLines.push(
      <View
        key={`h${y}`}
        style={[
          styles.hLine,
          {
            top: y,
            width,
            backgroundColor: isMajor ? majorLineColor : minorLineColor,
            height: isMajor ? 1 : 1,
            opacity: isMajor ? 1 : 0.8,
          },
        ]}
        pointerEvents="none"
      />
    );
  }

  // Crosshair tick accents at major intersections
  for (let x = MAJOR_GRID; x < width; x += MAJOR_GRID) {
    for (let y = MAJOR_GRID; y < height; y += MAJOR_GRID) {
      crosshairs.push(
        // Horizontal tick
        <View
          key={`ch${x}-${y}`}
          style={[
            styles.tickH,
            {
              left: x - TICK_SIZE,
              top: y,
              backgroundColor: tickColor,
            },
          ]}
          pointerEvents="none"
        />,
        // Vertical tick
        <View
          key={`cv${x}-${y}`}
          style={[
            styles.tickV,
            {
              left: x,
              top: y - TICK_SIZE,
              backgroundColor: tickColor,
            },
          ]}
          pointerEvents="none"
        />
      );
    }
  }

  const glowSize = Math.max(width, height) * 0.65;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Minor + Major grid lines */}
      {verticalLines}
      {horizontalLines}
      {crosshairs}

      {/* Top-right cyan ambient glow */}
      <Animated.View
        style={[
          styles.glowCircle,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: isDark
              ? 'rgba(0, 255, 204, 0.05)'
              : 'rgba(0, 184, 148, 0.04)',
            right: -glowSize * 0.35,
            top: -glowSize * 0.35,
            opacity: glow1Opacity,
            transform: [{ scale: glow1Scale }],
          },
        ]}
        pointerEvents="none"
      />

      {/* Bottom-left amber ambient glow */}
      <Animated.View
        style={[
          styles.glowCircle,
          {
            width: glowSize * 0.85,
            height: glowSize * 0.85,
            borderRadius: (glowSize * 0.85) / 2,
            backgroundColor: isDark
              ? 'rgba(255, 102, 0, 0.04)'
              : 'rgba(255, 102, 0, 0.025)',
            left: -glowSize * 0.3,
            bottom: -glowSize * 0.3,
            opacity: glow2Opacity,
            transform: [{ scale: glow2Scale }],
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  vLine: {
    position: 'absolute',
    top: 0,
  },
  hLine: {
    position: 'absolute',
    left: 0,
  },
  tickH: {
    position: 'absolute',
    width: TICK_SIZE * 2,
    height: 1,
  },
  tickV: {
    position: 'absolute',
    width: 1,
    height: TICK_SIZE * 2,
  },
  glowCircle: {
    position: 'absolute',
  },
});

export default BlueprintGridBackground;
