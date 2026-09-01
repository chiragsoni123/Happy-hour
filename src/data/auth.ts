import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppError } from './errors';
import { getBackend } from './index';
import { LocalBackend } from './local/LocalBackend';
import { getSupabase } from './supabase/client';

/**
 * Authentication is kept apart from the data interface because the two backends answer
 * a different question. On device, "who is this?" is a staff PIN. On Supabase it is a
 * real account, and `auth.uid()` is what every row is stamped with and every policy is
 * judged against — which is the only way the owner can truly answer "who took this
 * money?".
 */
export type AuthMode = 'pin' | 'password';

const LOCAL_SESSION_KEY = 'happyhour.session.v1';

export function authMode(): AuthMode {
  return getBackend().kind === 'supabase' ? 'password' : 'pin';
}

/** Returns the signed-in user id, or null. */
export async function restoreSession(): Promise<string | null> {
  if (authMode() === 'password') {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.user.id ?? null;
  }
  return AsyncStorage.getItem(LOCAL_SESSION_KEY);
}

export async function signInWithPin(profileId: string, pin: string): Promise<string> {
  const backend = getBackend();
  if (!(backend instanceof LocalBackend)) {
    throw new AppError('NOT_AUTHENTICATED', 'This build signs in with an email and password.');
  }
  await backend.signIn({ profileId, pin });
  await AsyncStorage.setItem(LOCAL_SESSION_KEY, profileId);
  return profileId;
}

export async function signInWithPassword(email: string, password: string): Promise<string> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) {
    throw new AppError('NOT_AUTHENTICATED', friendlyAuthError(error?.message));
  }
  return data.user.id;
}

/**
 * The first account to sign up becomes the OWNER — a database trigger decides that, not
 * the app, so it cannot be claimed by anyone arriving later. Everyone after is STAFF
 * until the owner promotes them.
 */
export async function signUp(
  email: string,
  password: string,
  fullName: string,
): Promise<{ userId: string | null; needsConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw new AppError('CONFLICT', friendlyAuthError(error.message));
  return { userId: data.user?.id ?? null, needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  if (authMode() === 'password') {
    await getSupabase().auth.signOut();
    return;
  }
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
}

function friendlyAuthError(message: string | undefined): string {
  const raw = (message ?? '').toLowerCase();
  if (raw.includes('invalid login')) return 'Wrong email or password.';
  if (raw.includes('email not confirmed')) return 'Confirm the email link before signing in.';
  if (raw.includes('already registered')) return 'That email already has an account.';
  if (raw.includes('password')) return 'Password must be at least 6 characters.';
  if (raw.includes('network')) return 'No connection. Check the wifi and try again.';
  return message || 'Could not sign in.';
}
