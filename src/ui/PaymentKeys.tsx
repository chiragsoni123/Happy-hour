import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatMoney, type Paise } from '@/domain/money';
import type { CheckoutMethod } from '@/domain/types';
import { colors, elevation, radius, space } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface Key {
  method: CheckoutMethod;
  label: string;
  icon: IconName;
  bg: string;
  fg: string;
}

/** Read at render. The payment colours never follow the accent, only the theme. */
const keys = (): Key[] => [
  { method: 'CASH', label: 'Cash', icon: 'cash', bg: colors.cash, fg: colors.onCash },
  { method: 'UPI', label: 'UPI', icon: 'upi', bg: colors.upi, fg: colors.onUpi },
  { method: 'DUE', label: 'Due', icon: 'due', bg: colors.due, fg: colors.onDue },
];

export interface PaymentKeysProps {
  amount: Paise;
  onPick: (method: CheckoutMethod) => void;
  disabled?: boolean;
  /** Hide DUE where it makes no sense, e.g. settling an existing due. */
  allow?: CheckoutMethod[];
}

/**
 * The end of every flow in the app. Three permanently coloured keys, always in the same
 * order, always the same size — so a staff member can hit the right one without reading.
 */
export function PaymentKeys({ amount, onPick, disabled, allow }: PaymentKeysProps) {
  const all = keys();
  const shown = allow ? all.filter((k) => allow.includes(k.method)) : all;
  return (
    <View style={styles.row}>
      {shown.map((key) => (
        <Pressable
          key={key.method}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${key.label} ${formatMoney(amount)}`}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onPick(key.method);
          }}
          style={({ pressed }) => [
            styles.key,
            elevation('card'),
            {
              backgroundColor: key.bg,
              opacity: disabled ? 0.4 : pressed ? 0.88 : 1,
              transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
            },
          ]}
        >
          <Icon name={key.icon} size={24} color={key.fg} strokeWidth={2.4} />
          <Text variant="heading" color={key.fg}>
            {key.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  key: {
    flex: 1,
    height: 92,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
