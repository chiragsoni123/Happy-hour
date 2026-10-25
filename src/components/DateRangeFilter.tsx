import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { DayRange } from '@/domain/reporting';
import { currentBusinessDay, formatDayKey, relativeDayLabel, toDateKey } from '@/domain/time';
import type { DayKey } from '@/domain/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Card, Eyebrow, Segmented, Sheet, Text } from '@/ui';

export type RangePreset = 'today' | 'yesterday' | 'all' | 'custom';

export interface DateRangeState {
  preset: RangePreset;
  /** Resolved span, or null for "everything loaded". */
  range: DayRange | null;
  /** Short label for headers, e.g. "Today" or "3 Sep – 9 Sep". */
  label: string;
  setPreset: (preset: RangePreset) => void;
  setCustom: (from: DayKey, to: DayKey) => void;
}

function yesterdayKey(today: DayKey): DayKey {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toDateKey(d);
}

/**
 * One filter for every history screen. A preset resolves to a `DayRange` that the
 * reporting functions understand; "custom" holds whatever the picker chose last.
 */
export function useDateRange(initial: RangePreset = 'today'): DateRangeState {
  const today = currentBusinessDay();
  const [preset, setPresetState] = useState<RangePreset>(initial);
  const [custom, setCustomState] = useState<DayRange>({ from: today, to: today });

  const range = useMemo<DayRange | null>(() => {
    switch (preset) {
      case 'today':
        return { from: today, to: today };
      case 'yesterday': {
        const y = yesterdayKey(today);
        return { from: y, to: y };
      }
      case 'all':
        return null;
      case 'custom':
        return custom;
    }
  }, [preset, custom, today]);

  const label = useMemo(() => {
    if (!range) return 'All';
    if (range.from === range.to) return relativeDayLabel(range.from, today);
    return `${formatDayKey(range.from)} – ${formatDayKey(range.to)}`;
  }, [range, today]);

  const setCustom = useCallback((from: DayKey, to: DayKey) => {
    setCustomState(from <= to ? { from, to } : { from: to, to: from });
    setPresetState('custom');
  }, []);

  return { preset, range, label, setPreset: setPresetState, setCustom };
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

export interface DateRangeFilterProps {
  state: DateRangeState;
  /** Days that actually have something on them, so the picker does not list empty ones. */
  availableDays: DayKey[];
}

/** The segmented control plus a sheet for picking a custom span by tapping two days. */
export function DateRangeFilter({ state, availableDays }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<DayKey | null>(null);
  const today = currentBusinessDay();

  // Newest first, always including today so an empty day is still pickable.
  const days = useMemo(() => {
    const set = new Set<DayKey>([today, ...availableDays]);
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 90);
  }, [availableDays, today]);

  const choose = (preset: RangePreset) => {
    if (preset === 'custom') {
      setFrom(null);
      setOpen(true);
      return;
    }
    state.setPreset(preset);
  };

  const pick = (day: DayKey) => {
    if (!from) {
      setFrom(day);
      return;
    }
    state.setCustom(from, day);
    setOpen(false);
  };

  return (
    <>
      <View style={{ gap: space.sm }}>
        <Segmented options={PRESETS} value={state.preset} onChange={choose} />
        {state.preset === 'custom' ? (
          <Pressable onPress={() => choose('custom')} hitSlop={8} accessibilityRole="button">
            <Text variant="small" color={colors.accentText} align="center">
              {state.label} · change
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        eyebrow={from ? `From ${relativeDayLabel(from, today)}` : 'Pick a span'}
        title={from ? 'Now tap the last day' : 'Tap the first day'}
        footer={
          from ? (
            <Button
              label={`Just ${relativeDayLabel(from, today)}`}
              tone="neutral"
              full
              onPress={() => pick(from)}
            />
          ) : null
        }
      >
        <Card level={2} padded={false} style={{ paddingHorizontal: space.md }}>
          {days.map((day) => {
            const active = day === from;
            return (
              <Pressable
                key={day}
                onPress={() => pick(day)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.day,
                  active && { backgroundColor: colors.accent },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text variant="bodyStrong" color={active ? colors.onAccent : colors.text}>
                  {relativeDayLabel(day, today)}
                </Text>
                <Eyebrow color={active ? colors.onAccent : colors.textFaint}>{formatDayKey(day, true)}</Eyebrow>
              </Pressable>
            );
          })}
        </Card>
      </Sheet>
    </>
  );
}

const styles = themed(() => ({
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
}));
