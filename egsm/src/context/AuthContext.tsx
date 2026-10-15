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
import { Alert } from 'react-native';
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
  currentUser: Profile | null;
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
  currentUser: null,
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
      // 1. Sanitize inputs
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      if (!cleanUser) {
        Alert.alert('Validation Error', 'Please enter your username.');
        return { success: false, error: 'Username is required.' };
      }
      if (!cleanPass) {
        Alert.alert('Validation Error', 'Please enter your password.');
        return { success: false, error: 'Password is required.' };
      }

      setIsLoading(true);
      try {
        // Query public.profiles directly
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', cleanUser);

        // Log everything
        console.log('[Auth Debug] Query result:', { data, error });

        // a) Network / Database Connection Error
        if (error) {
          Alert.alert('Database Error', error.message + ' (Code: ' + error.code + ')');
          return { success: false, error: `${error.message} (Code: ${error.code})` };
        }

        // b) User Not Found
        if (!data || data.length === 0) {
          Alert.alert('User Not Found', 'No profile found in database with username: ' + cleanUser);
          return { success: false, error: 'No profile found in database with username: ' + cleanUser };
        }

        // c) Password Check (Handles both plain text and hash)
        const profile = data[0] as Profile;
        const isPasswordMatch =
          profile.password_hash === cleanPass ||
          (typeof btoa !== 'undefined' && profile.password_hash === btoa(cleanPass));

        if (!isPasswordMatch) {
          Alert.alert(
            'Password Mismatch',
            'The password entered does not match the record for @' + cleanUser,
          );
          return {
            success: false,
            error: 'The password entered does not match the record for @' + cleanUser,
          };
        }

        // d) Account Status Check
        if (profile.status === 'terminated') {
          Alert.alert(
            'Account Terminated',
            'This user account has been permanently terminated by Administration.',
          );
          return {
            success: false,
            error: 'Account Permanently Terminated by Administration.',
            blockedStatus: 'terminated',
            profile,
          };
        }

        if (profile.status === 'suspended') {
          const isSuspended =
            !profile.suspended_until || new Date(profile.suspended_until) > new Date();
          if (isSuspended) {
            const timeMsg = profile.suspended_until
              ? 'This account is temporarily suspended until: ' +
                new Date(profile.suspended_until).toLocaleString()
              : 'This account is temporarily suspended by Administration.';
            Alert.alert('Account Suspended', timeMsg);
            return {
              success: false,
              error: 'Account Temporarily Suspended by Administration.',
              blockedStatus: 'suspended',
              suspendedUntil: profile.suspended_until,
              profile,
            };
          }
        }

        // If active, set currentUser = profile and successfully log in
        setUser(profile);
        setBlockReason(null);
        return { success: true, profile };
      } catch (err: any) {
        console.error('[Auth Debug] Unexpected login exception:', err);
        Alert.alert(
          'Database Error',
          (err?.message || String(err)) + ' (Code: UNEXPECTED_EXCEPTION)',
        );
        return { success: false, error: String(err?.message || err) };
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
        currentUser: user,
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
