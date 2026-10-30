// src/utils/layout.ts
// Shared responsive layout constants for status bar and edge-to-edge Android/iOS clearance.

import { Platform, StatusBar, Dimensions } from 'react-native';

export const SAFE_TOP: number =
  Platform.OS === 'android' ? Math.max((StatusBar.currentHeight || 28) + 14, 44) : 50;

export const TOP_SAFE_PADDING: number = SAFE_TOP;

const screenHeight = Dimensions.get('screen').height;
const windowHeight = Dimensions.get('window').height;
const statusBarHeight = StatusBar.currentHeight || 0;
const detectedNavBar = Math.max(0, screenHeight - windowHeight - statusBarHeight);

export const SAFE_BOTTOM: number =
  Platform.OS === 'android' ? Math.max(detectedNavBar + 14, 34) : 24;
