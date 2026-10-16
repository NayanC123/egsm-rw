// src/utils/layout.ts
// Shared responsive layout constants for status bar and edge-to-edge Android/iOS clearance.

import { Platform, StatusBar } from 'react-native';

/**
 * Top safe padding constant to ensure headers, modals, and back buttons
 * are cleanly positioned below the device notification bar and status bar.
 */
export const SAFE_TOP: number =
  Platform.OS === 'android' ? Math.max((StatusBar.currentHeight || 28) + 14, 44) : 50;

export const TOP_SAFE_PADDING: number = SAFE_TOP;
