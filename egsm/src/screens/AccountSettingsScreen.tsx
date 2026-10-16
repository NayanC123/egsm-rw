// src/screens/AccountSettingsScreen.tsx
// Phase 2 Account Settings Screen
// Includes locked Username, Display Name change, Password change,
// Theme switcher with swatches, and prominent Logout.

import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { TOP_SAFE_PADDING } from '../utils/layout';

export const AccountSettingsScreen: React.FC = () => {
  const { user, logout, updateDisplayName, updatePassword } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  // Display Name state
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Sync display name if user profile updates externally
  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name);
    }
  }, [user?.display_name]);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Handle Display Name Update
  const handleUpdateDisplayName = async () => {
    setNameSuccess(null);
    setNameError(null);

    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError('Display name cannot be empty.');
      return;
    }
    if (trimmed === user?.display_name) {
      setNameError('Display name is unchanged.');
      return;
    }

    setNameLoading(true);
    try {
      const res = await updateDisplayName(trimmed);
      if (res.success) {
        setNameSuccess('Display name updated successfully.');
      } else {
        setNameError(res.error || 'Failed to update display name.');
      }
    } finally {
      setNameLoading(false);
    }
  };

  // Handle Password Update
  const handleUpdatePassword = async () => {
    setPasswordSuccess(null);
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (!newPassword) {
      setPasswordError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await updatePassword(currentPassword, newPassword);
      if (res.success) {
        setPasswordSuccess('Password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(res.error || 'Failed to update password.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const s = styles(colors, isDark);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={s.header}>
            <Text style={s.pageTitle}>Account Settings</Text>
            <Text style={s.pageSubtitle}>
              Manage your profile preferences, security, and appearance
            </Text>
          </View>

          {/* 1. USERNAME SECTION (READ-ONLY) */}
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <Text style={s.cardTitle}>Username</Text>
              <View style={s.readOnlyBadge}>
                <Text style={s.readOnlyBadgeText}>SET BY ADMIN — READ ONLY</Text>
              </View>
            </View>

            <View style={s.readOnlyInputBox}>
              <Text style={s.readOnlyLockIcon}>🔒</Text>
              <Text style={s.readOnlyUsernameText}>@{user?.username || 'user'}</Text>
            </View>
            <Text style={s.helperText}>
              Usernames are permanently assigned by Platform Administrators and cannot be modified.
            </Text>
          </View>

          {/* 2. CHANGE DISPLAY NAME SECTION */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Display Name</Text>
            <Text style={s.cardSubtitle}>
              This is the name visible to colleagues in group chats and posts.
            </Text>

            <TextInput
              id="account-display-name-input"
              style={s.input}
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                if (nameSuccess) setNameSuccess(null);
                if (nameError) setNameError(null);
              }}
              placeholderTextColor={isDark ? '#4B5A68' : colors.textSecondary}
              placeholder="Enter your display name"
            />

            {nameSuccess && (
              <View style={s.successBox}>
                <Text style={s.successText}>✓ {nameSuccess}</Text>
              </View>
            )}
            {nameError && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>⚠️ {nameError}</Text>
              </View>
            )}

            <TouchableOpacity
              id="update-display-name-btn"
              style={[s.primaryBtn, nameLoading && s.btnDisabled]}
              onPress={handleUpdateDisplayName}
              disabled={nameLoading}
              activeOpacity={0.8}
            >
              {nameLoading ? (
                <ActivityIndicator color="#050A0E" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Update Display Name</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 3. CHANGE PASSWORD SECTION */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Change Password</Text>
            <Text style={s.cardSubtitle}>
              Update your account credentials. You must enter your current password to confirm.
            </Text>

            <Text style={s.inputLabel}>CURRENT PASSWORD</Text>
            <TextInput
              id="account-current-password-input"
              style={s.input}
              value={currentPassword}
              onChangeText={(t) => {
                setCurrentPassword(t);
                if (passwordSuccess) setPasswordSuccess(null);
                if (passwordError) setPasswordError(null);
              }}
              secureTextEntry
              placeholderTextColor={isDark ? '#4B5A68' : colors.textSecondary}
              placeholder="Enter current password"
            />

            <Text style={s.inputLabel}>NEW PASSWORD</Text>
            <TextInput
              id="account-new-password-input"
              style={s.input}
              value={newPassword}
              onChangeText={(t) => {
                setNewPassword(t);
                if (passwordSuccess) setPasswordSuccess(null);
                if (passwordError) setPasswordError(null);
              }}
              secureTextEntry
              placeholderTextColor={isDark ? '#4B5A68' : colors.textSecondary}
              placeholder="Enter new password (min. 4 characters)"
            />

            <Text style={s.inputLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              id="account-confirm-password-input"
              style={s.input}
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (passwordSuccess) setPasswordSuccess(null);
                if (passwordError) setPasswordError(null);
              }}
              secureTextEntry
              placeholderTextColor={isDark ? '#4B5A68' : colors.textSecondary}
              placeholder="Confirm new password"
            />

            {passwordSuccess && (
              <View style={s.successBox}>
                <Text style={s.successText}>✓ {passwordSuccess}</Text>
              </View>
            )}
            {passwordError && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>⚠️ {passwordError}</Text>
              </View>
            )}

            <TouchableOpacity
              id="update-password-btn"
              style={[s.primaryBtn, passwordLoading && s.btnDisabled]}
              onPress={handleUpdatePassword}
              disabled={passwordLoading}
              activeOpacity={0.8}
            >
              {passwordLoading ? (
                <ActivityIndicator color="#050A0E" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* 4. APPEARANCE SECTION */}
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <View>
                <Text style={s.cardTitle}>Appearance</Text>
                <Text style={s.cardSubtitle}>
                  {isDark ? 'Dark Mode Active' : 'Light Mode Active'}
                </Text>
              </View>
              <Switch
                id="theme-toggle-switch"
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#DCE4EC', true: 'rgba(0, 255, 204, 0.4)' }}
                thumbColor={isDark ? '#00FFCC' : '#5A6B78'}
              />
            </View>

            {/* Theme Swatches */}
            <Text style={s.swatchHeader}>CURRENT THEME PALETTE SWATCHES</Text>
            <View style={s.swatchesRow}>
              {/* Main Background Swatch */}
              <View style={s.swatchItem}>
                <View
                  style={[
                    s.swatchColorBox,
                    {
                      backgroundColor: '#050A0E',
                      borderColor: isDark ? '#00FFCC' : '#DCE4EC',
                    },
                  ]}
                />
                <Text style={s.swatchLabel}>Main</Text>
                <Text style={s.swatchHex}>#050A0E</Text>
              </View>

              {/* Primary Neon Swatch */}
              <View style={s.swatchItem}>
                <View
                  style={[
                    s.swatchColorBox,
                    {
                      backgroundColor: '#00FFCC',
                      borderColor: '#00FFCC',
                    },
                  ]}
                />
                <Text style={s.swatchLabel}>Primary</Text>
                <Text style={s.swatchHex}>#00FFCC</Text>
              </View>

              {/* Accent Orange Swatch */}
              <View style={s.swatchItem}>
                <View
                  style={[
                    s.swatchColorBox,
                    {
                      backgroundColor: '#FF6600',
                      borderColor: '#FF6600',
                    },
                  ]}
                />
                <Text style={s.swatchLabel}>Accent</Text>
                <Text style={s.swatchHex}>#FF6600</Text>
              </View>
            </View>
          </View>

          {/* 5. SESSION / LOG OUT SECTION */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Session</Text>
            <Text style={s.cardSubtitle}>
              Logged in as <Text style={s.boldUser}>@{user?.username}</Text> ({user?.role === 'admin' ? 'Administrator' : 'Standard Member'})
            </Text>

            <TouchableOpacity
              id="logout-btn"
              style={s.logoutBtn}
              onPress={logout}
              activeOpacity={0.8}
            >
              <Text style={s.logoutBtnText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = (
  c: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors'],
  isDark: boolean,
) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.mainBackground,
    },
    flex: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 40,
    },
    header: {
      paddingTop: TOP_SAFE_PADDING,
      marginBottom: 20,
    },
    pageTitle: {
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: c.textPrimary,
      marginBottom: 4,
    },
    pageSubtitle: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: c.textPrimary,
      marginBottom: 4,
    },
    cardSubtitle: {
      fontSize: 12,
      color: c.textSecondary,
      lineHeight: 16,
      marginBottom: 14,
    },
    readOnlyBadge: {
      backgroundColor: 'rgba(255, 102, 0, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'rgba(255, 102, 0, 0.3)',
    },
    readOnlyBadgeText: {
      color: c.accent,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    readOnlyInputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#0A1017' : '#EDF2F7',
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    readOnlyLockIcon: {
      fontSize: 14,
      marginRight: 10,
    },
    readOnlyUsernameText: {
      color: c.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    helperText: {
      fontSize: 11,
      color: c.textSecondary,
      lineHeight: 15,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 6,
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: isDark ? '#0A1017' : c.mainBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: c.textPrimary,
      fontSize: 15,
      marginBottom: 14,
    },
    primaryBtn: {
      backgroundColor: '#00FFCC',
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    primaryBtnText: {
      color: '#050A0E',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    successBox: {
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(0, 255, 204, 0.3)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    successText: {
      color: isDark ? '#00FFCC' : '#00875A',
      fontSize: 12,
      fontWeight: '600',
    },
    errorBox: {
      backgroundColor: 'rgba(255, 51, 102, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255, 51, 102, 0.3)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    errorText: {
      color: c.danger,
      fontSize: 12,
      fontWeight: '600',
    },
    swatchHeader: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
      letterSpacing: 0.5,
      marginBottom: 10,
      marginTop: 6,
    },
    swatchesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    swatchItem: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: isDark ? '#0A1017' : c.mainBackground,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    swatchColorBox: {
      width: '100%',
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 8,
    },
    swatchLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 2,
    },
    swatchHex: {
      fontSize: 10,
      color: c.textSecondary,
      fontWeight: '600',
    },
    boldUser: {
      fontWeight: '700',
      color: c.textPrimary,
    },
    logoutBtn: {
      backgroundColor: 'rgba(255, 51, 102, 0.1)',
      borderWidth: 1,
      borderColor: 'rgba(255, 51, 102, 0.3)',
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 6,
    },
    logoutBtnText: {
      color: '#FF3366',
      fontWeight: '700',
      fontSize: 15,
      letterSpacing: 0.2,
    },
  });

export default AccountSettingsScreen;
