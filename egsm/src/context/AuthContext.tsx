// src/context/AuthContext.tsx
// Manages the logged-in Profile, realtime account-status monitoring, and
// a fully functional local-mode fallback store so every feature works
// even before .env is populated.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { Profile, PasswordResetRequest } from '../types/database';

// ─── Local fallback store ─────────────────────────────────────────────────────
// Mirrors the real DB structure in memory so every feature is testable offline.

let _localProfiles: Profile[] = [
  {
    id: 'local-admin-000',
    username: 'admin',
    password_hash: 'admin123',
    display_name: 'Administrator',
    role: 'admin',
    status: 'active',
    suspended_until: null,
    muted_until: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-member-001',
    username: 'member1',
    password_hash: 'member123',
    display_name: 'Test Member',
    role: 'member',
    status: 'active',
    suspended_until: null,
    muted_until: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-member-002',
    username: 'suspended_user',
    password_hash: 'suspend123',
    display_name: 'Suspended Member',
    role: 'member',
    status: 'suspended',
    // Suspended until 2 days 4 hours from now
    suspended_until: new Date(Date.now() + 52 * 3600 * 1000).toISOString(),
    muted_until: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'local-member-003',
    username: 'terminated_user',
    password_hash: 'term123',
    display_name: 'Terminated Member',
    role: 'member',
    status: 'terminated',
    suspended_until: null,
    muted_until: null,
    created_at: new Date().toISOString(),
  },
];

