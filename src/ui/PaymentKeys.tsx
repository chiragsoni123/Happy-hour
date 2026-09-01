import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatMoney, type Paise } from '@/domain/money';
import type { CheckoutMethod } from '@/domain/types';
import { colors, radius, shadow, space } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const KEYS: {
  method: CheckoutMethod;
  label: string;
  icon: IconName;
  bg: string;
  fg: string;
}[] = [
  { method: 'CASH', label: 'Cash', icon: 'cash', bg: colors.cash, fg: colors.onAccent },
  { method: 'UPI', label: 'UPI', icon: 'upi', bg: colors.upi, fg: '#231500' },
  { method: 'DUE', label: 'Due', icon: 'due', bg: colors.due, fg: colors.onAccent },
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
  const keys = allow ? KEYS.filter((k) => allow.includes(k.method)) : KEYS;
  return (
    <View style={styles.row}>
      {keys.map((key) => (
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
            shadow.card,
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
