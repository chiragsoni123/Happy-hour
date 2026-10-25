import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney, type Paise } from '@/domain/money';
import { rateLabel, TARIFF_LABEL } from '@/domain/pricing';
import { formatDuration } from '@/domain/time';
import type { TariffPeriod } from '@/domain/types';
import { colors, space } from '@/theme';
import {
  Button,
  Card,
  digitsToPaise,
  Eyebrow,
  Money,
  NumberPad,
  paiseToDigits,
  Sheet,
  Text,
} from '@/ui';

export interface GameAmountSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: Paise) => void;
  busy: boolean;
  /** Stopping the clock, or correcting a game already on an open bill. */
  mode: 'stop' | 'correct';
  resourceLabel: string;
  /** What the meter worked out — a starting point, not a verdict. */
  metered: Paise;
  minutes: number;
  ratePerMinute: Paise;
  period: TariffPeriod;
}

/**
 * The clock proposes, the counter decides.
 *
 * Game time is negotiated far more often than a packet of crisps is — a group runs five
 * minutes over, or a regular gets rounded down — so the metered figure is pre-filled and
 * then fully editable. What the meter said is kept on the session either way, so the
 * difference shows up as a discount instead of vanishing.
 */
export function GameAmountSheet({
  visible,
  onClose,
  onConfirm,
  busy,
  mode,
  resourceLabel,
  metered,
  minutes,
  ratePerMinute,
  period,
}: GameAmountSheetProps) {
  const [digits, setDigits] = useState('');

  // Re-arm with the meter's figure each time the sheet opens.
  useEffect(() => {
    if (visible) setDigits(paiseToDigits(metered));
  }, [visible, metered]);

  const amount = digitsToPaise(digits);
  const difference = amount - metered;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow={`${resourceLabel} · ${TARIFF_LABEL[period]} rate`}
      title={mode === 'stop' ? 'Stop and charge' : 'Change the amount'}
      footer={
        <Button
          label={mode === 'stop' ? `Stop and charge ${formatMoney(amount)}` : `Save ${formatMoney(amount)}`}
          icon={mode === 'stop' ? 'stop' : 'check'}
          tone="accent"
          size="lg"
          full
          loading={busy}
          onPress={() => onConfirm(amount)}
        />
      }
    >
      <Card level={2} style={styles.meter}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>On the clock</Eyebrow>
          <Text variant="bodyStrong">{formatDuration(minutes)}</Text>
          <Text variant="small" color={colors.textFaint}>
            {rateLabel({
              rate_per_minute: ratePerMinute,
              minimum_charge: 0,
              min_billable_minutes: 0,
              billing_increment_minutes: 1,
            })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Eyebrow>Meter says</Eyebrow>
          <Money value={metered} variant="title" color={colors.textMuted} />
        </View>
      </Card>

      <NumberPad
        value={digits}
        onChange={setDigits}
        label="Charging"
        quick={quickAmounts(metered)}
      />

      {difference !== 0 ? (
        <Card level={2} accentEdge={difference < 0 ? colors.warn : colors.brand}>
          <Text variant="bodyStrong">
            {difference < 0
              ? `${formatMoney(-difference)} less than the meter`
              : `${formatMoney(difference)} more than the meter`}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            Recorded against your name, with the meter&apos;s figure kept beside it.
          </Text>
        </Card>
      ) : null}
    </Sheet>
  );
}

/** The meter's figure, plus the round numbers a counter actually reaches for. */
function quickAmounts(metered: Paise): Paise[] {
  const options = new Set<Paise>();
  if (metered > 0) options.add(metered);
  for (const step of [5000, 10000, 15000, 20000, 30000, 50000]) options.add(step);
  return [...options].sort((a, b) => a - b).slice(0, 6);
}

const styles = StyleSheet.create({
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
