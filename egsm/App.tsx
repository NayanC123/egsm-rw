// App.tsx
// Top-level application entry point.
// ─ ErrorBoundary wraps everything
// ─ ThemeProvider + AuthProvider wrap all screens
// ─ State-based router: no @react-navigation, no react-native-screens
// ─ Custom Bottom Navigation Bar (Chat | Posts | Account Settings | Admin)

import React, { Component, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Platform,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';

import LoginScreen           from './src/screens/LoginScreen';
import ChatScreen            from './src/screens/ChatScreen';
import PostsScreen           from './src/screens/PostsScreen';
import AccountSettingsScreen from './src/screens/AccountSettingsScreen';
import AdminPortalScreen     from './src/screens/AdminPortalScreen';
import AccountLockModal      from './src/components/AccountLockModal';

// ─────────────────────────────────────────────────────────────
// Error Boundary
// ─────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.message}>{this.state.errorMessage}</Text>
          <TouchableOpacity
            id="error-retry-btn"
            style={ebStyles.retryBtn}
            onPress={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            <Text style={ebStyles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A0E', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title:     { fontSize: 22, fontWeight: '700', color: '#FF3366', marginBottom: 12 },
  message:   { fontSize: 14, color: '#8A9BA8', textAlign: 'center', marginBottom: 24 },
  retryBtn:  { backgroundColor: '#00FFCC', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32 },
  retryText: { color: '#050A0E', fontWeight: '700', fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────
// Tab definition
// ─────────────────────────────────────────────────────────────

type TabId = 'chat' | 'posts' | 'account' | 'admin';

interface Tab {
  id: TabId;
  label: string;
  emoji: string;
  adminOnly?: boolean;
}

const TABS: Tab[] = [
  { id: 'chat',    label: 'Chat',             emoji: '💬' },
  { id: 'posts',   label: 'Posts',            emoji: '📋' },
  { id: 'account', label: 'Account Settings', emoji: '⚙️' },
  { id: 'admin',   label: 'Admin',            emoji: '🛡️', adminOnly: true },
];

// ─────────────────────────────────────────────────────────────
// Main app shell (rendered after login)
// ─────────────────────────────────────────────────────────────

const AppShell: React.FC = () => {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [activeTab, setActiveTab] = React.useState<TabId>('chat');

  const visibleTabs = TABS.filter((t) => !t.adminOnly || user?.role === 'admin');

  const renderScreen = (): ReactNode => {
    switch (activeTab) {
      case 'chat':    return <ChatScreen />;
      case 'posts':   return <PostsScreen />;
      case 'account': return <AccountSettingsScreen />;
      case 'admin':   return user?.role === 'admin' ? <AdminPortalScreen /> : <ChatScreen />;
      default:        return <ChatScreen />;
    }
  };

  const s = shellStyles(colors);

  return (
    <SafeAreaView style={s.safe}>
      {/* Content area */}
      <View style={s.content}>{renderScreen()}</View>

      {/* Bottom Navigation Bar */}
      <View style={s.navBar}>
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              id={`tab-${tab.id}`}
              style={s.navItem}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="button"
              accessibilityLabel={`${tab.label} tab`}
            >
              <Text style={[s.navEmoji, isActive && s.navEmojiActive]}>
                {tab.emoji}
              </Text>
              <Text
                style={[
                  s.navLabel,
                  { color: isActive ? colors.primary : colors.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
              {isActive && <View style={[s.activeBar, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
    </SafeAreaView>
  );
};

const shellStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    safe:          { flex: 1, backgroundColor: c.mainBackground },
    content:       { flex: 1 },
    navBar: {
      flexDirection:    'row',
      backgroundColor:  c.surface,
      borderTopWidth:   1,
      borderTopColor:   c.border,
      paddingBottom:    Platform.OS === 'ios' ? 20 : 6,
      paddingTop:       8,
    },
    navItem:       { flex: 1, alignItems: 'center', position: 'relative' },
    navEmoji:      { fontSize: 22, marginBottom: 2, opacity: 0.55 },
    navEmojiActive:{ opacity: 1 },
    navLabel:      { fontSize: 10, fontWeight: '600' },
    activeBar: {
      position:     'absolute',
      top:          0,
      height:       2,
      width:        '60%',
      borderRadius: 2,
    },
  });

// ─────────────────────────────────────────────────────────────
// Root: chooses between Login and AppShell based on auth state
// ─────────────────────────────────────────────────────────────

const RootNavigator: React.FC = () => {
  const { user, blockReason, logout } = useAuth();
  const { isDark, colors } = useTheme();

  const isBlocked =
    Boolean(user) &&
    (blockReason !== null ||
      user?.status === 'terminated' ||
      (user?.status === 'suspended' &&
        (!user.suspended_until || new Date(user.suspended_until) > new Date())));

  const blockStatus: 'terminated' | 'suspended' =
    user?.status === 'terminated' ? 'terminated' : 'suspended';

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.mainBackground}
      />
      {user ? <AppShell /> : <LoginScreen />}

      {/* Enforcement lock modal if already logged in and account becomes suspended or terminated */}
      {isBlocked && user && (
        <AccountLockModal
          visible={true}
          status={blockStatus}
          suspendedUntil={user.suspended_until}
          onDismiss={logout}
          dismissText="Log Out"
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// App entry (providers + error boundary)
// ─────────────────────────────────────────────────────────────

export default function App(): ReactNode {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
