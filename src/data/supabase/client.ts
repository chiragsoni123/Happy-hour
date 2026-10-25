import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/**
 * The publishable key is designed to ship inside the app; every rule that matters is
 * enforced by RLS in the database, not by hiding this string. The service-role key must
 * never appear anywhere in this project.
 *
 * Both values live in `.env`, so pointing the app at a different Supabase project is a
 * one-file change.
 */
interface SupabaseConfig {
  url: string;
  key: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  // Metro inlines `EXPO_PUBLIC_*` at build time on every platform. Blanking these — or
  // adding a `.env.local` that does — drops the app back to the on-device backend, which
  // is how the screens get exercised without touching the venue's real data.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
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
      // PKCE puts the recovery grant in a ?code= query parameter, which expo-router hands
      // to the reset screen as a route param. The implicit flow would use a #fragment,
      // which never reaches the app.
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-client-info': 'happy-hour' },
    },
  });
  return client;
}
