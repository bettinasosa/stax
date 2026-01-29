import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const enabled = Boolean(url && anonKey);

export const supabase = enabled
  ? createClient(url, anonKey, { auth: { persistSession: true } })
  : null;

export function isSupabaseConfigured(): boolean {
  return enabled;
}
