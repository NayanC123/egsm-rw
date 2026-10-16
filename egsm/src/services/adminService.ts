// src/services/adminService.ts
// Central administration service handling Account Creation & Directory Moderation,
// Password Reset Requests Queue, Announcements Management, and Reported Offenses Queue.
// Writes directly to Supabase with strict column naming and immediate error alerts.

import { Alert } from 'react-native';
import { supabase } from './supabase';
import { fetchPosts, toggleAnnouncement, DetailedPost } from './postsService';
import { deleteMessage } from './chatService';
import type {
  Profile,
  PasswordResetRequest,
  OffenseReport,
} from '../types/database';

export interface DetailedOffenseReport extends OffenseReport {
  reporter?: Pick<Profile, 'id' | 'username' | 'display_name'>;
  reported_user?: Pick<Profile, 'id' | 'username' | 'display_name' | 'status' | 'muted_until' | 'suspended_until'>;
  message_content?: string;
  message_type?: string;
  is_message_deleted?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Sub-Tab A: Accounts Management
// ─────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Sync Error: fetchAccounts', `${error.message} (${error.code})`);
      return [];
    }
    return (data as Profile[]) || [];
  } catch (err: any) {
    Alert.alert('Sync Error: fetchAccounts', err?.message || 'Failed to fetch accounts.');
    return [];
  }
}

export interface CreateAccountParams {
  username: string;
  password: string;
  displayName: string;
  role: 'member' | 'admin';
}

export async function createAccount(
  params: CreateAccountParams
): Promise<{ success: boolean; error?: string; profile?: Profile }> {
  const { username, password, displayName, role } = params;

  const cleanUsername = username.trim().toLowerCase();
  const cleanDisplayName = displayName.trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters long.' };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    return { success: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }

  if (!password || password.length < 4) {
    return { success: false, error: 'Initial password must be at least 4 characters long.' };
  }

  if (!cleanDisplayName) {
    return { success: false, error: 'Display Name cannot be empty.' };
  }

  try {
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existingUser) {
      return { success: false, error: `Username @${cleanUsername} is already registered.` };
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        username: cleanUsername,
        password_hash: password,
        display_name: cleanDisplayName,
        role,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      Alert.alert('Sync Error: createAccount', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }

    return { success: true, profile: data as Profile };
  } catch (err: any) {
    Alert.alert('Sync Error: createAccount', err?.message || 'Failed to create account in database.');
    return { success: false, error: err?.message || 'Failed to create account in database.' };
  }
}

export async function muteUser(
  userId: string,
  durationMinutes: number | null
): Promise<{ success: boolean; error?: string }> {
  const mutedUntil =
    durationMinutes !== null
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : null;

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ muted_until: mutedUntil })
      .eq('id', userId);

    if (error) {
      Alert.alert('Sync Error: muteUser', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: muteUser', err?.message || 'Failed to update mute status.');
    return { success: false, error: err?.message || 'Failed to update mute status.' };
  }
}

export async function suspendUser(
  userId: string,
  durationHours: number | null
): Promise<{ success: boolean; error?: string }> {
  const isLifting = durationHours === null;
  const status = isLifting ? 'active' : 'suspended';
  const suspendedUntil = isLifting
    ? null
    : new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        status,
        suspended_until: suspendedUntil,
      })
      .eq('id', userId);

    if (error) {
      Alert.alert('Sync Error: suspendUser', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: suspendUser', err?.message || 'Failed to update suspension status.');
    return { success: false, error: err?.message || 'Failed to update suspension status.' };
  }
}

export async function terminateUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        status: 'terminated',
        suspended_until: null,
      })
      .eq('id', userId);

    if (error) {
      Alert.alert('Sync Error: terminateUser', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: terminateUser', err?.message || 'Failed to terminate user.');
    return { success: false, error: err?.message || 'Failed to terminate user.' };
  }
}

