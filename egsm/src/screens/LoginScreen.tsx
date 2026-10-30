// src/screens/LoginScreen.tsx
// High-End Consumer Authentication Screen (Linear & Raycast mobile inspired).
// Full-bleed edge-to-edge layout, tactile inputs, confident typography, and quiet footer.
// STRICT RULE: Only built-in react-native components.

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
  StatusBar,
  BackHandler,
} from 'react-native';
import { TOP_SAFE_PADDING } from '../utils/layout';
import { useAuth } from '../context/AuthContext';
import AccountLockModal from '../components/AccountLockModal';
import BlueprintGridBackground from '../components/common/BlueprintGridBackground';
import { FadeSlideIn, ScalePressable } from '../components/common/AnimatedPrimitives';

const LoginScreen: React.FC = () => {
  const { login, submitPasswordReset, isLoading } = useAuth();

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
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

  // Hardware Back Button listener: dismiss modals
  React.useEffect(() => {
    const onBackPress = () => {
      if (showForgotModal) {
        setShowForgotModal(false);
        return true;
      }
      if (lockModal?.visible) {
        setLockModal(null);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [showForgotModal, lockModal]);

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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Blueprint graph-paper background */}
      <BlueprintGridBackground />

      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.topSection}>
            {/* 1. Hero Brand Identity — FadeSlideIn delay=0 */}
            <FadeSlideIn delay={0}>
              <View style={styles.brandContainer}>
                <Text style={styles.heroLogo}>
                  egsm<Text style={styles.heroDot}>.</Text>
                </Text>
                <Text style={styles.heroSubtitle}>
                  A private, invite-only social collective.
                </Text>
                <View style={styles.microPill}>
                  <Text style={styles.microPillText}>🔒 Admin Provisioned</Text>
                </View>
              </View>
            </FadeSlideIn>

            {/* 2. Credential Card — FadeSlideIn delay=80 */}
            <FadeSlideIn delay={80}>
              <View style={styles.formContainer}>
                {/* Username Field */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.inputLabel}>USERNAME</Text>
                  <View
                    style={[
                      styles.inputContainer,
                      focusedField === 'username' && styles.inputContainerFocused,
                    ]}
                  >
                    <TextInput
                      id="login-username"
                      style={styles.textInput}
                      value={username}
                      onChangeText={(text) => {
                        setUsername(text);
                        if (error) setError(null);
                      }}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor="#3B4A56"
                      placeholder="Enter your username"
                    />
                  </View>
                </View>

                {/* Password Field */}
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.inputLabel}>PASSWORD</Text>
                  </View>
                  <View
                    style={[
                      styles.inputContainer,
                      focusedField === 'password' && styles.inputContainerFocused,
                    ]}
                  >
                    <TextInput
                      id="login-password"
                      style={[styles.textInput, styles.passwordTextInput]}
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        if (error) setError(null);
                      }}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showPassword}
                      placeholderTextColor="#3B4A56"
                      placeholder="••••••••••••"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <ScalePressable
                      onPress={() => setShowPassword((prev) => !prev)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={styles.showToggleBtn}
                    >
                      <Text style={styles.showToggleText}>
                        {showPassword ? 'Hide' : 'Show'}
                      </Text>
                    </ScalePressable>
                  </View>
                </View>

                {/* Error Message */}
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorIcon}>⚠️</Text>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
              </View>
            </FadeSlideIn>

            {/* 3. Login Button — FadeSlideIn delay=160 */}
            <FadeSlideIn delay={160}>
              <View>
                <ScalePressable
                  id="login-btn"
                  style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                  onPress={handleLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#050A0E" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>LOGIN</Text>
                  )}
                </ScalePressable>

                {/* Forgot Password Link */}
                <ScalePressable
                  id="forgot-password-btn"
                  onPress={openForgotModal}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>Forgot your password?</Text>
                </ScalePressable>
              </View>
            </FadeSlideIn>
          </View>

          {/* 4. Quiet Footer */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>
              v2.0 • End-to-End Encrypted Session
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Dedicated Modal (Refined Linear Dark Aesthetic) */}
      <Modal
        visible={showForgotModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowForgotModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalWrapper}
          >
            <View style={styles.modalCard}>
              {forgotSuccess ? (
                /* Success View */
                <View style={styles.modalSuccessBox}>
                  <View style={styles.successIconBox}>
                    <Text style={styles.successEmoji}>✓</Text>
                  </View>
                  <Text style={styles.modalSuccessTitle}>Request Submitted</Text>
                  <Text style={styles.modalSuccessMessage}>
                    Request sent to Administrators. An Admin will review and reset your credentials shortly.
                  </Text>
                  <TouchableOpacity
                    id="forgot-success-close-btn"
                    style={styles.modalPrimaryBtn}
                    onPress={() => setShowForgotModal(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalPrimaryBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Form View */
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Password Recovery</Text>
                    <TouchableOpacity
                      onPress={() => setShowForgotModal(false)}
                      style={styles.modalCloseBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.modalCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.modalDescription}>
                    Submit your username to notify the administrator queue. An admin will review and issue a new password.
                  </Text>

                  <Text style={styles.modalInputLabel}>USERNAME</Text>
                  <TextInput
                    id="forgot-username"
                    style={styles.modalInput}
                    value={forgotUsername}
                    onChangeText={setForgotUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#3B4A56"
                    placeholder="Enter registered username"
                  />

                  <Text style={styles.modalInputLabel}>OPTIONAL NOTE FOR ADMINS</Text>
                  <TextInput
                    id="forgot-note"
                    style={[styles.modalInput, styles.modalMultilineInput]}
                    value={forgotNote}
                    onChangeText={setForgotNote}
                    multiline
                    numberOfLines={3}
                    placeholderTextColor="#3B4A56"
                    placeholder="e.g. Lost device access..."
                  />

                  {forgotError ? (
                    <Text style={styles.modalErrorText}>{forgotError}</Text>
                  ) : null}

                  <View style={styles.modalBtnRow}>
                    <TouchableOpacity
                      id="forgot-cancel-btn"
                      style={styles.modalCancelBtn}
                      onPress={() => setShowForgotModal(false)}
                      disabled={forgotLoading}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      id="forgot-submit-btn"
                      style={[styles.modalSubmitBtn, forgotLoading && styles.btnDisabled]}
                      onPress={handleForgotSubmit}
                      disabled={forgotLoading}
                      activeOpacity={0.8}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator color="#050A0E" size="small" />
                      ) : (
                        <Text style={styles.modalSubmitBtnText}>Submit Request</Text>
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#050A0E',
    paddingTop: TOP_SAFE_PADDING,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  topSection: {
    width: '100%',
  },

  // ── Hero Brand Identity ──
  brandContainer: {
    marginBottom: 36,
  },
  heroLogo: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1.5,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  heroDot: {
    color: '#00FFCC',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#7E8E9C',
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 14,
  },
  microPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 102, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 102, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  microPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFA044',
    letterSpacing: 0.2,
  },

  // ── Form Container ──
  formContainer: {
    width: '100%',
  },
  fieldGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#6C7D8C',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputContainer: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#0C1319',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  inputContainerFocused: {
    borderColor: 'rgba(0, 255, 204, 0.5)',
  },
  textInput: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  passwordTextInput: {
    paddingRight: 8,
  },
  showToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  showToggleText: {
    color: '#00FFCC',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Error Feedback ──
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 51, 102, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 51, 102, 0.3)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  errorText: {
    flex: 1,
    color: '#FF3366',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Action Buttons ──
  primaryBtn: {
    height: 56,
    backgroundColor: '#00FFCC',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#050A0E',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  forgotBtn: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00E5B8',
  },

  // ── Quiet Footer ──
  footerContainer: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 8,
  },
  footerText: {
    fontSize: 11,
    color: '#3E4D59',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // ── Modal Styles (Linear Minimalist Dark) ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 14, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: TOP_SAFE_PADDING,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 440,
  },
  modalCard: {
    backgroundColor: '#0C1319',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    color: '#7E8E9C',
    fontSize: 18,
    fontWeight: '600',
  },
  modalDescription: {
    fontSize: 13,
    color: '#7E8E9C',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#6C7D8C',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: '#080E13',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 16,
  },
  modalMultilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalErrorText: {
    color: '#FF3366',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#7E8E9C',
    fontWeight: '600',
    fontSize: 14,
  },
  modalSubmitBtn: {
    flex: 1.5,
    backgroundColor: '#00FFCC',
    borderRadius: 14,
    paddingVertical: 14,
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
    color: '#FFFFFF',
    marginBottom: 8,
  },
  modalSuccessMessage: {
    fontSize: 14,
    color: '#7E8E9C',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  modalPrimaryBtn: {
    backgroundColor: '#00FFCC',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    color: '#050A0E',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default LoginScreen;
