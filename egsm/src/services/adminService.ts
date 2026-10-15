// src/services/adminService.ts
// Central administration service handling Account Creation & Directory Moderation,
// Password Reset Requests Queue, Announcements Management, and Reported Offenses Queue.
// Full dual-mode support: Supabase live database + in-memory store fallback.

import { supabase, isSupabaseConfigured } from './supabase';
import { localStore } from '../context/AuthContext';
import { fetchPosts, toggleAnnouncement, DetailedPost } from './postsService';
import {
  deleteMessage,
  getLocalOffenseReports,
  updateLocalOffenseReportStatus,
  getLocalMessages,
} from './chatService';
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
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) return data as Profile[];
    } catch (err) {
      console.warn('[adminService] fetchAccounts supabase error, falling back to localStore:', err);
    }
  }

  return [...localStore.getProfiles()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
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

  // Check if username already exists in localStore or Supabase
  const existingLocal = localStore.findByUsername(cleanUsername);
  if (existingLocal) {
    return { success: false, error: `Username @${cleanUsername} is already registered.` };
  }

  if (isSupabaseConfigured) {
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
          suspended_until: null,
          muted_until: null,
        })
        .select()
        .single();

      if (error) throw error;
      const created = data as Profile;
      localStore.addProfile(created);
      return { success: true, profile: created };
    } catch (err: any) {
      console.warn('[adminService] createAccount Supabase error:', err);
      return { success: false, error: err?.message || 'Failed to create account in database.' };
    }
  }

  // Offline local store creation
  const newProfile: Profile = {
    id: `local-user-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    username: cleanUsername,
    password_hash: password,
    display_name: cleanDisplayName,
    role,
    status: 'active',
    suspended_until: null,
    muted_until: null,
    created_at: new Date().toISOString(),
  };

  localStore.addProfile(newProfile);
  return { success: true, profile: newProfile };
}

export async function muteUser(
  userId: string,
  durationMinutes: number | null
): Promise<{ success: boolean; error?: string }> {
  const mutedUntil =
    durationMinutes !== null
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : null;

  localStore.updateProfile(userId, { muted_until: mutedUntil });

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ muted_until: mutedUntil })
        .eq('id', userId);

      if (error) throw error;
    } catch (err: any) {
      console.warn('[adminService] muteUser error:', err);
      return { success: false, error: err?.message || 'Failed to update mute status.' };
    }
  }

  return { success: true };
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

  localStore.updateProfile(userId, {
    status,
    suspended_until: suspendedUntil,
  });

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          status,
          suspended_until: suspendedUntil,
        })
        .eq('id', userId);

      if (error) throw error;
    } catch (err: any) {
      console.warn('[adminService] suspendUser error:', err);
      return { success: false, error: err?.message || 'Failed to update suspension status.' };
    }
  }

  return { success: true };
}

export async function terminateUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  localStore.updateProfile(userId, {
    status: 'terminated',
    suspended_until: null,
  });

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          status: 'terminated',
          suspended_until: null,
        })
        .eq('id', userId);

      if (error) throw error;
    } catch (err: any) {
      console.warn('[adminService] terminateUser error:', err);
      return { success: false, error: err?.message || 'Failed to terminate user.' };
    }
  }

  return { success: true };
}

export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters long.' };
  }

  localStore.updateProfile(userId, { password_hash: newPassword });

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ password_hash: newPassword })
        .eq('id', userId);

      if (error) throw error;
    } catch (err: any) {
      console.warn('[adminService] resetUserPassword error:', err);
      return { success: false, error: err?.message || 'Failed to reset user password.' };
    }
  }

  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Sub-Tab B: Password Reset Requests Queue
// ─────────────────────────────────────────────────────────────

export async function fetchPasswordResetRequests(): Promise<PasswordResetRequest[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('password_reset_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) return data as PasswordResetRequest[];
    } catch (err) {
      console.warn('[adminService] fetchPasswordResetRequests error:', err);
    }
  }

  return [...localStore.getPasswordResetRequests()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function resolvePasswordResetRequest(
  requestId: string,
  username: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 4) {
    return { success: false, error: 'New password must be at least 4 characters long.' };
  }

  // Find user and update password
  const cleanUsername = username.trim().toLowerCase();
  const localTarget = localStore.findByUsername(cleanUsername);
  if (localTarget) {
    localStore.updateProfile(localTarget.id, { password_hash: newPassword });
  }
  localStore.updatePasswordResetRequest(requestId, { status: 'resolved' });

  if (isSupabaseConfigured) {
    try {
      // 1. Update password in profiles
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ password_hash: newPassword })
        .eq('username', cleanUsername);

      if (profileErr) throw profileErr;

      // 2. Mark request resolved
      const { error: reqErr } = await supabase
        .from('password_reset_requests')
        .update({ status: 'resolved' })
        .eq('id', requestId);

      if (reqErr) throw reqErr;
    } catch (err: any) {
      console.warn('[adminService] resolvePasswordResetRequest error:', err);
      return { success: false, error: err?.message || 'Failed to resolve request in database.' };
    }
  }

  return { success: true };
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
  let rawReports: OffenseReport[] = [];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('offense_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) rawReports = data as OffenseReport[];
    } catch (err) {
      console.warn('[adminService] fetchOffenseReports error, using local:', err);
      rawReports = getLocalOffenseReports();
    }
  } else {
    rawReports = getLocalOffenseReports();
  }

  // Resolve profiles and message content
  const allProfiles = await fetchAccounts();
  const profileMap = new Map<string, Profile>();
  allProfiles.forEach((p) => profileMap.set(p.id, p));

  const localMessages = getLocalMessages();
  const messageMap = new Map<string, any>();
  localMessages.forEach((m) => messageMap.set(m.id, m));

  const detailed: DetailedOffenseReport[] = rawReports.map((rep) => {
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

  return detailed.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function resolveOffenseReport(
  reportId: string,
  newStatus: 'resolved' | 'dismissed'
): Promise<{ success: boolean; error?: string }> {
  updateLocalOffenseReportStatus(reportId, newStatus);

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('offense_reports')
        .update({ status: newStatus })
        .eq('id', reportId);

      if (error) throw error;
    } catch (err: any) {
      console.warn('[adminService] resolveOffenseReport error:', err);
      return { success: false, error: err?.message || 'Failed to update report status.' };
    }
  }

  return { success: true };
}

export async function deleteOffendingMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ok = await deleteMessage(messageId);
    return { success: ok };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete message.' };
  }
}
