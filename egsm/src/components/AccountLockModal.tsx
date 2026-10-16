// src/components/AccountLockModal.tsx
// Full-screen enforcement lock modal for Suspended & Terminated accounts.
// Strictly uses built-in react-native components and string fontWeights.

import React, { useState, useEffect } from 'react';
import {
  Modal,
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import { TOP_SAFE_PADDING } from '../utils/layout';

export interface AccountLockModalProps {
  visible: boolean;
  status: 'terminated' | 'suspended';
  suspendedUntil?: string | null;
  onDismiss: () => void;
  dismissText?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  isIndefinite: boolean;
}

function calculateRemaining(targetIso?: string | null): TimeRemaining {
  if (!targetIso) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, isIndefinite: true };
  }
  const target = new Date(targetIso).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, isIndefinite: false };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, expired: false, isIndefinite: false };
}

export const AccountLockModal: React.FC<AccountLockModalProps> = ({
  visible,
  status,
  suspendedUntil,
  onDismiss,
  dismissText,
}) => {
  const [remaining, setRemaining] = useState<TimeRemaining>(() =>
    calculateRemaining(suspendedUntil),
  );

  useEffect(() => {
    if (!visible || status !== 'suspended' || !suspendedUntil) return;

    setRemaining(calculateRemaining(suspendedUntil));
    const interval = setInterval(() => {
      setRemaining(calculateRemaining(suspendedUntil));
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, status, suspendedUntil]);

  if (!visible) return null;

  const isTerminated = status === 'terminated';
  const themeColor = isTerminated ? '#FF3366' : '#FF6600';
  const headerTitle = isTerminated
    ? 'Account Permanently Terminated by Administration.'
    : 'Account Temporarily Suspended';

  const formattedDate = suspendedUntil
    ? new Date(suspendedUntil).toLocaleString(undefined, {
        dateStyle: 'full',
        timeStyle: 'medium',
      })
    : 'Indefinite (Subject to Admin Review)';

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <StatusBar barStyle="light-content" backgroundColor="#050A0E" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Top Warning Badge */}
          <View style={[styles.iconContainer, { borderColor: themeColor }]}>
            <Text style={styles.icon}>{isTerminated ? '🚫' : '⏳'}</Text>
          </View>

          {/* Status Chip */}
          <View style={[styles.chip, { backgroundColor: themeColor }]}>
            <Text style={styles.chipText}>
              {isTerminated ? 'TERMINATED' : 'ACCESS SUSPENDED'}
            </Text>
          </View>

          {/* Required Title */}
          <Text style={[styles.title, { color: themeColor }]}>
            {headerTitle}
          </Text>

          {isTerminated ? (
            /* Terminated Details */
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Administrative Action Notice</Text>
              <Text style={styles.cardBody}>
                This user account has been permanently revoked by the system administration. All access to the egsm. platform, messages, posts, ratings, and active privileges has been cancelled.
              </Text>
              <View style={styles.subCard}>
                <Text style={styles.subCardLabel}>POLICY CODE</Text>
                <Text style={styles.subCardVal}>ADMIN_REVOKE_PERMANENT</Text>
              </View>
              <Text style={styles.note}>
                If you believe this termination is in error, please contact your company IT / Group Administrator directly.
              </Text>
            </View>
          ) : (
            /* Suspended Details with Live Countdown */
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Suspension Details</Text>
              <Text style={styles.cardBody}>
                Your account is currently under administrative suspension. You will not be able to log in or participate until the suspension expires.
              </Text>

              {/* Exact Expiration Date/Time */}
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>SUSPENSION EXPIRATION DATE & TIME</Text>
                <Text style={styles.detailValue}>{formattedDate}</Text>
              </View>

              {/* Countdown Timer Display */}
              <View style={[styles.countdownBox, { borderColor: themeColor }]}>
                <Text style={[styles.countdownLabel, { color: themeColor }]}>
                  REMAINING COUNTDOWN
                </Text>
                {remaining.isIndefinite ? (
                  <Text style={styles.countdownDigits}>INDEFINITE</Text>
                ) : remaining.expired ? (
                  <Text style={[styles.countdownDigits, { color: '#00FFCC' }]}>
                    SUSPENSION EXPIRED
                  </Text>
                ) : (
                  <View style={styles.digitRow}>
                    <View style={styles.digitBlock}>
                      <Text style={styles.digitNumber}>
                        {String(remaining.days).padStart(2, '0')}
                      </Text>
                      <Text style={styles.digitUnit}>DAYS</Text>
                    </View>
                    <Text style={styles.digitSeparator}>:</Text>
                    <View style={styles.digitBlock}>
                      <Text style={styles.digitNumber}>
                        {String(remaining.hours).padStart(2, '0')}
                      </Text>
                      <Text style={styles.digitUnit}>HRS</Text>
                    </View>
                    <Text style={styles.digitSeparator}>:</Text>
                    <View style={styles.digitBlock}>
                      <Text style={styles.digitNumber}>
                        {String(remaining.minutes).padStart(2, '0')}
                      </Text>
                      <Text style={styles.digitUnit}>MIN</Text>
                    </View>
                    <Text style={styles.digitSeparator}>:</Text>
                    <View style={styles.digitBlock}>
                      <Text style={styles.digitNumber}>
                        {String(remaining.seconds).padStart(2, '0')}
                      </Text>
                      <Text style={styles.digitUnit}>SEC</Text>
                    </View>
                  </View>
                )}
              </View>

              <Text style={styles.note}>
                Once the countdown reaches zero, your account status will automatically clear upon next login.
              </Text>
            </View>
          )}

          {/* Dismiss / Logout Action Button */}
          <TouchableOpacity
            id="account-lock-dismiss-btn"
            style={[styles.button, { backgroundColor: themeColor }]}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {dismissText || (isTerminated ? 'Acknowledge & Exit' : 'Return to Login')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#050A0E',
    paddingTop: TOP_SAFE_PADDING,
  },
  scroll: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D161F',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 16,
  },
  chipText: {
    color: '#050A0E',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 28,
  },
  card: {
    width: '100%',
    backgroundColor: '#0D161F',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 24,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  cardBody: {
    color: '#7E8E9C',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  subCard: {
    backgroundColor: '#0A1017',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 12,
  },
  subCardLabel: {
    color: '#7E8E9C',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  subCardVal: {
    color: '#FF3366',
    fontSize: 13,
    fontWeight: '700',
  },
  detailBox: {
    backgroundColor: '#0A1017',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 16,
  },
  detailLabel: {
    color: '#7E8E9C',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  countdownBox: {
    backgroundColor: '#0A1017',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  countdownDigits: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  digitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitBlock: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  digitNumber: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  digitUnit: {
    color: '#7E8E9C',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  digitSeparator: {
    color: '#7E8E9C',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  note: {
    color: '#7E8E9C',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#050A0E',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default AccountLockModal;
