import { StyleSheet } from 'react-native';

import { useThemeStore } from './useTheme';

/**
 * `StyleSheet.create` evaluates its object once at module load, which would freeze the
 * dark palette into every stylesheet that mentions `colors`. This wraps the same literal
 * in a builder and rebuilds it the first time it is read after a theme change, so a
 * screen keeps writing `styles.card` and gets the right colours anyway.
 *
 * Layout-only sheets could use `StyleSheet.create` directly; using this everywhere means
 * nobody has to remember which is which.
 */
export function themed<T extends StyleSheet.NamedStyles<T>>(build: () => T): T {
  let cached: T | null = null;
  let builtFor = -1;

  const current = (): T => {
    const version = useThemeStore.getState().version;
    if (!cached || builtFor !== version) {
      cached = StyleSheet.create(build());
      builtFor = version;
    }
    return cached;
  };

  return new Proxy({} as T, {
    get: (_target, key) => current()[key as keyof T],
    has: (_target, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_target, key) => ({
      enumerable: true,
      configurable: true,
      value: current()[key as keyof T],
    }),
  });
}
