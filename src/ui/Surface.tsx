import { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, shadow, space } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Eyebrow, Text } from './Text';

export interface CardProps {
  children: ReactNode;
  /** Layer depth: 1 sits on the page, 2 sits on a card, 3 is the top of the stack. */
  level?: 1 | 2 | 3;
  onPress?: () => void;
  padded?: boolean;
  accentEdge?: string;
  style?: StyleProp<ViewStyle>;
}

const LEVELS = {
  1: colors.surface,
  2: colors.surfaceRaised,
  3: colors.surfaceHigh,
} as const;

export function Card({ children, level = 1, onPress, padded = true, accentEdge, style }: CardProps) {
  const body = (
    <View
      style={[
        styles.card,
        { backgroundColor: LEVELS[level], padding: padded ? space.xl : 0 },
        accentEdge ? { borderLeftWidth: 5, borderLeftColor: accentEdge } : null,
        level > 1 ? null : shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
    >
      {body}
    </Pressable>
  );
}

export interface SectionProps {
  title: string;
  children: ReactNode;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function Section({ title, children, action, style }: SectionProps) {
  return (
    <View style={[{ gap: space.md }, style]}>
      <View style={styles.sectionHead}>
        <Eyebrow>{title}</Eyebrow>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={12} accessibilityRole="button">
            <View style={styles.sectionAction}>
              <Text variant="small" color={colors.accent}>
                {action.label}
              </Text>
              <Icon name="chevron" size={14} color={colors.accent} strokeWidth={2.6} />
            </View>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: string;
  icon?: IconName;
  iconColor?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}

/** The workhorse list row: big tap target, value on the right, optional chevron. */
export function Row({
  title,
  subtitle,
  value,
  valueColor = colors.text,
  icon,
  iconColor = colors.textMuted,
  onPress,
  right,
}: RowProps) {
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="bodyStrong" color={valueColor} tabular>
          {value}
        </Text>
      ) : null}
      {right}
      {onPress ? <Icon name="chevron" size={16} color={colors.textFaint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export interface BadgeProps {
  label: string;
  color?: string;
  filled?: boolean;
}

export function Badge({ label, color = colors.accent, filled }: BadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        filled
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: 'transparent', borderColor: color },
      ]}
    >
      <Text variant="eyebrow" color={filled ? colors.onAccent : color}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: IconName;
  title: string;
  detail?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.textFaint} />
      </View>
      <Text variant="heading" color={colors.textMuted} align="center">
        {title}
      </Text>
      {detail ? (
        <Text variant="small" color={colors.textFaint} align="center">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 56,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xxxl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
});
