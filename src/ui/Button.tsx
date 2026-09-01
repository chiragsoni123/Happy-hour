import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, HIT, radius, shadow, space } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonTone = 'accent' | 'brand' | 'neutral' | 'ghost' | 'danger' | 'warn' | 'chalk';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  /** Secondary line inside the button, e.g. the amount on a payment key. */
  caption?: string;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<ButtonTone, { bg: string; fg: string; border?: string }> = {
  accent: { bg: colors.accent, fg: colors.onAccent },
  brand: { bg: colors.brand, fg: '#04160A' },
  neutral: { bg: colors.surfaceHigh, fg: colors.text },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.hairline },
  danger: { bg: colors.danger, fg: '#1B0400' },
  warn: { bg: colors.warn, fg: '#231500' },
  chalk: { bg: colors.due, fg: colors.onAccent },
};

const SIZES: Record<ButtonSize, { h: number; px: number; variant: 'small' | 'bodyStrong' | 'heading' }> = {
  sm: { h: 40, px: space.lg, variant: 'small' },
  md: { h: HIT, px: space.xl, variant: 'bodyStrong' },
  lg: { h: 60, px: space.xl, variant: 'heading' },
  xl: { h: 72, px: space.xl, variant: 'heading' },
};

export function Button({
  label,
  onPress,
  tone = 'accent',
  size = 'md',
  icon,
  iconRight,
  disabled,
  loading,
  full,
  caption,
  style,
}: ButtonProps) {
  const palette = TONES[tone];
  const dims = SIZES[size];
  const inert = disabled || loading;

  const handle = useCallback(() => {
    if (inert) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [inert, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      onPress={handle}
      disabled={inert}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: dims.h,
          paddingHorizontal: dims.px,
          backgroundColor: palette.bg,
          borderColor: palette.border ?? 'transparent',
          borderWidth: palette.border ? 1.5 : 0,
          opacity: inert ? 0.45 : pressed ? 0.86 : 1,
          transform: [{ scale: pressed && !inert ? 0.98 : 1 }],
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        tone !== 'ghost' && shadow.card,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={palette.fg} strokeWidth={2.4} /> : null}
          <View>
            <Text variant={dims.variant} color={palette.fg}>
              {label}
            </Text>
            {caption ? (
              <Text variant="small" color={palette.fg} style={{ opacity: 0.75 }} tabular>
                {caption}
              </Text>
            ) : null}
          </View>
          {iconRight ? <Icon name={iconRight} size={20} color={palette.fg} strokeWidth={2.4} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
