import type { Backend } from './backend';
import { LocalBackend } from './local/LocalBackend';
import { supabaseConfig } from './supabase/client';
import { SupabaseBackend } from './supabase/SupabaseBackend';

/**
 * The app talks to exactly one `Backend`.
 *
 * When `expo.extra.supabaseUrl` is set in `app.json` the venue's shared Postgres is the
 * source of truth, so every phone on the counter sees the same tables and the role rules
 * are enforced by the database. Clear that config and the app falls back to the on-device
 * store, which is also what the tests run against.
 */
let instance: Backend | null = null;

export function getBackend(): Backend {
  if (!instance) {
    instance = supabaseConfig() ? new SupabaseBackend() : new LocalBackend();
  }
  return instance;
}

export function backendKind(): Backend['kind'] {
  return getBackend().kind;
}

export type { Backend };
export * from './errors';
