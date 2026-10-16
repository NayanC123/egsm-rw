// src/services/supabase.ts
// Safe Supabase client initialisation — NEVER crashes at boot if .env is missing.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Read env variables ───────────────────────────────────────────────────────
// Expo exposes EXPO_PUBLIC_* vars on process.env at both build and runtime.
const rawUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
const rawKey = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

// A valid URL must start with https:// and contain a real host.
const isValidUrl = (s: string): boolean => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.length > 0 && !u.hostname.includes('placeholder');
  } catch {
    return false;
  }
};

const isValidKey = (s: string): boolean => s.length > 20;

/**
 * True when both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
 * are present and appear to be real (non-placeholder) values.
 * Screens that depend on live data check this flag and show a local-mode banner instead of crashing.
 */
export const isSupabaseConfigured: boolean = isValidUrl(rawUrl) && isValidKey(rawKey);

// Fall back to a syntactically valid but non-functional URL so createClient()
// never throws during app startup when the .env hasn't been populated yet.
const supabaseUrl = isSupabaseConfigured ? rawUrl : 'https://sonjftotjytdglgvvndj.supabase.co';
const supabaseAnonKey = isSupabaseConfigured ? rawKey : 'sb_publishable_8oNr8W1bF701ZXPZXdwtSA_XZ6-Tsho';

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
