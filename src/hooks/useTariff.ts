import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { TariffPeriod } from '@/domain/types';

const KEY = 'happyhour.tariff.v1';

/**
 * Which tariff the counter is charging.
 *
 * Deliberately **not** derived from the clock: the cafe decides when the night rate
 * starts, and that boundary moves. It is sticky per device instead, so on a night shift
 * staff flip it once rather than on every table — while the switch stays visible on the
 * start sheet so nobody charges a night rate at noon without seeing it.
 */
export function useTariff(): { period: TariffPeriod; setPeriod: (next: TariffPeriod) => void } {
  const [period, setPeriodState] = useState<TariffPeriod>('DAY');

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(KEY).then((saved) => {
      if (alive && (saved === 'DAY' || saved === 'NIGHT')) setPeriodState(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setPeriod = useCallback((next: TariffPeriod) => {
    setPeriodState(next);
    void AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);

  return { period, setPeriod };
}
