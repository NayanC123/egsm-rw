// src/screens/AdminPortalScreen.tsx
// Complete Access-Controlled Administration Portal for egsm.
// Strictly access-controlled: only users with currentUser.role === 'admin' can access it.
// Organised into 4 clean sub-tabs:
//   Sub-Tab A: Create & Manage Accounts (Create Card + Member Directory & Moderation)
//   Sub-Tab B: Password Reset Requests Queue
//   Sub-Tab C: Announcements Manager
//   Sub-Tab D: Reported Offenses Queue

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
  BackHandler,
  KeyboardAvoidingView,
} from 'react-native';
import { SAFE_TOP } from '../utils/layout';

const SAFE_TOP_INLINE = Platform.OS === 'android' ? Math.max((StatusBar.currentHeight || 28) + 14, 44) : 50;
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  fetchAccounts,
  createAccount,
  muteUser,
  suspendUser,
  terminateUser,
  resetUserPassword,
  fetchPasswordResetRequests,
  resolvePasswordResetRequest,
  fetchPostsForAdmin,
  togglePostAnnouncement,
  fetchOffenseReports,
  resolveOffenseReport,
  deleteOffendingMessage,
  DetailedOffenseReport,
} from '../services/adminService';
import type { Profile, PasswordResetRequest } from '../types/database';
import type { DetailedPost } from '../services/postsService';

type SubTabId = 'accounts' | 'resets' | 'announcements' | 'offenses';