let _localPasswordResetRequests: PasswordResetRequest[] = [
  {
    id: 'req-reset-001',
    username: 'member1',
    request_note: 'Lost access to device authenticator; requesting temporary credential reset.',
    status: 'pending',
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
];

/** Exported so other services (Admin panel) can interact with the local store. */
export const localStore = {
  getProfiles: (): Profile[] => _localProfiles,
  addProfile: (p: Profile): void => {
    _localProfiles = [..._localProfiles, p];
  },
  updateProfile: (id: string, patch: Partial<Profile>): void => {
    _localProfiles = _localProfiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
  },
  findByUsername: (username: string): Profile | undefined =>
    _localProfiles.find((p) => p.username.toLowerCase() === username.toLowerCase()),
  getPasswordResetRequests: (): PasswordResetRequest[] => _localPasswordResetRequests,
  addPasswordResetRequest: (req: PasswordResetRequest): void => {
    _localPasswordResetRequests = [req, ..._localPasswordResetRequests];
  },
  updatePasswordResetRequest: (id: string, patch: Partial<PasswordResetRequest>): void => {
    _localPasswordResetRequests = _localPasswordResetRequests.map((r) =>
      r.id === id ? { ...r, ...patch } : r
    );
  },
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function loginWithSupabase(
  username: string,
  password: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .eq('password_hash', password)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

function loginWithLocalStore(username: string, password: string): Profile | null {
  const profile = localStore.findByUsername(username);
  if (!profile || profile.password_hash !== password) return null;
  return profile;
}

// ─── Account-status check ─────────────────────────────────────────────────────

export type AccountBlockReason = 'suspended' | 'terminated' | null;

export function getBlockReason(profile: Profile): AccountBlockReason {
  if (profile.status === 'terminated') return 'terminated';
  if (profile.status === 'suspended') {
    if (!profile.suspended_until) return 'suspended'; // indefinite
    if (new Date(profile.suspended_until) > new Date()) return 'suspended';
  }
  return null;
}

// ─── Login Result ─────────────────────────────────────────────────────────────

export interface LoginResult {
  success: boolean;
  error?: string;
  blockedStatus?: 'terminated' | 'suspended';
  suspendedUntil?: string | null;
  profile?: Profile;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: Profile | null;
  isLoading: boolean;
  blockReason: AccountBlockReason;
  /** Attempt login; returns a LoginResult. */
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  /** Refresh the current user's profile from DB / local store. */
  refreshUser: () => Promise<void>;
  /** Update display name in Supabase or localStore and React state. */
  updateDisplayName: (newName: string) => Promise<{ success: boolean; error?: string }>;
  /** Verify current password and update to new password. */
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  /** Submit password reset request to password_reset_requests. */
  submitPasswordReset: (username: string, note?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: false,
  blockReason: null,
  login: async () => ({ success: false, error: 'Not initialized' }),
  logout: () => {},
  refreshUser: async () => {},
  updateDisplayName: async () => ({ success: false, error: 'Not initialized' }),
  updatePassword: async () => ({ success: false, error: 'Not initialized' }),
  submitPasswordReset: async () => ({ success: false, error: 'Not initialized' }),
});

export const useAuth = (): AuthContextValue => useContext(AuthContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [blockReason, setBlockReason] = useState<AccountBlockReason>(null);

  // Refs used inside realtime callbacks to avoid stale closures.
  const userRef = useRef<Profile | null>(null);
  userRef.current = user;

  // ── Refresh helper ─────────────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    const current = userRef.current;
    if (!current) return;

    let fresh: Profile | null = null;

    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', current.id)
        .single();
      fresh = data as Profile | null;
    } else {
      fresh = localStore.findByUsername(current.username) ?? null;
    }

    if (!fresh) {
      // Profile deleted — force logout.
      setUser(null);
      setBlockReason('terminated');
      return;
    }

    setUser(fresh);
    setBlockReason(getBlockReason(fresh));
  }, []);

  // ── Realtime subscription (live account-status changes) ───────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;

    const channel = supabase
      .channel(`profile-status-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Profile;
          setUser(updated);
          const reason = getBlockReason(updated);
          setBlockReason(reason);
        },
      )
      .subscribe();

    // Polling fallback (every 30 s) in case Realtime is not enabled on this plan.
    const pollInterval = setInterval(refreshUser, 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [user?.id, refreshUser]);

  // ── Local-mode polling ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isSupabaseConfigured || !user) return;

    const pollInterval = setInterval(() => {
      const fresh = localStore.findByUsername(user.username);
      if (!fresh) return;
      setUser(fresh);
      setBlockReason(getBlockReason(fresh));
    }, 5_000);

    return () => clearInterval(pollInterval);
  }, [user?.username]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const cleanUsername = username.trim();
      if (!cleanUsername) return { success: false, error: 'Username is required.' };
      if (!password) return { success: false, error: 'Password is required.' };

      setIsLoading(true);
      try {
        let profile: Profile | null;

        if (isSupabaseConfigured) {
          profile = await loginWithSupabase(cleanUsername, password);
        } else {
          profile = loginWithLocalStore(cleanUsername, password);
        }

        if (!profile) {
          return { success: false, error: 'Incorrect username or password.' };
        }

        const reason = getBlockReason(profile);
        if (reason === 'terminated') {
          return {
            success: false,
            error: 'Account Permanently Terminated by Administration.',
            blockedStatus: 'terminated',
            profile,
          };
        }
        if (reason === 'suspended') {
          return {
            success: false,
            error: 'Account Temporarily Suspended by Administration.',
            blockedStatus: 'suspended',
            suspendedUntil: profile.suspended_until,
            profile,
          };
        }

        setUser(profile);
        setBlockReason(null);
        return { success: true, profile };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setBlockReason(null);
  }, []);

  // ── Update Display Name ────────────────────────────────────────────────────
  const updateDisplayName = useCallback(
    async (newName: string): Promise<{ success: boolean; error?: string }> => {
      const trimmed = newName.trim();
      if (!trimmed) {
        return { success: false, error: 'Display name cannot be empty.' };
      }
      if (!user) {
        return { success: false, error: 'No active session.' };
      }

      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .update({ display_name: trimmed })
            .eq('id', user.id)
            .select()
            .single();

          if (error) {
            return { success: false, error: error.message };
          }
          if (data) {
            setUser(data as Profile);
          } else {
            setUser((prev) => (prev ? { ...prev, display_name: trimmed } : null));
          }
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to update display name.' };
        }
      } else {
        localStore.updateProfile(user.id, { display_name: trimmed });
        setUser((prev) => (prev ? { ...prev, display_name: trimmed } : null));
        return { success: true };
      }
    },
    [user],
  );

  // ── Update Password ────────────────────────────────────────────────────────
  const updatePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
    ): Promise<{ success: boolean; error?: string }> => {
      if (!user) {
        return { success: false, error: 'No active session.' };
      }
      if (!currentPassword) {
        return { success: false, error: 'Please enter your current password.' };
      }
      if (!newPassword || newPassword.length < 4) {
        return { success: false, error: 'New password must be at least 4 characters.' };
      }

      // Verify current password against active profile password_hash
      if (user.password_hash !== currentPassword) {
        return { success: false, error: 'Current password does not match our records.' };
      }

      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ password_hash: newPassword })
            .eq('id', user.id);

          if (error) {
            return { success: false, error: error.message };
          }
          setUser((prev) => (prev ? { ...prev, password_hash: newPassword } : null));
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to update password.' };
        }
      } else {
        localStore.updateProfile(user.id, { password_hash: newPassword });
        setUser((prev) => (prev ? { ...prev, password_hash: newPassword } : null));
        return { success: true };
      }
    },
    [user],
  );

  // ── Submit Password Reset Request ──────────────────────────────────────────
  const submitPasswordReset = useCallback(
    async (
      username: string,
      note?: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const cleanUsername = username.trim();
      if (!cleanUsername) {
        return { success: false, error: 'Please enter your username.' };
      }

      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase.from('password_reset_requests').insert({
            username: cleanUsername,
            request_note: note?.trim() || null,
            status: 'pending',
          });
          if (error) {
            return { success: false, error: error.message };
          }
          return { success: true };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || 'Failed to submit password reset request.',
          };
        }
      } else {
        localStore.addPasswordResetRequest({
          id: `local-reset-${Date.now()}`,
          username: cleanUsername,
          request_note: note?.trim() || null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        return { success: true };
      }
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        blockReason,
        login,
        logout,
        refreshUser,
        updateDisplayName,
        updatePassword,
        submitPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
