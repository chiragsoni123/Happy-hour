import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * A ticking clock for live session pricing.
 *
 * Timers are derived from `started_at` rather than counted up in memory, so a session
 * survives the app being backgrounded, killed or reinstalled — the elapsed time is
 * always recomputed from the stored timestamp. Re-syncing on foreground keeps the
 * display honest after Android freezes the interval.
 */
export function useNow(intervalMs = 1000): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    interval.current = setInterval(tick, intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      if (interval.current) clearInterval(interval.current);
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}

/**
 * A stable idempotency key for one commit attempt. Regenerate it only after a
 * successful write, so every retry of a failed checkout reuses the same key and the
 * backend can recognise the duplicate.
 */
export function useOpId(): { opId: string; renew: () => void } {
  const [opId, setOpId] = useState(() => makeOpId());
  return { opId, renew: () => setOpId(makeOpId()) };
}

function makeOpId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
