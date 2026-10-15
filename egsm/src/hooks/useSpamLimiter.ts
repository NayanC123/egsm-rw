// src/hooks/useSpamLimiter.ts
// Sliding-Window Spam Limitation Engine
// Config (mirrors the exact JSON specification):
//   burst_window_seconds: 5
//   sustained_window_seconds: 60
//   warning:             burst 5,  sustained 12, lockout 3 s
//   soft_mute:           burst 8,  sustained 18, mute duration 30 s
//   hard_mute:           burst 12, sustained 25, mute duration 300 s
//   duplicate_detection: window 10 s, max 2 identical allowed
//   media_limits:        window 60 s, max 4 gifs allowed, cooldown 45 s

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { localStore } from '../context/AuthContext';
import type { Profile } from '../types/database';

// ─── Exact Spec Constants ─────────────────────────────────────────────────────

const BURST_WINDOW_MS     = 5 * 1000;
const SUSTAINED_WINDOW_MS = 60 * 1000;

const WARNING_BURST      = 5;
const WARNING_SUSTAINED  = 12;
const WARNING_LOCKOUT_MS = 3 * 1000;

const SOFT_BURST     = 8;
const SOFT_SUSTAINED = 18;
const SOFT_MUTE_MS   = 30 * 1000;

const HARD_BURST     = 12;
const HARD_SUSTAINED = 25;
const HARD_MUTE_MS   = 300 * 1000;

const DUP_WINDOW_MS = 10 * 1000;
const DUP_MAX       = 2;

const MEDIA_WINDOW_MS   = 60 * 1000;
const MEDIA_MAX_GIFS    = 4;
const MEDIA_COOLDOWN_MS = 45 * 1000;

// ─── Public Types ─────────────────────────────────────────────────────────────

export type MuteLevel = 'none' | 'warning' | 'soft' | 'hard' | 'admin';

export interface SpamLimiterHook {
  muteLevel: MuteLevel;
  remainingSeconds: number;
  sendLocked: boolean;
  isInputLocked: boolean;
  mediaLocked: boolean;
  mediaRemainingSeconds: number;
  toastMessage: string | null;
  /**
   * Call BEFORE sending. Returns true → allow, false → blocked.
   * Pass isMedia=true for GIF / photo / video / doc sends.
   */
  checkMessage: (text: string, isMedia?: boolean) => boolean;
  /** Call AFTER a media message is successfully sent. */
  recordMediaSend: () => void;
  clearToast: () => void;
}

// ─── Helper: Prune Timestamps Beyond Window ───────────────────────────────────