export const AdminPortalScreen: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  // ── Access Control Guard ──────────────────────────────────────
  if (!user || user.role !== 'admin') {
    return (
      <View style={[styles.center, { backgroundColor: colors.mainBackground }]}>
        <View style={[styles.accessDeniedCard, { backgroundColor: colors.surface, borderColor: '#FF3366' }]}>
          <Text style={styles.accessDeniedIcon}>🔒</Text>
          <Text style={[styles.accessDeniedTitle, { color: '#FF3366' }]}>
            Access Denied
          </Text>
          <Text style={[styles.accessDeniedBody, { color: colors.textSecondary }]}>
            Administrator credentials are required to view this portal. Your current account (@{user?.username || 'guest'}) is not authorized.
          </Text>
        </View>
      </View>
    );
  }

  // ── Sub-Tab State ─────────────────────────────────────────────
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('accounts');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // ── Sub-Tab A Data (Accounts) ─────────────────────────────────
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'active' | 'muted' | 'suspended' | 'terminated'>('all');
  const [isCreateCardOpen, setIsCreateCardOpen] = useState<boolean>(true);

  // Create Form State
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);

  // Moderation Modals
  const [selectedUserForModeration, setSelectedUserForModeration] = useState<Profile | null>(null);
  const [muteModalVisible, setMuteModalVisible] = useState<boolean>(false);
  const [suspendModalVisible, setSuspendModalVisible] = useState<boolean>(false);
  const [passwordResetModalVisible, setPasswordResetModalVisible] = useState<boolean>(false);
  const [adminManualPassword, setAdminManualPassword] = useState<string>('');

  // ── Sub-Tab B Data (Reset Requests) ───────────────────────────
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [resetFilter, setResetFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [activeResolveRequest, setActiveResolveRequest] = useState<PasswordResetRequest | null>(null);
  const [resolvePasswordInput, setResolvePasswordInput] = useState<string>('');

  // ── Sub-Tab C Data (Announcements) ────────────────────────────
  const [posts, setPosts] = useState<DetailedPost[]>([]);
  const [postSearch, setPostSearch] = useState<string>('');

  // ── Sub-Tab D Data (Reported Offenses) ─────────────────────────
  const [offenses, setOffenses] = useState<DetailedOffenseReport[]>([]);
  const [offenseFilter, setOffenseFilter] = useState<'all' | 'pending' | 'resolved'>('pending');

  // ── Load All Data ─────────────────────────────────────────────
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [accs, resets, allPosts, off] = await Promise.all([
        fetchAccounts(),
        fetchPasswordResetRequests(),
        fetchPostsForAdmin(),
        fetchOffenseReports(),
      ]);
      setAccounts(accs);
      setResetRequests(resets);
      setPosts(allPosts);
      setOffenses(off);
    } catch (err) {
      console.warn('[AdminPortalScreen] loadData error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hardware Back Button listener: handle sub-modals and sub-tabs
  useEffect(() => {
    const onBackPress = () => {
      if (muteModalVisible) {
        setMuteModalVisible(false);
        return true;
      }
      if (suspendModalVisible) {
        setSuspendModalVisible(false);
        return true;
      }
      if (passwordResetModalVisible) {
        setPasswordResetModalVisible(false);
        return true;
      }
      if (activeResolveRequest !== null) {
        setActiveResolveRequest(null);
        return true;
      }
      if (activeSubTab !== 'accounts') {
        setActiveSubTab('accounts');
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [
    muteModalVisible,
    suspendModalVisible,
    passwordResetModalVisible,
    activeResolveRequest,
    activeSubTab,
  ]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  // ── Account Helper: Live Status ───────────────────────────────
  const getAccountLiveStatus = (p: Profile): 'terminated' | 'suspended' | 'muted' | 'active' => {
    if (p.status === 'terminated') return 'terminated';
    if (p.status === 'suspended') {
      if (!p.suspended_until) return 'suspended';
      if (new Date(p.suspended_until) > new Date()) return 'suspended';
    }
    if (p.muted_until && new Date(p.muted_until) > new Date()) {
      return 'muted';
    }
    return 'active';
  };

  // ── Sub-Tab A Handlers ────────────────────────────────────────
  const handleCreateAccount = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      Alert.alert('Incomplete Form', 'Please enter a username, password, and display name.');
      return;
    }
    setCreateSubmitting(true);
    const result = await createAccount({
      username: newUsername.trim(),
      password: newPassword.trim(),
      displayName: newDisplayName.trim(),
      role: newRole,
    });
    setCreateSubmitting(false);

    if (result.success) {
      Alert.alert(
        'Account Created',
        `Successfully created ${newRole === 'admin' ? 'Administrator' : 'Member'} account @${newUsername.trim().toLowerCase()}.`
      );
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('member');
      loadData(true);
    } else {
      Alert.alert('Account Creation Failed', result.error || 'Could not create account.');
    }
  };

  const handleApplyMute = async (minutes: number | null) => {
    if (!selectedUserForModeration) return;
    const res = await muteUser(selectedUserForModeration.id, minutes);
    if (res.success) {
      setMuteModalVisible(false);
      Alert.alert(
        'Mute Updated',
        minutes === null
          ? `@${selectedUserForModeration.username} has been unmuted.`
          : `@${selectedUserForModeration.username} is muted for ${minutes >= 1440 ? `${minutes / 1440}d` : minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}.`
      );
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not update mute status.');
    }
  };

  const handleApplySuspend = async (hours: number | null) => {
    if (!selectedUserForModeration) return;
    const res = await suspendUser(selectedUserForModeration.id, hours);
    if (res.success) {
      setSuspendModalVisible(false);
      Alert.alert(
        'Suspension Updated',
        hours === null
          ? `Suspension lifted for @${selectedUserForModeration.username}. Account is now ACTIVE.`
          : `@${selectedUserForModeration.username} suspended for ${hours >= 24 ? `${hours / 24}d` : `${hours}h`}.`
      );
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not update suspension.');
    }
  };

  const handleConfirmTerminate = (target: Profile) => {
    Alert.alert(
      'Terminate Account Permanently',
      `Are you sure you want to PERMANENTLY TERMINATE @${target.username}?\n\nThis will immediately lock the user out of the application.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate Account',
          style: 'destructive',
          onPress: async () => {
            const res = await terminateUser(target.id);
            if (res.success) {
              Alert.alert('Account Terminated', `@${target.username} is now permanently terminated.`);
              loadData(true);
            } else {
              Alert.alert('Action Failed', res.error || 'Could not terminate account.');
            }
          },
        },
      ]
    );
  };

  const handleApplyPasswordReset = async () => {
    if (!selectedUserForModeration) return;
    if (!adminManualPassword.trim() || adminManualPassword.length < 4) {
      Alert.alert('Invalid Password', 'New password must be at least 4 characters long.');
      return;
    }
    const res = await resetUserPassword(selectedUserForModeration.id, adminManualPassword.trim());
    if (res.success) {
      setPasswordResetModalVisible(false);
      Alert.alert(
        'Password Reset Complete',
        `Password for @${selectedUserForModeration.username} has been updated to "${adminManualPassword.trim()}".`
      );
      setAdminManualPassword('');
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not reset password.');
    }
  };

  // ── Sub-Tab B Handlers ────────────────────────────────────────
  const handleResolvePasswordRequest = async () => {
    if (!activeResolveRequest) return;
    if (!resolvePasswordInput.trim() || resolvePasswordInput.length < 4) {
      Alert.alert('Invalid Password', 'Please enter a new password of at least 4 characters.');
      return;
    }
    const res = await resolvePasswordResetRequest(
      activeResolveRequest.id,
      activeResolveRequest.username,
      resolvePasswordInput.trim()
    );
    if (res.success) {
      Alert.alert(
        'Request Resolved',
        `Password for @${activeResolveRequest.username} has been set to "${resolvePasswordInput.trim()}". Mark as resolved complete.`
      );
      setActiveResolveRequest(null);
      setResolvePasswordInput('');
      loadData(true);
    } else {
      Alert.alert('Resolution Failed', res.error || 'Could not resolve password request.');
    }
  };

  // ── Sub-Tab C Handlers ────────────────────────────────────────
  const handleToggleAnnouncement = async (post: DetailedPost) => {
    const nextState = !post.is_announcement;
    const res = await togglePostAnnouncement(post.id, nextState);
    if (res.success) {
      Alert.alert(
        nextState ? '📢 Pinned as Announcement' : 'Announcement Removed',
        nextState
          ? `Post "${post.subject}" is now pinned in #FF6600 at the top of the feed.`
          : `Post "${post.subject}" is no longer pinned as an announcement.`
      );
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not toggle announcement state.');
    }
  };

  // ── Sub-Tab D Handlers ────────────────────────────────────────
  const handleDeleteReportMessage = async (report: DetailedOffenseReport) => {
    const res = await deleteOffendingMessage(report.message_id);
    if (res.success) {
      Alert.alert('Message Deleted', 'The offending chat message has been removed.');
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not delete message.');
    }
  };

  const handleQuickMute24h = async (report: DetailedOffenseReport) => {
    const res = await muteUser(report.reported_user_id, 1440); // 24 hours
    if (res.success) {
      Alert.alert('User Muted', `Reported user @${report.reported_user?.username || 'user'} is muted from chat for 24 hours.`);
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not mute user.');
    }
  };

  const handleQuickSuspend3d = async (report: DetailedOffenseReport) => {
    const res = await suspendUser(report.reported_user_id, 72); // 3 days
    if (res.success) {
      Alert.alert('User Suspended', `Reported user @${report.reported_user?.username || 'user'} is suspended for 3 days.`);
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not suspend user.');
    }
  };

  const handleQuickTerminate = (report: DetailedOffenseReport) => {
    const username = report.reported_user?.username || 'user';
    Alert.alert(
      'Permanent Termination',
      `Permanently terminate @${username} on account of this report?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate User',
          style: 'destructive',
          onPress: async () => {
            const res = await terminateUser(report.reported_user_id);
            if (res.success) {
              Alert.alert('User Terminated', `@${username} has been permanently terminated.`);
              loadData(true);
            } else {
              Alert.alert('Action Failed', res.error || 'Could not terminate user.');
            }
          },
        },
      ]
    );
  };

  const handleMarkReportResolved = async (report: DetailedOffenseReport) => {
    const res = await resolveOffenseReport(report.id, 'resolved');
    if (res.success) {
      Alert.alert('Report Resolved', 'Offense report marked as RESOLVED.');
      loadData(true);
    } else {
      Alert.alert('Action Failed', res.error || 'Could not resolve report.');
    }
  };

  // ── Filtered Collections ──────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.username.toLowerCase().includes(accountSearch.toLowerCase()) ||
        acc.display_name.toLowerCase().includes(accountSearch.toLowerCase());
      if (!matchesSearch) return false;

      const live = getAccountLiveStatus(acc);
      if (accountFilter === 'all') return true;
      if (accountFilter === 'active') return live === 'active';
      if (accountFilter === 'muted') return live === 'muted';
      if (accountFilter === 'suspended') return live === 'suspended';
      if (accountFilter === 'terminated') return live === 'terminated';
      return true;
    });
  }, [accounts, accountSearch, accountFilter]);

  const filteredResetRequests = useMemo(() => {
    return resetRequests.filter((r) => {
      if (resetFilter === 'all') return true;
      return r.status === resetFilter;
    });
  }, [resetRequests, resetFilter]);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (!postSearch.trim()) return true;
      const q = postSearch.toLowerCase();
      return (
        p.subject.toLowerCase().includes(q) ||
        p.author.username.toLowerCase().includes(q) ||
        p.author.display_name.toLowerCase().includes(q)
      );
    });
  }, [posts, postSearch]);

  const filteredOffenses = useMemo(() => {
    return offenses.filter((o) => {
      if (offenseFilter === 'all') return true;
      return o.status === offenseFilter;
    });
  }, [offenses, offenseFilter]);

  const pendingResetCount = resetRequests.filter((r) => r.status === 'pending').length;
  const pendingOffenseCount = offenses.filter((o) => o.status === 'pending').length;

  const s = adminStyles(colors);

  // ─────────────────────────────────────────────────────────────
  // RENDER: Sub-Tab A (Accounts)
  // ─────────────────────────────────────────────────────────────
  const renderSubTabAccounts = () => (
    <ScrollView style={s.subTabScroll} contentContainerStyle={s.subTabScrollContent}>
      {/* ➕ Create New Account Card */}
      <View style={s.card}>
        <TouchableOpacity
          style={s.cardHeaderToggle}
          onPress={() => setIsCreateCardOpen(!isCreateCardOpen)}
          activeOpacity={0.8}
        >
          <View style={s.cardHeaderLeft}>
            <Text style={s.cardIcon}>➕</Text>
            <Text style={s.cardTitle}>Create New Account</Text>
          </View>
          <Text style={s.cardToggleChevron}>{isCreateCardOpen ? '▲ Hide' : '▼ Expand'}</Text>
        </TouchableOpacity>

        {isCreateCardOpen && (
          <View style={s.createFormBody}>
            <Text style={s.createFormHint}>
              Only Admins can issue credentials. Accounts cannot be registered publicly.
            </Text>

            {/* Username */}
            <Text style={s.inputLabel}>Username (Set by Admin)</Text>
            <TextInput
              id="admin-create-username"
              style={s.textInput}
              placeholder="e.g. alex_chen"
              placeholderTextColor={colors.textSecondary}
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Initial Password */}
            <Text style={s.inputLabel}>Initial Password</Text>
            <TextInput
              id="admin-create-password"
              style={s.textInput}
              placeholder="Min 4 characters"
              placeholderTextColor={colors.textSecondary}
              value={newPassword}
              onChangeText={setNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            {/* Display Name */}
            <Text style={s.inputLabel}>Display Name</Text>
            <TextInput
              id="admin-create-displayname"
              style={s.textInput}
              placeholder="e.g. Alex Chen (Security Lead)"
              placeholderTextColor={colors.textSecondary}
              value={newDisplayName}
              onChangeText={setNewDisplayName}
            />

            {/* Role Selector */}
            <Text style={s.inputLabel}>Account Role</Text>
            <View style={s.roleSelectorRow}>
              <TouchableOpacity
                id="admin-role-member"
                style={[s.roleChoiceBtn, newRole === 'member' && s.roleChoiceBtnActive]}
                onPress={() => setNewRole('member')}
              >
                <Text style={[s.roleChoiceText, newRole === 'member' && s.roleChoiceTextActive]}>
                  👤 Member
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="admin-role-admin"
                style={[s.roleChoiceBtn, newRole === 'admin' && s.roleChoiceBtnActive]}
                onPress={() => setNewRole('admin')}
              >
                <Text style={[s.roleChoiceText, newRole === 'admin' && s.roleChoiceTextActive]}>
                  🛡️ Administrator
                </Text>
              </TouchableOpacity>
            </View>

            {/* Create Button */}
            <TouchableOpacity
              id="admin-create-account-btn"
              style={[s.primaryActionButton, createSubmitting && s.buttonDisabled]}
              disabled={createSubmitting}
              onPress={handleCreateAccount}
            >
              {createSubmitting ? (
                <ActivityIndicator color="#050A0E" size="small" />
              ) : (
                <Text style={s.primaryActionText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 👥 Member Directory & Moderation */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Member Directory & Moderation</Text>
        <Text style={s.sectionSubtitle}>
          {filteredAccounts.length} of {accounts.length} accounts
        </Text>
      </View>

      {/* Search Bar */}
      <View style={s.searchContainer}>
        <TextInput
          id="admin-search-accounts"
          style={s.searchInput}
          placeholder="🔍 Search username or display name..."
          placeholderTextColor={colors.textSecondary}
          value={accountSearch}
          onChangeText={setAccountSearch}
          autoCapitalize="none"
        />
        {accountSearch.length > 0 && (
          <TouchableOpacity onPress={() => setAccountSearch('')} style={s.searchClearBtn}>
            <Text style={s.searchClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
        {(['all', 'active', 'muted', 'suspended', 'terminated'] as const).map((chip) => {
          const isActive = accountFilter === chip;
          return (
            <TouchableOpacity
              key={chip}
              style={[s.filterChip, isActive && s.filterChipActive]}
              onPress={() => setAccountFilter(chip)}
            >
              <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                {chip.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Account Cards List */}
      {filteredAccounts.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>No accounts match the selected criteria.</Text>
        </View>
      ) : (
        filteredAccounts.map((acc) => {
          const liveStatus = getAccountLiveStatus(acc);
          const isCurrentUser = acc.id === user.id;

          return (
            <View key={acc.id} style={s.memberCard}>
              {/* Top row: Avatar + Name + Live Badge */}
              <View style={s.memberTopRow}>
                <View style={s.memberAvatar}>
                  <Text style={s.memberAvatarText}>
                    {acc.role === 'admin' ? '🛡️' : '👤'}
                  </Text>
                </View>

                <View style={s.memberMeta}>
                  <View style={s.memberNameRow}>
                    <Text style={s.memberDisplayName} numberOfLines={1}>
                      {acc.display_name}
                    </Text>
                    {acc.role === 'admin' && <View style={s.adminPill}><Text style={s.adminPillText}>ADMIN</Text></View>}
                  </View>
                  <Text style={s.memberUsername}>@{acc.username}</Text>
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    s.statusBadge,
                    liveStatus === 'active' && s.statusBadgeActive,
                    liveStatus === 'muted' && s.statusBadgeMuted,
                    liveStatus === 'suspended' && s.statusBadgeSuspended,
                    liveStatus === 'terminated' && s.statusBadgeTerminated,
                  ]}
                >
                  <Text
                    style={[
                      s.statusBadgeText,
                      liveStatus === 'active' && s.statusBadgeTextActive,
                      liveStatus === 'muted' && s.statusBadgeTextMuted,
                      liveStatus === 'suspended' && s.statusBadgeTextSuspended,
                      liveStatus === 'terminated' && s.statusBadgeTextTerminated,
                    ]}
                  >
                    {liveStatus.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Status details note */}
              {liveStatus === 'muted' && acc.muted_until && (
                <Text style={s.statusNoteMuted}>
                  🔇 Muted until {new Date(acc.muted_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                </Text>
              )}
              {liveStatus === 'suspended' && acc.suspended_until && (
                <Text style={s.statusNoteSuspended}>
                  ⛔ Suspended until {new Date(acc.suspended_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                </Text>
              )}
              {liveStatus === 'terminated' && (
                <Text style={s.statusNoteTerminated}>
                  ☠️ Permanently locked out of the system.
                </Text>
              )}

              {/* Action Buttons Row */}
              <View style={s.memberActionsGrid}>
                {/* 1. Mute / Unmute */}
                <TouchableOpacity
                  id={`btn-mute-${acc.username}`}
                  style={[s.memberActionBtn, s.actionMuteBtn]}
                  onPress={() => {
                    setSelectedUserForModeration(acc);
                    setMuteModalVisible(true);
                  }}
                >
                  <Text style={s.actionMuteText}>
                    {liveStatus === 'muted' ? '🔊 Unmute' : '🔇 Mute Chat'}
                  </Text>
                </TouchableOpacity>

                {/* 2. Suspend / Lift */}
                <TouchableOpacity
                  id={`btn-suspend-${acc.username}`}
                  style={[s.memberActionBtn, s.actionSuspendBtn]}
                  onPress={() => {
                    setSelectedUserForModeration(acc);
                    setSuspendModalVisible(true);
                  }}
                >
                  <Text style={s.actionSuspendText}>
                    {liveStatus === 'suspended' ? '🔓 Lift Suspension' : '⛔ Suspend'}
                  </Text>
                </TouchableOpacity>

                {/* 3. Reset Password */}
                <TouchableOpacity
                  id={`btn-reset-pass-${acc.username}`}
                  style={[s.memberActionBtn, s.actionResetBtn]}
                  onPress={() => {
                    setSelectedUserForModeration(acc);
                    setPasswordResetModalVisible(true);
                  }}
                >
                  <Text style={s.actionResetText}>🔑 Reset Pass</Text>
                </TouchableOpacity>

                {/* 4. Terminate */}
                {!isCurrentUser && liveStatus !== 'terminated' && (
                  <TouchableOpacity
                    id={`btn-terminate-${acc.username}`}
                    style={[s.memberActionBtn, s.actionTerminateBtn]}
                    onPress={() => handleConfirmTerminate(acc)}
                  >
                    <Text style={s.actionTerminateText}>☠️ Terminate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER: Sub-Tab B (Password Reset Requests)
  // ─────────────────────────────────────────────────────────────
  const renderSubTabResets = () => (
    <ScrollView style={s.subTabScroll} contentContainerStyle={s.subTabScrollContent}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Password Reset Requests Queue</Text>
        <Text style={s.sectionSubtitle}>
          Submitted by users via Pre-Login Forgot Password screen
        </Text>
      </View>

      {/* Filter Chips */}
      <View style={s.filterRow}>
        {(['pending', 'all', 'resolved'] as const).map((chip) => {
          const isActive = resetFilter === chip;
          return (
            <TouchableOpacity
              key={chip}
              style={[s.filterChip, isActive && s.filterChipActive]}
              onPress={() => setResetFilter(chip)}
            >
              <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                {chip === 'pending' ? `PENDING (${pendingResetCount})` : chip.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredResetRequests.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>No password reset requests in this queue.</Text>
        </View>
      ) : (
        filteredResetRequests.map((req) => {
          const isPending = req.status === 'pending';
          return (
            <View key={req.id} style={s.resetCard}>
              <View style={s.resetHeader}>
                <View style={s.resetUserGroup}>
                  <Text style={s.resetUserIcon}>👤</Text>
                  <Text style={s.resetUsername}>@{req.username}</Text>
                </View>
                <View
                  style={[
                    s.statusBadge,
                    isPending ? s.statusBadgeSuspended : s.statusBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      s.statusBadgeText,
                      isPending ? s.statusBadgeTextSuspended : s.statusBadgeTextActive,
                    ]}
                  >
                    {req.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {req.request_note && (
                <View style={s.resetNoteBox}>
                  <Text style={s.resetNoteLabel}>User Note:</Text>
                  <Text style={s.resetNoteText}>"{req.request_note}"</Text>
                </View>
              )}

              <Text style={s.resetTimestamp}>
                Requested: {new Date(req.created_at).toLocaleString()}
              </Text>

              {isPending && (
                <TouchableOpacity
                  id={`btn-resolve-reset-${req.id}`}
                  style={s.resolveRequestBtn}
                  onPress={() => {
                    setActiveResolveRequest(req);
                    setResolvePasswordInput('');
                  }}
                >
                  <Text style={s.resolveRequestBtnText}>
                    🔑 Set New Password & Resolve Request
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER: Sub-Tab C (Announcements Manager)
  // ─────────────────────────────────────────────────────────────
  const renderSubTabAnnouncements = () => (
    <ScrollView style={s.subTabScroll} contentContainerStyle={s.subTabScrollContent}>
      <View style={s.announcementNoticeCard}>
        <Text style={s.announcementNoticeIcon}>📢</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.announcementNoticeTitle}>Live Announcements Manager</Text>
          <Text style={s.announcementNoticeText}>
            Marking a post as an announcement immediately turns it <Text style={{ color: '#FF6600', fontWeight: 'bold' }}>#FF6600</Text> and pins it to the very top of the Posts feed for all members.
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchContainer}>
        <TextInput
          id="admin-search-posts"
          style={s.searchInput}
          placeholder="🔍 Search posts by subject or author..."
          placeholderTextColor={colors.textSecondary}
          value={postSearch}
          onChangeText={setPostSearch}
        />
        {postSearch.length > 0 && (
          <TouchableOpacity onPress={() => setPostSearch('')} style={s.searchClearBtn}>
            <Text style={s.searchClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>No posts found matching query.</Text>
        </View>
      ) : (
        filteredPosts.map((post) => {
          const isAnnounce = post.is_announcement;

          return (
            <View
              key={post.id}
              style={[
                s.postCard,
                isAnnounce && { borderColor: 'rgba(255, 102, 0, 0.35)', borderWidth: 1, backgroundColor: isDark ? 'rgba(255, 102, 0, 0.06)' : '#FFF9F5' },
              ]}
            >
              {isAnnounce && (
                <View style={s.pinnedBadgeRow}>
                  <Text style={s.pinnedBadgeText}>📢 PINNED ANNOUNCEMENT (#FF6600)</Text>
                </View>
              )}

              <Text style={[s.postSubject, isAnnounce && { color: '#FF6600' }]}>
                {post.subject}
              </Text>

              <View style={s.postAuthorRow}>
                <Text style={s.postAuthorText}>
                  By {post.author.display_name} (@{post.author.username})
                </Text>
                <Text style={s.postRatingText}>
                  ⭐ {post.satisfactionRate !== null ? `${post.satisfactionRate.toFixed(1)}%` : 'No ratings'}
                </Text>
              </View>

              <Text style={s.postSnippet} numberOfLines={2}>
                {post.content}
              </Text>

              {/* Action Button */}
              <TouchableOpacity
                id={`btn-toggle-announcement-${post.id}`}
                style={[
                  s.announcementToggleBtn,
                  isAnnounce ? s.announcementToggleBtnActive : s.announcementToggleBtnInactive,
                ]}
                onPress={() => handleToggleAnnouncement(post)}
              >
                <Text
                  style={[
                    s.announcementToggleText,
                    isAnnounce ? s.announcementToggleTextActive : s.announcementToggleTextInactive,
                  ]}
                >
                  {isAnnounce ? '✕ Remove Announcement' : '📢 Pin as Announcement'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER: Sub-Tab D (Reported Offenses)
  // ─────────────────────────────────────────────────────────────
  const renderSubTabOffenses = () => (
    <ScrollView style={s.subTabScroll} contentContainerStyle={s.subTabScrollContent}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Reported Chat Offenses Queue</Text>
        <Text style={s.sectionSubtitle}>
          Real-time violation reports flagged by community members
        </Text>
      </View>

      {/* Filter */}
      <View style={s.filterRow}>
        {(['pending', 'all', 'resolved'] as const).map((chip) => {
          const isActive = offenseFilter === chip;
          return (
            <TouchableOpacity
              key={chip}
              style={[s.filterChip, isActive && s.filterChipActive]}
              onPress={() => setOffenseFilter(chip)}
            >
              <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                {chip === 'pending' ? `PENDING (${pendingOffenseCount})` : chip.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredOffenses.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>No offense reports in this queue.</Text>
        </View>
      ) : (
        filteredOffenses.map((rep) => {
          const isPending = rep.status === 'pending';

          return (
            <View key={rep.id} style={s.offenseCard}>
              <View style={s.offenseHeaderRow}>
                <View style={s.offenseUserPill}>
                  <Text style={s.offenseUserPillText}>
                    🚨 Reported: @{rep.reported_user?.username || 'user'}
                  </Text>
                </View>
                <View
                  style={[
                    s.statusBadge,
                    isPending ? s.statusBadgeTerminated : s.statusBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      s.statusBadgeText,
                      isPending ? s.statusBadgeTextTerminated : s.statusBadgeTextActive,
                    ]}
                  >
                    {rep.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={s.offenseReporterText}>
                Reporter: {rep.reporter?.display_name || (rep.reporter?.username ? `@${rep.reporter.username}` : 'User')} (@{rep.reporter?.username || 'reporter'})
              </Text>

              {/* Offending Message Box */}
              <View style={s.offendingMessageBox}>
                <Text style={s.offendingMessageLabel}>Offending Content:</Text>
                <Text style={s.offendingMessageContent}>
                  "{rep.message_content || '[No text content]'}"
                </Text>
                {rep.is_message_deleted && (
                  <Text style={s.deletedIndicator}>🚫 Message has already been deleted.</Text>
                )}
              </View>

              {/* Reason */}
              <View style={s.offenseReasonBox}>
                <Text style={s.offenseReasonLabel}>Violation Reason:</Text>
                <Text style={s.offenseReasonText}>{rep.reason}</Text>
              </View>

              <Text style={s.offenseTimestamp}>
                Reported on {new Date(rep.created_at).toLocaleString()}
              </Text>

              {/* Moderation Actions Grid */}
              <View style={s.offenseActionsGrid}>
                {/* 1. Delete Message */}
                {!rep.is_message_deleted && (
                  <TouchableOpacity
                    id={`btn-del-msg-${rep.id}`}
                    style={[s.offenseActionBtn, { borderColor: '#FF3366' }]}
                    onPress={() => handleDeleteReportMessage(rep)}
                  >
                    <Text style={[s.offenseActionText, { color: '#FF3366' }]}>
                      🗑️ Delete Message
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 2. Mute User (24h) */}
                <TouchableOpacity
                  id={`btn-mute-24h-${rep.id}`}
                  style={[s.offenseActionBtn, { borderColor: '#FFB800' }]}
                  onPress={() => handleQuickMute24h(rep)}
                >
                  <Text style={[s.offenseActionText, { color: '#FFB800' }]}>
                    🔇 Mute User (24h)
                  </Text>
                </TouchableOpacity>

                {/* 3. Suspend User (3d) */}
                <TouchableOpacity
                  id={`btn-suspend-3d-${rep.id}`}
                  style={[s.offenseActionBtn, { borderColor: '#FF6600' }]}
                  onPress={() => handleQuickSuspend3d(rep)}
                >
                  <Text style={[s.offenseActionText, { color: '#FF6600' }]}>
                    ⛔ Suspend User (3d)
                  </Text>
                </TouchableOpacity>

                {/* 4. Terminate User */}
                <TouchableOpacity
                  id={`btn-term-offense-${rep.id}`}
                  style={[s.offenseActionBtn, { borderColor: '#FF3366', backgroundColor: '#3A101A' }]}
                  onPress={() => handleQuickTerminate(rep)}
                >
                  <Text style={[s.offenseActionText, { color: '#FF3366', fontWeight: 'bold' }]}>
                    ☠️ Terminate User
                  </Text>
                </TouchableOpacity>

                {/* 5. Mark Report Resolved */}
                {isPending && (
                  <TouchableOpacity
                    id={`btn-mark-resolved-${rep.id}`}
                    style={[s.offenseActionBtn, { borderColor: '#00FFCC', backgroundColor: '#0A2E28' }]}
                    onPress={() => handleMarkReportResolved(rep)}
                  >
                    <Text style={[s.offenseActionText, { color: '#00FFCC', fontWeight: 'bold' }]}>
                      ✅ Mark Report Resolved
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // ─────────────────────────────────────────────────────────────
  // MODAL: Mute Duration Picker
  // ─────────────────────────────────────────────────────────────
  const renderMuteModal = () => (
    <Modal
      visible={muteModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setMuteModalVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>
            🔇 Mute @{selectedUserForModeration?.username}
          </Text>
          <Text style={s.modalSubtitle}>
            Select mute duration from group chat or unmute to restore privileges immediately:
          </Text>

          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplyMute(10)}
          >
            <Text style={s.modalChoiceText}>⏱️ 10 Minutes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplyMute(60)}
          >
            <Text style={s.modalChoiceText}>🕐 1 Hour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplyMute(1440)}
          >
            <Text style={s.modalChoiceText}>📅 24 Hours</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplyMute(10080)}
          >
            <Text style={s.modalChoiceText}>📆 7 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modalChoiceBtn, { borderColor: '#00FFCC', backgroundColor: '#072E27' }]}
            onPress={() => handleApplyMute(null)}
          >
            <Text style={[s.modalChoiceText, { color: '#00FFCC', fontWeight: 'bold' }]}>
              🔊 Unmute User (Restore Now)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.modalCancelBtn}
            onPress={() => setMuteModalVisible(false)}
          >
            <Text style={s.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────
  // MODAL: Suspend Duration Picker
  // ─────────────────────────────────────────────────────────────
  const renderSuspendModal = () => (
    <Modal
      visible={suspendModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setSuspendModalVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={[s.modalTitle, { color: '#FF6600' }]}>
            ⛔ Suspend @{selectedUserForModeration?.username}
          </Text>
          <Text style={s.modalSubtitle}>
            Suspended users cannot log in or participate until the suspension expires:
          </Text>

          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplySuspend(1)}
          >
            <Text style={s.modalChoiceText}>🕐 1 Hour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplySuspend(24)}
          >
            <Text style={s.modalChoiceText}>📅 24 Hours</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplySuspend(72)}
          >
            <Text style={s.modalChoiceText}>📅 3 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.modalChoiceBtn}
            onPress={() => handleApplySuspend(168)}
          >
            <Text style={s.modalChoiceText}>📆 7 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modalChoiceBtn, { borderColor: '#00FFCC', backgroundColor: '#072E27' }]}
            onPress={() => handleApplySuspend(null)}
          >
            <Text style={[s.modalChoiceText, { color: '#00FFCC', fontWeight: 'bold' }]}>
              🔓 Lift Suspension (Restore to ACTIVE)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.modalCancelBtn}
            onPress={() => setSuspendModalVisible(false)}
          >
            <Text style={s.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────
  // MODAL: Admin Reset User Password
  // ─────────────────────────────────────────────────────────────
  const renderResetPasswordModal = () => (
    <Modal
      visible={passwordResetModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setPasswordResetModalVisible(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>
            🔑 Reset Password for @{selectedUserForModeration?.username}
          </Text>
          <Text style={s.modalSubtitle}>
            Type a new password for this user. The credentials will be saved directly:
          </Text>

          <TextInput
            id="admin-manual-new-password"
            style={s.modalTextInput}
            placeholder="Enter new password (min 4 chars)"
            placeholderTextColor={colors.textSecondary}
            value={adminManualPassword}
            onChangeText={setAdminManualPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            id="admin-save-new-password-btn"
            style={s.primaryActionButton}
            onPress={handleApplyPasswordReset}
          >
            <Text style={s.primaryActionText}>Save New Password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.modalCancelBtn}
            onPress={() => {
              setPasswordResetModalVisible(false);
              setAdminManualPassword('');
            }}
          >
            <Text style={s.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────
  // MODAL: Resolve Forgot-Password Request
  // ─────────────────────────────────────────────────────────────
  const renderResolveRequestModal = () => (
    <Modal
      visible={!!activeResolveRequest}
      transparent
      animationType="fade"
      onRequestClose={() => setActiveResolveRequest(null)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>
            Resolve Password Request
          </Text>
          <Text style={s.modalSubtitle}>
            Issue a new password for @{activeResolveRequest?.username}. This will resolve the pending ticket:
          </Text>

          {activeResolveRequest?.request_note && (
            <View style={s.resetNoteBox}>
              <Text style={s.resetNoteLabel}>User Note:</Text>
              <Text style={s.resetNoteText}>"{activeResolveRequest.request_note}"</Text>
            </View>
          )}

          <TextInput
            id="input-resolve-password"
            style={s.modalTextInput}
            placeholder="Type new password (e.g. tempPass2026!)"
            placeholderTextColor={colors.textSecondary}
            value={resolvePasswordInput}
            onChangeText={setResolvePasswordInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            id="btn-confirm-resolve-request"
            style={s.primaryActionButton}
            onPress={handleResolvePasswordRequest}
          >
            <Text style={s.primaryActionText}>Set Password & Mark Resolved</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.modalCancelBtn}
            onPress={() => setActiveResolveRequest(null)}
          >
            <Text style={s.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────
  // MAIN RETURN
  // ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.screenContainer} behavior="padding">
      {/* Portal Top Header Bar */}
      <View style={s.topBar}>
        <View style={s.topBarLeft}>
          <Text style={s.portalTitle}>🛡️ ADMIN PORTAL</Text>
          <Text style={s.portalSubtitle}>
            Logged in as @{user.username} ({user.display_name})
          </Text>
        </View>
        <TouchableOpacity
          id="admin-refresh-btn"
          style={s.refreshBtn}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#00FFCC" />
          ) : (
            <Text style={s.refreshBtnText}>🔄 Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 4 Clean Sub-Tabs */}
      <View style={s.subTabBar}>
        {/* Sub-Tab A */}
        <TouchableOpacity
          id="subtab-accounts"
          style={[s.subTabBtn, activeSubTab === 'accounts' && s.subTabBtnActive]}
          onPress={() => setActiveSubTab('accounts')}
        >
          <Text style={[s.subTabBtnText, activeSubTab === 'accounts' && s.subTabBtnTextActive]}>
            👥 Accounts
          </Text>
        </TouchableOpacity>

        {/* Sub-Tab B */}
        <TouchableOpacity
          id="subtab-resets"
          style={[s.subTabBtn, activeSubTab === 'resets' && s.subTabBtnActive]}
          onPress={() => setActiveSubTab('resets')}
        >
          <Text style={[s.subTabBtnText, activeSubTab === 'resets' && s.subTabBtnTextActive]}>
            🔑 Resets {pendingResetCount > 0 ? `(${pendingResetCount})` : ''}
          </Text>
        </TouchableOpacity>

        {/* Sub-Tab C */}
        <TouchableOpacity
          id="subtab-announcements"
          style={[s.subTabBtn, activeSubTab === 'announcements' && s.subTabBtnActive]}
          onPress={() => setActiveSubTab('announcements')}
        >
          <Text style={[s.subTabBtnText, activeSubTab === 'announcements' && s.subTabBtnTextActive]}>
            📢 Pins
          </Text>
        </TouchableOpacity>

        {/* Sub-Tab D */}
        <TouchableOpacity
          id="subtab-offenses"
          style={[s.subTabBtn, activeSubTab === 'offenses' && s.subTabBtnActive]}
          onPress={() => setActiveSubTab('offenses')}
        >
          <Text style={[s.subTabBtnText, activeSubTab === 'offenses' && s.subTabBtnTextActive]}>
            🚨 Reports {pendingOffenseCount > 0 ? `(${pendingOffenseCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00FFCC" />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading Admin Records...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {activeSubTab === 'accounts' && renderSubTabAccounts()}
          {activeSubTab === 'resets' && renderSubTabResets()}
          {activeSubTab === 'announcements' && renderSubTabAnnouncements()}
          {activeSubTab === 'offenses' && renderSubTabOffenses()}
        </View>
      )}

      {/* Modals */}
      {renderMuteModal()}
      {renderSuspendModal()}
      {renderResetPasswordModal()}
      {renderResolveRequestModal()}
    </KeyboardAvoidingView>
  );
};

const adminStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    screenContainer: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
    },
    topBarLeft: {
      flex: 1,
    },
    portalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.primary,
      letterSpacing: 0.5,
    },
    portalSubtitle: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 2,
    },
    refreshBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.primary,
    },
    refreshBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
    },

    // ── Sub-Tabs Bar ──
    subTabBar: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    subTabBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    subTabBtnActive: {
      borderBottomColor: c.primary,
    },
    subTabBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    subTabBtnTextActive: {
      color: c.primary,
      fontWeight: '700',
    },

    // ── Sub-Tab Content Scroll ──
    subTabScroll: {
      flex: 1,
    },
    subTabScrollContent: {
      padding: 16,
      paddingBottom: 40,
    },

    // ── Cards ──
    card: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 20,
      overflow: 'hidden',
    },
    cardHeaderToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: c.surface,
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardIcon: {
      fontSize: 18,
      marginRight: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
    },
    cardToggleChevron: {
      fontSize: 12,
      color: c.primary,
      fontWeight: '600',
    },

    // ── Create Account Form ──
    createFormBody: {
      padding: 16,
      paddingTop: 0,
    },
    createFormHint: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 14,
      lineHeight: 18,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textPrimary,
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: c.mainBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      color: c.textPrimary,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    roleSelectorRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    roleChoiceBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      backgroundColor: c.mainBackground,
    },
    roleChoiceBtnActive: {
      borderColor: c.primary,
      backgroundColor: '#072E27',
    },
    roleChoiceText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    roleChoiceTextActive: {
      color: c.primary,
      fontWeight: '700',
    },
    primaryActionButton: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryActionText: {
      color: '#050A0E',
      fontSize: 14,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.5,
    },

    // ── Directory Section ──
    sectionHeader: {
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 2,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
      paddingHorizontal: 10,
    },
    searchInput: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 13,
      paddingVertical: 10,
    },
    searchClearBtn: {
      padding: 4,
    },
    searchClearText: {
      color: c.textSecondary,
      fontSize: 14,
    },
    chipScroll: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      marginRight: 8,
    },
    filterChipActive: {
      borderColor: c.primary,
      backgroundColor: '#072E27',
    },
    filterChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textSecondary,
    },
    filterChipTextActive: {
      color: c.primary,
      fontWeight: '700',
    },

    // ── Member Card ──
    memberCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 12,
    },
    memberTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    memberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.mainBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
      marginRight: 10,
    },
    memberAvatarText: {
      fontSize: 20,
    },
    memberMeta: {
      flex: 1,
    },
    memberNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    memberDisplayName: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textPrimary,
      flexShrink: 1,
    },
    adminPill: {
      backgroundColor: '#FF6600',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    adminPillText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    memberUsername: {
      fontSize: 12,
      color: c.primary,
      marginTop: 2,
    },

    // ── Status Badges ──
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
    },
    statusBadgeActive: {
      backgroundColor: '#0A2E28',
      borderColor: '#00FFCC',
    },
    statusBadgeMuted: {
      backgroundColor: '#332607',
      borderColor: '#FFB800',
    },
    statusBadgeSuspended: {
      backgroundColor: '#331B0A',
      borderColor: '#FF6600',
    },
    statusBadgeTerminated: {
      backgroundColor: '#3A101A',
      borderColor: '#FF3366',
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    statusBadgeTextActive: {
      color: '#00FFCC',
    },
    statusBadgeTextMuted: {
      color: '#FFB800',
    },
    statusBadgeTextSuspended: {
      color: '#FF6600',
    },
    statusBadgeTextTerminated: {
      color: '#FF3366',
    },

    statusNoteMuted: {
      fontSize: 11,
      color: '#FFB800',
      marginTop: 8,
      fontStyle: 'italic',
    },
    statusNoteSuspended: {
      fontSize: 11,
      color: '#FF6600',
      marginTop: 8,
      fontStyle: 'italic',
    },
    statusNoteTerminated: {
      fontSize: 11,
      color: '#FF3366',
      marginTop: 8,
      fontStyle: 'italic',
    },

    // ── Member Actions Grid ──
    memberActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    memberActionBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
    },
    actionMuteBtn: {
      borderColor: '#FFB800',
      backgroundColor: '#261C05',
    },
    actionMuteText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FFB800',
    },
    actionSuspendBtn: {
      borderColor: '#FF6600',
      backgroundColor: '#261405',
    },
    actionSuspendText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FF6600',
    },
    actionResetBtn: {
      borderColor: c.primary,
      backgroundColor: '#072E27',
    },
    actionResetText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.primary,
    },
    actionTerminateBtn: {
      borderColor: '#FF3366',
      backgroundColor: '#2E0812',
    },
    actionTerminateText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FF3366',
    },

    // ── Reset Requests Tab ──
    resetCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 12,
    },
    resetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    resetUserGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    resetUserIcon: {
      fontSize: 16,
    },
    resetUsername: {
      fontSize: 15,
      fontWeight: '700',
      color: c.primary,
    },
    resetNoteBox: {
      backgroundColor: c.mainBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      marginTop: 10,
    },
    resetNoteLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textSecondary,
      marginBottom: 2,
    },
    resetNoteText: {
      fontSize: 13,
      color: c.textPrimary,
      fontStyle: 'italic',
    },
    resetTimestamp: {
      fontSize: 11,
      color: c.textSecondary,
      marginTop: 8,
    },
    resolveRequestBtn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 12,
    },
    resolveRequestBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#050A0E',
    },

    // ── Announcements Tab ──
    announcementNoticeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#261405',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#FF6600',
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    announcementNoticeIcon: {
      fontSize: 28,
    },
    announcementNoticeTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FF6600',
      marginBottom: 2,
    },
    announcementNoticeText: {
      fontSize: 12,
      color: c.textPrimary,
      lineHeight: 16,
    },
    postCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 12,
    },
    pinnedBadgeRow: {
      alignSelf: 'flex-start',
      backgroundColor: '#FF6600',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 8,
    },
    pinnedBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    postSubject: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 6,
    },
    postAuthorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    postAuthorText: {
      fontSize: 12,
      color: c.textSecondary,
    },
    postRatingText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.primary,
    },
    postSnippet: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    announcementToggleBtn: {
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
    },
    announcementToggleBtnInactive: {
      borderColor: '#FF6600',
      backgroundColor: '#261405',
    },
    announcementToggleBtnActive: {
      borderColor: c.border,
      backgroundColor: c.mainBackground,
    },
    announcementToggleText: {
      fontSize: 13,
      fontWeight: '700',
    },
    announcementToggleTextInactive: {
      color: '#FF6600',
    },
    announcementToggleTextActive: {
      color: c.textSecondary,
    },

    // ── Reported Offenses Tab ──
    offenseCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 14,
    },
    offenseHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    offenseUserPill: {
      backgroundColor: '#3A101A',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: '#FF3366',
    },
    offenseUserPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FF3366',
    },
    offenseReporterText: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 8,
    },
    offendingMessageBox: {
      backgroundColor: c.mainBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      marginBottom: 8,
    },
    offendingMessageLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    offendingMessageContent: {
      fontSize: 13,
      color: c.textPrimary,
      fontStyle: 'italic',
      lineHeight: 18,
    },
    deletedIndicator: {
      fontSize: 11,
      color: '#FF3366',
      marginTop: 4,
      fontStyle: 'italic',
    },
    offenseReasonBox: {
      backgroundColor: '#261405',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#FF6600',
      padding: 10,
      marginBottom: 8,
    },
    offenseReasonLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FF6600',
      marginBottom: 2,
      textTransform: 'uppercase',
    },
    offenseReasonText: {
      fontSize: 13,
      color: c.textPrimary,
    },
    offenseTimestamp: {
      fontSize: 11,
      color: c.textSecondary,
      marginBottom: 10,
    },
    offenseActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    offenseActionBtn: {
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      backgroundColor: c.mainBackground,
    },
    offenseActionText: {
      fontSize: 11,
      fontWeight: '600',
    },

    // ── Modals ──
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      paddingTop: SAFE_TOP,
    },
    modalBox: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.primary,
      marginBottom: 6,
    },
    modalSubtitle: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 16,
      lineHeight: 17,
    },
    modalChoiceBtn: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.mainBackground,
      marginBottom: 8,
    },
    modalChoiceText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textPrimary,
    },
    modalTextInput: {
      backgroundColor: c.mainBackground,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      color: c.textPrimary,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
    },
    modalCancelBtn: {
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 6,
    },
    modalCancelText: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '600',
    },

    // ── Misc ──
    emptyBox: {
      padding: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyText: {
      fontSize: 13,
      color: c.textSecondary,
    },
    loadingText: {
      fontSize: 13,
      marginTop: 10,
    },
  });

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  accessDeniedCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    maxWidth: 360,
  },
  accessDeniedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  accessDeniedTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  accessDeniedBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default AdminPortalScreen;
