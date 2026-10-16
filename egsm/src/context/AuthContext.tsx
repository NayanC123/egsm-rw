// src/context/AuthContext.tsx
// Manages the logged-in Profile and realtime account-status monitoring directly with Supabase.
// Zero local fallback arrays. Direct database-first authentication.

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
import type { Profile } from '../types/database';

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
  /** Refresh the current user's profile directly from DB. */
  refreshUser: () => Promise<void>;
  /** Update display name in Supabase and React state. */
  updateDisplayName: (newName: string) => Promise<{ success: boolean; error?: string }>;
  /** Verify current password and update to new password. */
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  /** Submit password reset request to password_reset_requests in Supabase. */
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
    if (!current?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', current.id)
        .single();

      if (error || !data) {
        console.warn('[AuthContext] refreshUser failed:', error);
        return;
      }

      const fresh = data as Profile;
      setUser(fresh);
      setBlockReason(getBlockReason(fresh));
    } catch (err) {
      console.warn('[AuthContext] refreshUser exception:', err);
    }
  }, []);

  // ── Realtime subscription (live account-status changes) ───────────────────
  useEffect(() => {
    if (!user?.id) return;

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

    const pollInterval = setInterval(refreshUser, 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [user?.id, refreshUser]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
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
        // Query public.profiles directly by username
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', cleanUser)
          .single();

        if (error) {
          Alert.alert('Database Error', `${error.message} (Code: ${error.code})`);
          return { success: false, error: `${error.message} (Code: ${error.code})` };
        }

        if (!data) {
          Alert.alert('User Not Found', `No profile found in database with username: @${cleanUser}`);
          return { success: false, error: `No profile found with username: @${cleanUser}` };
        }

        const profile = data as Profile;

        // Verify valid UUID from Supabase
        if (!profile.id || profile.id.length < 20) {
          Alert.alert('Authentication Error', 'Profile does not possess a valid database UUID.');
          return { success: false, error: 'Profile does not possess a valid database UUID.' };
        }

        // Password Check (Handles both plain text and hash)
        const isPasswordMatch =
          profile.password_hash === cleanPass ||
          (typeof btoa !== 'undefined' && profile.password_hash === btoa(cleanPass));

        if (!isPasswordMatch) {
          Alert.alert(
            'Password Mismatch',
            `The password entered does not match the record for @${cleanUser}`,
          );
          return {
            success: false,
            error: `The password entered does not match the record for @${cleanUser}`,
          };
        }

        // Account Status Check
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

        // Only store real Supabase profile with valid UUID in React state
        setUser(profile);
        setBlockReason(null);
        return { success: true, profile };
      } catch (err: any) {
        console.error('[AuthContext] Unexpected login exception:', err);
        Alert.alert(
          'Sync Error',
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
      if (!user?.id) {
        return { success: false, error: 'No active session.' };
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .update({ display_name: trimmed })
          .eq('id', user.id)
          .select()
          .single();

        if (error) {
          Alert.alert('Sync Error', `${error.message} (${error.code})`);
          return { success: false, error: error.message };
        }
        if (data) {
          setUser(data as Profile);
        } else {
          setUser((prev) => (prev ? { ...prev, display_name: trimmed } : null));
        }
        return { success: true };
      } catch (err: any) {
        Alert.alert('Sync Error', err?.message || 'Failed to update display name.');
        return { success: false, error: err?.message || 'Failed to update display name.' };
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
      if (!user?.id) {
        return { success: false, error: 'No active session.' };
      }
      if (!currentPassword) {
        return { success: false, error: 'Please enter your current password.' };
      }
      if (!newPassword || newPassword.length < 4) {
        return { success: false, error: 'New password must be at least 4 characters.' };
      }

      if (
        user.password_hash !== currentPassword &&
        (typeof btoa === 'undefined' || user.password_hash !== btoa(currentPassword))
      ) {
        return { success: false, error: 'Current password does not match our records.' };
      }

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ password_hash: newPassword })
          .eq('id', user.id);

        if (error) {
          Alert.alert('Sync Error', `${error.message} (${error.code})`);
          return { success: false, error: error.message };
        }
        setUser((prev) => (prev ? { ...prev, password_hash: newPassword } : null));
        return { success: true };
      } catch (err: any) {
        Alert.alert('Sync Error', err?.message || 'Failed to update password.');
        return { success: false, error: err?.message || 'Failed to update password.' };
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
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        return { success: false, error: 'Please enter your username.' };
      }

      try {
        const { error } = await supabase.from('password_reset_requests').insert({
          username: cleanUsername,
          request_note: note?.trim() || null,
          status: 'pending',
        });
        if (error) {
          Alert.alert('Sync Error', `${error.message} (${error.code})`);
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (err: any) {
        Alert.alert('Sync Error', err?.message || 'Failed to submit password reset request.');
        return {
          success: false,
          error: err?.message || 'Failed to submit password reset request.',
        };
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

export default AuthContext;
