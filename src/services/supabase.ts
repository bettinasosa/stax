import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const enabled = Boolean(url && anonKey);

export const supabase = enabled
  ? createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Whether the Supabase client is configured (for price cache, etc.). */
export function isSupabaseConfigured(): boolean {
  return enabled;
}

/**
 * Whether Supabase Auth is required (user accounts / login).
 * Currently false — Supabase is only used as a price cache backend.
 * Set EXPO_PUBLIC_SUPABASE_AUTH_ENABLED=1 in .env to opt-in to auth later.
 */
export function isSupabaseAuthEnabled(): boolean {
  return false;
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_AUTH_ENABLED?.trim());
}