export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters long.' };
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ password_hash: newPassword })
      .eq('id', userId);

    if (error) {
      Alert.alert('Sync Error: resetUserPassword', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: resetUserPassword', err?.message || 'Failed to reset user password.');
    return { success: false, error: err?.message || 'Failed to reset user password.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Sub-Tab B: Password Reset Requests Queue
// ─────────────────────────────────────────────────────────────

export async function fetchPasswordResetRequests(): Promise<PasswordResetRequest[]> {
  try {
    const { data, error } = await supabase
      .from('password_reset_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Sync Error: fetchPasswordResetRequests', `${error.message} (${error.code})`);
      return [];
    }
    return (data as PasswordResetRequest[]) || [];
  } catch (err: any) {
    Alert.alert('Sync Error: fetchPasswordResetRequests', err?.message || 'Failed to fetch password reset requests.');
    return [];
  }
}

export async function resolvePasswordResetRequest(
  requestId: string,
  username: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters long.' };
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    // 1. Update password in profiles
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ password_hash: newPassword })
      .eq('username', cleanUsername);

    if (profileErr) {
      Alert.alert('Sync Error: resolvePasswordResetRequest', `${profileErr.message} (${profileErr.code})`);
      return { success: false, error: profileErr.message };
    }

    // 2. Mark request resolved
    const { error: reqErr } = await supabase
      .from('password_reset_requests')
      .update({ status: 'resolved' })
      .eq('id', requestId);

    if (reqErr) {
      Alert.alert('Sync Error: resolvePasswordResetRequest', `${reqErr.message} (${reqErr.code})`);
      return { success: false, error: reqErr.message };
    }

    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: resolvePasswordResetRequest', err?.message || 'Failed to resolve request in database.');
    return { success: false, error: err?.message || 'Failed to resolve request in database.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Sub-Tab C: Announcements Manager
// ─────────────────────────────────────────────────────────────

export async function fetchPostsForAdmin(): Promise<DetailedPost[]> {
  return await fetchPosts();
}

export async function togglePostAnnouncement(
  postId: string,
  isAnnouncement: boolean
): Promise<{ success: boolean; error?: string }> {
  return await toggleAnnouncement(postId, isAnnouncement);
}

// ─────────────────────────────────────────────────────────────
// Sub-Tab D: Reported Offenses Queue
// ─────────────────────────────────────────────────────────────

export async function fetchOffenseReports(): Promise<DetailedOffenseReport[]> {
  try {
    const { data: rawReports, error: repError } = await supabase
      .from('offense_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (repError || !rawReports) {
      Alert.alert('Sync Error: fetchOffenseReports', `${repError?.message || 'Failed'} (${repError?.code || 'FETCH_ERR'})`);
      return [];
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, display_name, status, muted_until, suspended_until');

    const profileMap = new Map<string, any>();
    (profilesData || []).forEach((p) => profileMap.set(p.id, p));

    const { data: messagesData } = await supabase
      .from('messages')
      .select('id, content, message_type, is_deleted');

    const messageMap = new Map<string, any>();
    (messagesData || []).forEach((m) => messageMap.set(m.id, m));

    const detailed: DetailedOffenseReport[] = (rawReports as any[]).map((rep) => {
      const reporter = profileMap.get(rep.reporter_id);
      const reported = profileMap.get(rep.reported_user_id);
      const msg = messageMap.get(rep.message_id);

      return {
        ...rep,
        reporter: reporter
          ? { id: reporter.id, username: reporter.username, display_name: reporter.display_name }
          : { id: rep.reporter_id, username: 'unknown', display_name: 'Reporter' },
        reported_user: reported
          ? {
              id: reported.id,
              username: reported.username,
              display_name: reported.display_name,
              status: reported.status,
              muted_until: reported.muted_until,
              suspended_until: reported.suspended_until,
            }
          : {
              id: rep.reported_user_id,
              username: 'unknown',
              display_name: 'Reported User',
              status: 'active',
              muted_until: null,
              suspended_until: null,
            },
        message_content: msg ? msg.content : 'Message referenced: [id: ' + rep.message_id + ']',
        message_type: msg ? msg.message_type : 'text',
        is_message_deleted: msg ? msg.is_deleted : false,
      };
    });

    return detailed;
  } catch (err: any) {
    Alert.alert('Sync Error: fetchOffenseReports', err?.message || 'Failed to fetch offense reports.');
    return [];
  }
}

export async function resolveOffenseReport(
  reportId: string,
  newStatus: 'resolved' | 'dismissed'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('offense_reports')
      .update({ status: newStatus })
      .eq('id', reportId);

    if (error) {
      Alert.alert('Sync Error: resolveOffenseReport', `${error.message} (${error.code})`);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    Alert.alert('Sync Error: resolveOffenseReport', err?.message || 'Failed to update report status.');
    return { success: false, error: err?.message || 'Failed to update report status.' };
  }
}

export async function deleteOffendingMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ok = await deleteMessage(messageId);
    return { success: ok };
  } catch (err: any) {
    Alert.alert('Sync Error: deleteOffendingMessage', err?.message || 'Failed to delete message.');
    return { success: false, error: err?.message || 'Failed to delete message.' };
  }
}