function prune(arr: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return arr.filter((t) => t >= cutoff);
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useSpamLimiter(currentUser: Profile | null): SpamLimiterHook {
  // Sliding-window arrays stored in refs to avoid extraneous re-renders
  const msgTs    = useRef<number[]>([]); // all message timestamps
  const dupTs    = useRef<number[]>([]); // duplicate detection timestamps
  const dupTexts = useRef<string[]>([]); // duplicate detection normalized texts
  const mediaTs  = useRef<number[]>([]); // GIF/media timestamps

  // UI State
  const [muteLevel, setMuteLevel] = useState<MuteLevel>('none');
  const [muteExpiresAt, setMuteExpiresAt] = useState<number>(0);
  const [sendLockedUntil, setSendLockedUntil] = useState<number>(0);
  const [mediaLockedUntil, setMediaLockedUntil] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [mediaRemaining, setMediaRemaining] = useState<number>(0);
  const [sendLocked, setSendLocked] = useState<boolean>(false);
  const [mediaLocked, setMediaLocked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Latest-value refs for interval tickers to prevent stale closures
  const muteExpiresAtRef    = useRef<number>(0);
  const sendLockedUntilRef  = useRef<number>(0);
  const mediaLockedUntilRef = useRef<number>(0);
  const muteLevelRef        = useRef<MuteLevel>('none');

  muteExpiresAtRef.current    = muteExpiresAt;
  sendLockedUntilRef.current  = sendLockedUntil;
  mediaLockedUntilRef.current = mediaLockedUntil;
  muteLevelRef.current        = muteLevel;

  // ── Admin Mute Check: sync with currentUser.muted_until ────────────────────
  useEffect(() => {
    if (!currentUser?.muted_until) {
      if (muteLevelRef.current === 'admin') {
        setMuteLevel('none');
        setMuteExpiresAt(0);
        setRemainingSeconds(0);
      }
      return;
    }
    const exp = new Date(currentUser.muted_until).getTime();
    if (exp > Date.now()) {
      // Don't overwrite active client hard mute label if already hard
      if (muteLevelRef.current !== 'hard') {
        setMuteLevel('admin');
      }
      setMuteExpiresAt(exp);
      setRemainingSeconds(Math.ceil((exp - Date.now()) / 1000));
    } else if (muteLevelRef.current === 'admin') {
      setMuteLevel('none');
      setMuteExpiresAt(0);
      setRemainingSeconds(0);
    }
  }, [currentUser?.muted_until]);

  // ── Live 1-Second Countdown Ticker ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();

      // Main mute countdown (warning, soft, hard, admin)
      const me = muteExpiresAtRef.current;
      if (me > 0) {
        const rem = Math.max(0, Math.ceil((me - now) / 1000));
        setRemainingSeconds(rem);
        if (rem === 0) {
          setMuteLevel('none');
          setMuteExpiresAt(0);
        }
      }

      // Send-lock (warning lockout 3s)
      if (sendLockedUntilRef.current > 0) {
        if (now >= sendLockedUntilRef.current) {
          setSendLocked(false);
          setSendLockedUntil(0);
        }
      }

      // Media lock countdown (45s cooldown)
      const ml = mediaLockedUntilRef.current;
      if (ml > 0) {
        const rem = Math.max(0, Math.ceil((ml - now) / 1000));
        setMediaRemaining(rem);
        if (rem === 0) {
          setMediaLocked(false);
          setMediaLockedUntil(0);
        }
      }
    }, 1000);

    return () => clearInterval(id);
  }, []);

  // ── Persist Hard Mute to Supabase / LocalStore ─────────────────────────────
  const persistHardMute = useCallback(
    async (mutedUntilIso: string) => {
      if (!currentUser) return;
      if (isSupabaseConfigured) {
        await supabase
          .from('profiles')
          .update({ muted_until: mutedUntilIso })
          .eq('id', currentUser.id);
      } else {
        localStore.updateProfile(currentUser.id, { muted_until: mutedUntilIso });
      }
    },
    [currentUser]
  );

  // ── Apply Tiers ───────────────────────────────────────────────────────────
  const applyHardMute = useCallback(async () => {
    const exp = Date.now() + HARD_MUTE_MS;
    setMuteLevel('hard');
    setMuteExpiresAt(exp);
    setRemainingSeconds(Math.ceil(HARD_MUTE_MS / 1000));
    await persistHardMute(new Date(exp).toISOString());
  }, [persistHardMute]);

  const applySoftMute = useCallback(() => {
    const exp = Date.now() + SOFT_MUTE_MS;
    setMuteLevel('soft');
    setMuteExpiresAt(exp);
    setRemainingSeconds(Math.ceil(SOFT_MUTE_MS / 1000));
  }, []);

  const applyWarning = useCallback(() => {
    const exp = Date.now() + WARNING_LOCKOUT_MS;
    if (muteLevelRef.current === 'none') {
      setMuteLevel('warning');
      setMuteExpiresAt(exp);
      setRemainingSeconds(Math.ceil(WARNING_LOCKOUT_MS / 1000));
    }
    setSendLocked(true);
    setSendLockedUntil(exp);
  }, []);

  // ── Enforcement Logic in checkMessage ──────────────────────────────────────
  const checkMessage = useCallback(
    (text: string, isMedia: boolean = false): boolean => {
      const now = Date.now();

      // 1. Admin mute check (highest priority)
      if (muteLevelRef.current === 'admin') {
        return false;
      }

      // 2. Active hard or soft mute check
      const lvl = muteLevelRef.current;
      const me  = muteExpiresAtRef.current;
      if ((lvl === 'hard' || lvl === 'soft') && me > now) {
        return false;
      }

      // Check send lock (e.g. Warning lockout 3s)
      if (sendLockedUntilRef.current > now || sendLocked) {
        return false;
      }

      // 3. Media lock check
      if (isMedia && (mediaLockedUntilRef.current > now || mediaLocked)) {
        const secs = Math.max(1, Math.ceil((mediaLockedUntilRef.current - now) / 1000));
        setToastMessage(`Media locked — ${secs}s cooldown active.`);
        return false;
      }

      // 4. Duplicate Check (text messages only)
      // Block if identical text sent > 2 times within 10 seconds
      if (!isMedia && text.trim().length > 0) {
        const norm = text.trim().toLowerCase();
        dupTs.current = prune(dupTs.current, DUP_WINDOW_MS);
        dupTexts.current = dupTexts.current.slice(
          dupTexts.current.length - dupTs.current.length
        );

        const count = dupTexts.current.filter((t) => t === norm).length;
        if (count >= DUP_MAX) {
          setToastMessage('Duplicate message blocked (max 2 identical in 10s).');
          return false;
        }

        dupTs.current = [...dupTs.current, now];
        dupTexts.current = [...dupTexts.current, norm];
      }

      // 5. Update main sliding window arrays
      msgTs.current = [...prune(msgTs.current, SUSTAINED_WINDOW_MS), now];
      const burst = msgTs.current.filter((t) => t >= now - BURST_WINDOW_MS).length;
      const sustained = msgTs.current.length;

      // 6. Hard Mute: 12 in 5s or 25 in 60s
      if (burst >= HARD_BURST || sustained >= HARD_SUSTAINED) {
        void applyHardMute();
        return false;
      }

      // 7. Soft Mute: 8 in 5s or 18 in 60s
      if (burst >= SOFT_BURST || sustained >= SOFT_SUSTAINED) {
        applySoftMute();
        return false;
      }

      // 8. Warning: 5 in 5s or 12 in 60s (locks Send for 3s, allows current message)
      if (burst >= WARNING_BURST || sustained >= WARNING_SUSTAINED) {
        applyWarning();
      }

      // 9. Media/GIF Cap: 4 in 60s triggers 45s cooldown
      if (isMedia) {
        mediaTs.current = [...prune(mediaTs.current, MEDIA_WINDOW_MS), now];
        if (mediaTs.current.length >= MEDIA_MAX_GIFS) {
          const lockUntil = now + MEDIA_COOLDOWN_MS;
          setMediaLocked(true);
          setMediaLockedUntil(lockUntil);
          setMediaRemaining(Math.ceil(MEDIA_COOLDOWN_MS / 1000));
        }
      }

      return true;
    },
    [applyHardMute, applySoftMute, applyWarning, mediaLocked]
  );

  // ── recordMediaSend: for tracking after confirmation ────────────────────────
  const recordMediaSend = useCallback(() => {
    const now = Date.now();
    mediaTs.current = [...prune(mediaTs.current, MEDIA_WINDOW_MS), now];
    if (mediaTs.current.length >= MEDIA_MAX_GIFS) {
      const lockUntil = now + MEDIA_COOLDOWN_MS;
      setMediaLocked(true);
      setMediaLockedUntil(lockUntil);
      setMediaRemaining(Math.ceil(MEDIA_COOLDOWN_MS / 1000));
    }
  }, []);

  const clearToast = useCallback(() => setToastMessage(null), []);

  const isInputLocked =
    muteLevel === 'soft' || muteLevel === 'hard' || muteLevel === 'admin';

  return {
    muteLevel,
    remainingSeconds,
    sendLocked,
    isInputLocked,
    mediaLocked,
    mediaRemainingSeconds: mediaRemaining,
    toastMessage,
    checkMessage,
    recordMediaSend,
    clearToast,
  };
}
