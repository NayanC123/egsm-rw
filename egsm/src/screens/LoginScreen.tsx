// src/screens/LoginScreen.tsx
// Phase 2 Pre-Login Screen
// Strictly invite-only: NO sign-up/register buttons.
// Enforces full-screen suspension/termination lock modals.

import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AccountLockModal from '../components/AccountLockModal';

const LoginScreen: React.FC = () => {
  const { login, submitPasswordReset, isLoading } = useAuth();
  const { colors, isDark } = useTheme();

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Account lock modal state (suspended or terminated)
  const [lockModal, setLockModal] = useState<{
    visible: boolean;
    status: 'terminated' | 'suspended';
    suspendedUntil?: string | null;
  } | null>(null);

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!username.trim()) {
      setError('Please enter your username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    const result = await login(username.trim(), password);
    if (!result.success) {
      if (result.blockedStatus) {
        setLockModal({
          visible: true,
          status: result.blockedStatus,
          suspendedUntil: result.suspendedUntil ?? null,
        });
      } else {
        setError(result.error || 'Invalid credentials.');
      }
    }
  };

  const openForgotModal = () => {
    setForgotUsername(username.trim());
    setForgotNote('');
    setForgotError(null);
    setForgotSuccess(false);
    setShowForgotModal(true);
  };

  const handleForgotSubmit = async () => {
    setForgotError(null);
    if (!forgotUsername.trim()) {
      setForgotError('Please enter your username.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await submitPasswordReset(forgotUsername.trim(), forgotNote.trim());
      if (res.success) {
        setForgotSuccess(true);
      } else {
        setForgotError(res.error || 'Failed to submit reset request.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const s = styles(colors, isDark);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header & Logo */}
          <View style={s.logoContainer}>
            <View style={s.badgeBox}>
              <Text style={s.badgeText}>EGSM</Text>
            </View>
            <Text style={s.subtitle}>Design and Implementation by Nayan</Text>
            <Text style={s.subtitle}>Version 2.0.0</Text>
          </View>

          {/* Login Card */}
          <View style={s.card}>
            <Text style={s.cardHeading}>Sign In</Text>

            {/* Username Field */}
            <Text style={s.label}>Username</Text>
            <TextInput
              id="login-username"
              style={s.input}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={colors.textSecondary}
              placeholder="e.g. jdoe or admin"
            />

            {/* Password Field */}
            <View style={s.labelRow}>
              <Text style={s.label}>Password</Text>
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel="Toggle password visibility"
              >
                <Text style={s.showToggle}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              id="login-password"
              style={s.input}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) setError(null);
              }}
              secureTextEntry={!showPassword}
              placeholderTextColor={colors.textSecondary}
              placeholder="Enter your password"
            />

            {/* Error Message */}
            {error ? (
              <View style={s.errorContainer}>
                <Text style={s.errorIcon}>⚠️</Text>
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Primary Login Button */}
            <TouchableOpacity
              id="login-btn"
              style={[s.primaryBtn, isLoading && s.btnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#050A0E" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>LOGIN</Text>
              )}
            </TouchableOpacity>

            {/* Forgot Password Link */}
            <TouchableOpacity
              id="forgot-password-btn"
              onPress={openForgotModal}
              style={s.forgotBtn}
              activeOpacity={0.7}
            >
              <Text style={s.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* STRICT REQUIREMENT: Invite-Only Info Box */}
          <View style={s.inviteOnlyBox}>
            <View style={s.inviteIconBox}>
              <Text style={s.inviteIcon}>🔒</Text>
            </View>
            <View style={s.inviteTextBox}>
              <Text style={s.inviteTitle}>Invite-Only Platform</Text>
              <Text style={s.inviteBody}>
                Accounts are created exclusively by Administrators.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Dedicated Modal */}
      <Modal
        visible={showForgotModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowForgotModal(false)}
      >
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={s.modalWrapper}
          >
            <View style={s.modalCard}>
              {forgotSuccess ? (
                /* Success View */
                <View style={s.modalSuccessBox}>
                  <View style={s.successIconBox}>
                    <Text style={s.successEmoji}>✓</Text>
                  </View>
                  <Text style={s.modalSuccessTitle}>Request Submitted</Text>
                  <Text style={s.modalSuccessMessage}>
                    Request sent to Administrators. An Admin will reset your password shortly.
                  </Text>
                  <TouchableOpacity
                    id="forgot-success-close-btn"
                    style={s.modalPrimaryBtn}
                    onPress={() => setShowForgotModal(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.modalPrimaryBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Form View */
                <>
                  <View style={s.modalHeader}>
                    <Text style={s.modalTitle}>Forgot Password?</Text>
                    <TouchableOpacity
                      onPress={() => setShowForgotModal(false)}
                      style={s.modalCloseBtn}
                    >
                      <Text style={s.modalCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={s.modalDescription}>
                    Submit your username and an optional note to the administration queue. An Admin will review and reset your credentials.
                  </Text>

                  <Text style={s.label}>Your Username</Text>
                  <TextInput
                    id="forgot-username"
                    style={s.input}
                    value={forgotUsername}
                    onChangeText={setForgotUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={colors.textSecondary}
                    placeholder="Enter registered username"
                  />

                  <Text style={s.label}>Optional Note for Administrators</Text>
                  <TextInput
                    id="forgot-note"
                    style={[s.input, s.multilineInput]}
                    value={forgotNote}
                    onChangeText={setForgotNote}
                    multiline
                    numberOfLines={3}
                    placeholderTextColor={colors.textSecondary}
                    placeholder="e.g. Lost access after device reset..."
                  />

                  {forgotError ? (
                    <Text style={s.modalErrorText}>{forgotError}</Text>
                  ) : null}

                  <View style={s.modalBtnRow}>
                    <TouchableOpacity
                      id="forgot-cancel-btn"
                      style={s.modalCancelBtn}
                      onPress={() => setShowForgotModal(false)}
                      disabled={forgotLoading}
                    >
                      <Text style={s.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      id="forgot-submit-btn"
                      style={[s.modalSubmitBtn, forgotLoading && s.btnDisabled]}
                      onPress={handleForgotSubmit}
                      disabled={forgotLoading}
                      activeOpacity={0.8}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator color="#050A0E" size="small" />
                      ) : (
                        <Text style={s.modalSubmitBtnText}>Submit Request</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Suspended / Terminated Account Enforcement Lock Modal */}
      {lockModal && (
        <AccountLockModal
          visible={lockModal.visible}
          status={lockModal.status}
          suspendedUntil={lockModal.suspendedUntil}
          onDismiss={() => setLockModal(null)}
          dismissText="Return to Login"
        />
      )}
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
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: 28,
    },
    badgeBox: {
      backgroundColor: isDark ? '#0D161E' : '#FFFFFF',
      borderWidth: 1.5,
      borderColor: c.primary,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 12,
      marginBottom: 12,
    },
    badgeText: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 2,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: 1,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '500',
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 24,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
    },
    cardHeading: {
      fontSize: 20,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 20,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    showToggle: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
      marginBottom: 8,
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
      marginBottom: 18,
    },
    inputFocused: {
      borderColor: 'rgba(0, 255, 204, 0.4)',
    },
    multilineInput: {
      height: 80,
      textAlignVertical: 'top',
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 51, 102, 0.1)',
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    errorIcon: {
      fontSize: 16,
      marginRight: 8,
    },
    errorText: {
      flex: 1,
      color: c.danger,
      fontSize: 13,
      fontWeight: '500',
    },
    primaryBtn: {
      backgroundColor: '#00FFCC',
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    primaryBtnText: {
      color: '#050A0E',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    forgotBtn: {
      alignItems: 'center',
      marginTop: 18,
      paddingVertical: 4,
    },
    forgotText: {
      color: c.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    inviteOnlyBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 102, 0, 0.08)' : 'rgba(255, 102, 0, 0.06)',
      borderWidth: 1,
      borderColor: c.accent,
      borderRadius: 14,
      padding: 16,
    },
    inviteIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#0D161E' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      borderWidth: 1,
      borderColor: c.accent,
    },
    inviteIcon: {
      fontSize: 18,
    },
    inviteTextBox: {
      flex: 1,
    },
    inviteTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accent,
      marginBottom: 2,
    },
    inviteBody: {
      fontSize: 12,
      color: c.textSecondary,
      lineHeight: 17,
      fontWeight: '500',
    },
    // Dedicated Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(5, 10, 14, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalWrapper: {
      width: '100%',
      maxWidth: 440,
    },
    modalCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalCloseText: {
      color: c.textSecondary,
      fontSize: 18,
      fontWeight: '700',
    },
    modalDescription: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
      marginBottom: 20,
    },
    modalErrorText: {
      color: c.danger,
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 14,
      textAlign: 'center',
    },
    modalBtnRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 6,
    },
    modalCancelBtn: {
      flex: 1,
      backgroundColor: isDark ? '#0A1017' : c.mainBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
    },
    modalCancelBtnText: {
      color: c.textSecondary,
      fontWeight: '600',
      fontSize: 14,
    },
    modalSubmitBtn: {
      flex: 1.5,
      backgroundColor: c.accent,
      borderRadius: 16,
      paddingVertical: 15,
      alignItems: 'center',
    },
    modalSubmitBtnText: {
      color: '#050A0E',
      fontWeight: '700',
      fontSize: 14,
    },
    modalSuccessBox: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    successIconBox: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(0, 255, 204, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(0, 255, 204, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    successEmoji: {
      color: '#00FFCC',
      fontSize: 26,
      fontWeight: '700',
    },
    modalSuccessTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 8,
    },
    modalSuccessMessage: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
      paddingHorizontal: 8,
    },
    modalPrimaryBtn: {
      backgroundColor: '#00FFCC',
      width: '100%',
      paddingVertical: 15,
      borderRadius: 16,
      alignItems: 'center',
    },
    modalPrimaryBtnText: {
      color: '#050A0E',
      fontWeight: '700',
      fontSize: 15,
    },
    diagnoseBtn: {
      alignSelf: 'center',
      marginTop: 22,
      marginBottom: 12,
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor: 'rgba(0, 255, 204, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(0, 255, 204, 0.3)',
    },
    diagnoseBtnText: {
      color: '#00FFCC',
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
  });

export default LoginScreen;
