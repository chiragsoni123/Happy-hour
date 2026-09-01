import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

/**
 * The publishable key is designed to ship inside the app; every rule that matters is
 * enforced by RLS in the database, not by hiding this string. The service-role key must
 * never appear anywhere in this project.
 *
 * Both values live in `app.json` under `expo.extra`, so pointing the app at a different
 * Supabase project is a one-file change.
 */
interface SupabaseConfig {
  url: string;
  key: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  // `EXPO_PUBLIC_*` is inlined by Metro at build time on every platform, which is why it
  // is read first; `expo.extra` is kept as a fallback for builds that set it there.
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    (typeof extra?.supabaseUrl === 'string' ? extra.supabaseUrl : '');
  const key =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    (typeof extra?.supabasePublishableKey === 'string' ? extra.supabasePublishableKey : '');
  if (!url || !key) return null;
  return { url, key };
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const config = supabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured. Set expo.extra.supabaseUrl in app.json.');
  }
  client = createClient(config.url, config.key, {
    auth: {
      storage: AsyncStorage,
      // The session is persisted and refreshed so a staff member is not thrown back to
      // the sign-in screen every time the phone sleeps mid-shift.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-client-info': 'happy-hour' },
    },
  });
  return client;
}
