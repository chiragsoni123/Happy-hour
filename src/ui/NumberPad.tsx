import * as Haptics from 'expo-haptics';
import {
  Pressable,
  View,
} from 'react-native';

import { formatMoney, type Paise } from '@/domain/money';
import { colors, radius, space, themed } from '@/theme';

import { Icon } from './Icon';
import { Eyebrow, Text } from './Text';

export interface NumberPadProps {
  /** Digit string in rupees, e.g. `"1250"` means ₹1,250. */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  /** Shown as tappable shortcuts above the keys. */
  quick?: Paise[];
  max?: Paise;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

/**
 * A dedicated pad rather than the system keyboard: staff enter amounts one-handed
 * while holding a phone at the counter, and the keys are far larger than a keyboard's.
 */
export function NumberPad({ value, onChange, label, quick, max }: NumberPadProps) {
  const paise = digitsToPaise(value);

  const press = (key: (typeof KEYS)[number]) => {
    void Haptics.selectionAsync();
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    const next = (value + key).replace(/^0+(?=\d)/, '');
    if (next.length > 7) return;
    if (max !== undefined && digitsToPaise(next) > max) {
      onChange(String(Math.floor(max / 100)));
      return;
    }
    onChange(next);
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.display}>
        {label ? <Eyebrow>{label}</Eyebrow> : null}
        <Text variant="hero" tabular>
          {formatMoney(paise)}
        </Text>
      </View>

      {quick && quick.length > 0 ? (
        <View style={styles.quickRow}>
          {quick.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(String(Math.floor(amount / 100)));
              }}
              style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text variant="small" color={colors.accentText} tabular>
                {formatMoney(amount)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.grid}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            accessibilityRole="button"
            accessibilityLabel={key === 'del' ? 'Delete' : key}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          >
            {key === 'del' ? (
              <Icon name="back" size={22} color={colors.textMuted} strokeWidth={2.4} />
            ) : (
              <Text variant="title" color={colors.text}>
                {key}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function digitsToPaise(digits: string): Paise {
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n * 100 : 0;
}

export function paiseToDigits(paise: Paise): string {
  if (paise <= 0) return '';
  return String(Math.round(paise / 100));
}

const styles = themed(() => ({
  display: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  quick: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  key: {
    width: '31.5%',
    flexGrow: 1,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: colors.hairline,
    opacity: 0.9,
  },
}));
