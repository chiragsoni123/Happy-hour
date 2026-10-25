import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

import { applyTheme, type AccentName, type ResolvedMode, type ThemeMode } from './colors';

const KEY = 'happyhour.theme.v1';

interface ThemePreference {
  mode: ThemeMode;
  accent: AccentName;
}

interface ThemeState extends ThemePreference {
  /** What is actually on screen once `system` has been resolved. */
  resolved: ResolvedMode;
  /** Bumped on every change; subscribing to it is how a screen learns to re-render. */
  version: number;
  ready: boolean;

  load: () => Promise<void>;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentName) => void;
}

function resolve(mode: ThemeMode): ResolvedMode {
  if (mode === 'system') return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
  return mode;
}

/**
 * Per-phone appearance. It is a preference, not data: it never touches the database, so
 * two staff sharing a counter can each have the app the way they like it and nothing
 * about the books changes.
 */
export const useThemeStore = create<ThemeState>((set, get) => {
  const commit = (pref: ThemePreference) => {
    const resolved = resolve(pref.mode);
    applyTheme(resolved, pref.accent);
    set({ ...pref, resolved, version: get().version + 1 });
    void AsyncStorage.setItem(KEY, JSON.stringify(pref)).catch(() => undefined);
  };

  // Follow the phone when the person has asked for that.
  Appearance.addChangeListener(() => {
    const { mode, accent } = get();
    if (mode === 'system') commit({ mode, accent });
  });

  return {
    mode: 'dark',
    accent: 'lime',
    resolved: 'dark',
    version: 0,
    ready: false,

    load: async () => {
      let pref: ThemePreference = { mode: 'dark', accent: 'lime' };
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ThemePreference>;
          if (parsed.mode === 'dark' || parsed.mode === 'light' || parsed.mode === 'system') {
            pref.mode = parsed.mode;
          }
          if (parsed.accent && isAccent(parsed.accent)) pref.accent = parsed.accent;
        }
      } catch {
        // A bad preference is not worth failing the launch for.
      }
      const resolved = resolve(pref.mode);
      applyTheme(resolved, pref.accent);
      set({ ...pref, resolved, version: get().version + 1, ready: true });
    },

    setMode: (mode) => commit({ mode, accent: get().accent }),
    setAccent: (accent) => commit({ mode: get().mode, accent }),
  };
});

function isAccent(value: string): value is AccentName {
  return ['lime', 'orange', 'sky', 'rose', 'violet', 'mint'].includes(value);
}

/**
 * Subscribe a component to theme changes. Returns the resolved mode; the colours
 * themselves are read from the live `colors` object, which `applyTheme` has already
 * updated by the time this re-renders.
 */
export function useTheme(): { resolved: ResolvedMode; version: number } {
  const resolved = useThemeStore((s) => s.resolved);
  const version = useThemeStore((s) => s.version);
  return { resolved, version };
}
