// src/services/supabase.ts
// Safe Supabase client initialisation — NEVER crashes at boot if .env is missing.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Read env variables ───────────────────────────────────────────────────────
// Expo exposes EXPO_PUBLIC_* vars on process.env at both build and runtime.
// Dot-syntax access is required for Metro/Babel static variable inlining.
const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env['EXPO_PUBLIC_SUPABASE_URL'] || '';
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] || '';

const FALLBACK_URL = 'https://sonjftotjytdglgvvndj.supabase.co';
const FALLBACK_KEY = 'sb_publishable_8oNr8W1bF701ZXPZXdwtSA_XZ6-Tsho';

// A valid URL must start with https:// and contain a real host.
const isValidUrl = (s: string): boolean => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.length > 0 && !u.hostname.includes('placeholder');
  } catch {
    return false;
  }
};

const isValidKey = (s: string): boolean => Boolean(s && s.length > 20);

// Use environment variables when valid, otherwise use the live project fallback credentials
const supabaseUrl = isValidUrl(rawUrl) ? rawUrl : FALLBACK_URL;
const supabaseAnonKey = isValidKey(rawKey) ? rawKey : FALLBACK_KEY;

/**
 * True when the effective Supabase credentials are valid and live.
 */
export const isSupabaseConfigured: boolean = isValidUrl(supabaseUrl) && isValidKey(supabaseAnonKey);

// ─── Supabase client (singleton) ─────────────────────────────────────────────
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // We manage authentication ourselves (username + password_hash comparison),
    // so we disable Supabase Auth's built-in session persistence.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
