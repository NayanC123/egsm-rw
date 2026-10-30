// src/components/common/AnimatedPrimitives.tsx
// Reusable 60fps animation primitives — built with ONLY React Native built-ins.
// STRICT ANTI-CRASH: No react-native-reanimated, no react-native-svg.
// Every fontWeight is a string. useNativeDriver: true on all animations.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';

// ─────────────────────────────────────────────────────────────
// 1. ScalePressable
// Drop-in animated Pressable with spring scale on press.
// Outer Animated.View and inner Pressable properly forward layout
// styles (flex, alignItems, justifyContent, padding) without collapsing.
// ─────────────────────────────────────────────────────────────

interface ScalePressableProps {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  /** hitSlop for the underlying Pressable */
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
  id?: string;
  activeOpacity?: number;
}

export const ScalePressable: React.FC<ScalePressableProps> = ({
  onPress,
  onLongPress,
  style,
  children,
  disabled = false,
  hitSlop,
  id,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      speed: 28,
      bounciness: 10,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1.0,
      speed: 28,
      bounciness: 10,
      useNativeDriver: true,
    }).start();
  };

  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const hasFlex = flat.flex !== undefined;

  const outerStyle: ViewStyle = {
    ...(hasFlex ? { flex: flat.flex } : {}),
    ...(flat.alignSelf ? { alignSelf: flat.alignSelf } : {}),
    ...(flat.alignItems ? { alignItems: flat.alignItems } : {}),
    ...(flat.justifyContent ? { justifyContent: flat.justifyContent } : {}),
    ...(flat.width !== undefined ? { width: flat.width } : {}),
    ...(flat.height !== undefined ? { height: flat.height } : {}),
    ...(flat.minWidth !== undefined ? { minWidth: flat.minWidth } : {}),
    ...(flat.minHeight !== undefined ? { minHeight: flat.minHeight } : {}),
    ...(flat.maxWidth !== undefined ? { maxWidth: flat.maxWidth } : {}),
    ...(flat.maxHeight !== undefined ? { maxHeight: flat.maxHeight } : {}),
    ...(flat.margin !== undefined ? { margin: flat.margin } : {}),
    ...(flat.marginTop !== undefined ? { marginTop: flat.marginTop } : {}),
    ...(flat.marginBottom !== undefined ? { marginBottom: flat.marginBottom } : {}),
    ...(flat.marginLeft !== undefined ? { marginLeft: flat.marginLeft } : {}),
    ...(flat.marginRight !== undefined ? { marginRight: flat.marginRight } : {}),
    ...(flat.marginHorizontal !== undefined ? { marginHorizontal: flat.marginHorizontal } : {}),
    ...(flat.marginVertical !== undefined ? { marginVertical: flat.marginVertical } : {}),
    ...(flat.position !== undefined ? { position: flat.position } : {}),
    ...(flat.top !== undefined ? { top: flat.top } : {}),
    ...(flat.bottom !== undefined ? { bottom: flat.bottom } : {}),
    ...(flat.left !== undefined ? { left: flat.left } : {}),
    ...(flat.right !== undefined ? { right: flat.right } : {}),
    ...(flat.zIndex !== undefined ? { zIndex: flat.zIndex } : {}),
  };

  return (
    <Animated.View style={[outerStyle, { transform: [{ scale }] }]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        hitSlop={hitSlop}
        disabled={disabled}
        testID={id}
        accessibilityRole="button"
        style={[
          style,
          hasFlex && { flex: 1, width: '100%' },
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────
// 2. FadeSlideIn
// Wraps children in a fade + translateY entrance animation on mount.
// Accepts style prop and applies flex: 1 when used as screen wrapper.
// ─────────────────────────────────────────────────────────────

interface FadeSlideInProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Delay in ms before the animation starts (for staggered lists) */
  delay?: number;
  /** Duration in ms for the opacity fade (default: 280) */
  duration?: number;
}

export const FadeSlideIn: React.FC<FadeSlideInProps> = ({
  children,
  style,
  delay = 0,
  duration = 280,
}) => {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        speed: 18,
        bounciness: 4,
        delay,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[{ opacity, transform: [{ translateY }] }, style]}
    >
      {children}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────
// 3. PulseIndicator
// Live pulsing neon dot with expanding outer ring in Animated.loop.
// ─────────────────────────────────────────────────────────────

interface PulseIndicatorProps {
  color?: string;
  size?: number;
}

export const PulseIndicator: React.FC<PulseIndicatorProps> = ({
  color = '#00FFCC',
  size = 7,
}) => {
  const ringScale   = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 1.8,
          duration: 1100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 1100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // Reset values then start loop
    const resetAndLoop = Animated.sequence([
      Animated.parallel([
        Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
      ]),
      loop,
    ]);

    resetAndLoop.start();
    return () => resetAndLoop.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringSize = size * 2.4;

  return (
    <View style={[pulseStyles.wrapper, { width: size * 3, height: size * 3 }]}>
      {/* Outer pulsing ring */}
      <Animated.View
        style={[
          pulseStyles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: color,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      {/* Solid core dot */}
      <View
        style={[
          pulseStyles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
};

const pulseStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  dot: {
    position: 'absolute',
  },
});
