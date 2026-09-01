import { StyleSheet, View } from 'react-native';

import { formatMoney, RUPEE, type Paise } from '@/domain/money';
import { colors, space, type } from '@/theme';

import { Eyebrow, Text } from './Text';

export interface MoneyProps {
  value: Paise;
  variant?: 'hero' | 'display' | 'title' | 'heading' | 'bodyStrong' | 'body' | 'small';
  color?: string;
  /** Renders the ₹ smaller and lifted, the way the big numbers read in the reference. */
  fancySymbol?: boolean;
  sign?: boolean;
}

export function Money({
  value,
  variant = 'bodyStrong',
  color = colors.text,
  fancySymbol,
  sign,
}: MoneyProps) {
  if (!fancySymbol) {
    return (
      <Text variant={variant} color={color} tabular>
        {formatMoney(value, { sign })}
      </Text>
    );
  }
  const body = formatMoney(value, { sign, symbol: false });
  const size = type[variant].fontSize ?? 16;
  return (
    <View style={styles.fancy}>
      <Text
        variant={variant}
        color={color}
        style={{ fontSize: size * 0.55, lineHeight: size * 0.9, opacity: 0.75 }}
      >
        {RUPEE}
      </Text>
      <Text variant={variant} color={color} tabular>
        {body}
      </Text>
    </View>
  );
}

export interface StatProps {
  label: string;
  value: Paise;
  color?: string;
  caption?: string;
}

/** Compact labelled money readout used across Home, Cash and Reports. */
export function Stat({ label, value, color = colors.text, caption }: StatProps) {
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Eyebrow>{label}</Eyebrow>
      <Money value={value} variant="heading" color={color} />
      {caption ? (
        <Text variant="small" color={colors.textFaint}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fancy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs / 2,
  },
});
