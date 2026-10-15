// src/context/ThemeContext.tsx
// Provides Dark / Light theme tokens throughout the app.

import React, { createContext, useContext, useState, ReactNode } from 'react';

// ─── Token shapes ─────────────────────────────────────────────────────────────

export interface ThemeColors {
  mainBackground: string;
  surface: string;
  border: string;
  primary: string;   // neon accent (buttons, active tab, links)
  accent: string;    // announcements / warnings / badges
  danger: string;    // terminations / deletions
  textPrimary: string;
  textSecondary: string;
}

const DARK: ThemeColors = {
  mainBackground: '#050A0E',
  surface:        '#0D161E',
  border:         '#1A2C38',
  primary:        '#00FFCC',
  accent:         '#FF6600',
  danger:         '#FF3366',
  textPrimary:    '#FFFFFF',
  textSecondary:  '#8A9BA8',
};

const LIGHT: ThemeColors = {
  mainBackground: '#F4F7F9',
  surface:        '#FFFFFF',
  border:         '#DCE4EC',
  primary:        '#00B894',
  accent:         '#FF6600',
  danger:         '#FF3366',
  textPrimary:    '#050A0E',
  textSecondary:  '#5A6B78',
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark:      true,
  colors:      DARK,
  toggleTheme: () => {},
});

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(true); // Dark mode default

  const toggleTheme = () => setIsDark((prev) => !prev);
  const colors = isDark ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
