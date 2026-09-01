import { create } from 'zustand';

import { getBackend } from '@/data';
import * as auth from '@/data/auth';
import type { Backend } from '@/data/backend';
import { errorMessage } from '@/data/errors';
import type { Database, ID, Profile } from '@/domain/types';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface StoreState {
  ready: boolean;
  db: Database | null;
  actorId: ID | null;
  /** True while an operation is in flight — every commit button reads this so a second
   *  tap cannot start a second write. */
  busy: boolean;
  toast: Toast | null;

  boot: () => Promise<void>;
  signInWithPin: (profileId: ID, pin: string) => Promise<boolean>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, fullName: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  notify: (tone: ToastTone, title: string, detail?: string) => void;
  dismissToast: () => void;

  /**
   * Runs one backend operation. Returns its value on success and `null` on failure,
   * after showing the error to the user. Nothing is written unless the whole operation
   * succeeded, so a `null` here means the books are unchanged.
   */
  run: <T>(
    op: (backend: Backend, actorId: ID) => Promise<T>,
    options?: { success?: string; silentError?: boolean },
  ) => Promise<T | null>;

  /** Applies a fresh database snapshot returned by an operation. */
  apply: (db: Database) => void;

  /** Internal: authenticate, then load the tables that identity can see. */
  afterSignIn: (authenticate: () => Promise<ID>) => Promise<boolean>;
}

let toastSeq = 0;

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  db: null,
  actorId: null,
  busy: false,
  toast: null,

  boot: async () => {
    // The shared database refuses reads to anyone signed out, so the tables are only
    // pulled once there is a session to pull them with.
    try {
      const actorId = await auth.restoreSession();
      if (!actorId) {
        // The device-local build has no server to refuse us, and its sign-in screen needs
        // the staff list to show who is on shift.
        const db = auth.authMode() === 'pin' ? await getBackend().load() : null;
        set({ db, actorId: null, ready: true });
        return;
      }
      const db = await getBackend().load();
      const stillValid = db.profiles.some((p) => p.id === actorId && p.active) ? actorId : null;
      if (!stillValid) await auth.signOut();
      set({ db: stillValid ? db : null, actorId: stillValid, ready: true });
    } catch (e) {
      get().notify('error', errorMessage(e));
      set({ db: null, actorId: null, ready: true });
    }
  },

  signInWithPin: async (profileId, pin) => get().afterSignIn(() => auth.signInWithPin(profileId, pin)),

  signInWithPassword: async (email, password) =>
    get().afterSignIn(() => auth.signInWithPassword(email, password)),

  signUp: async (email, password, fullName) =>
    get().afterSignIn(async () => {
      const { userId, needsConfirmation } = await auth.signUp(email, password, fullName);
      if (needsConfirmation || !userId) {
        throw new Error('Account created. Confirm the email link, then sign in.');
      }
      return userId;
    }),

  /** Shared tail of every sign-in route: authenticate, then load what that person can see. */
  afterSignIn: async (authenticate) => {
    try {
      const actorId = await authenticate();
      const db = await getBackend().load();
      const profile = db.profiles.find((p) => p.id === actorId);
      if (!profile || !profile.active) {
        await auth.signOut();
        throw new Error('That account is not active. Ask the owner to enable it.');
      }
      set({ db, actorId });
      return true;
    } catch (e) {
      get().notify('error', errorMessage(e));
      return false;
    }
  },

  signOut: async () => {
    await auth.signOut();
    set({ actorId: null, db: null });
  },

  notify: (tone, title, detail) => {
    toastSeq += 1;
    set({ toast: { id: toastSeq, tone, title, detail } });
  },

  dismissToast: () => set({ toast: null }),

  apply: (db) => set({ db }),

  run: async (op, options) => {
    const { actorId, busy } = get();
    if (!actorId) {
      get().notify('error', 'Sign in again to continue.');
      return null;
    }
    if (busy) return null; // hard stop on double taps
    set({ busy: true });
    try {
      const result = await op(getBackend(), actorId);
      const next = extractDb(result);
      if (next) set({ db: next });
      if (options?.success) get().notify('success', options.success);
      return result;
    } catch (e) {
      if (!options?.silentError) get().notify('error', errorMessage(e));
      return null;
    } finally {
      set({ busy: false });
    }
  },
}));

/** Operations return either a `Database` or `{ db, ... }`; both refresh the cache. */
function extractDb(result: unknown): Database | null {
  if (!result || typeof result !== 'object') return null;
  if ('schema_version' in result) return result as Database;
  if ('db' in result) {
    const inner = (result as { db: unknown }).db;
    if (inner && typeof inner === 'object' && 'schema_version' in inner) return inner as Database;
  }
  return null;
}

/** The loaded database. Only call from inside the authenticated app tree. */
export function useDb(): Database {
  const db = useStore((s) => s.db);
  if (!db) throw new Error('useDb() used before the store finished booting');
  return db;
}

export function useActor(): Profile | null {
  return useStore((s) => {
    if (!s.db || !s.actorId) return null;
    return s.db.profiles.find((p) => p.id === s.actorId) ?? null;
  });
}
