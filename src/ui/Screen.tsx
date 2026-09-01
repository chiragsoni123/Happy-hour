import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Eyebrow, Text } from './Text';

export interface ScreenProps {
  children: ReactNode;
  /** Extra bottom padding so content clears the floating tab bar. */
  tabBarPadding?: boolean;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export const TAB_BAR_CLEARANCE = 124;

export function Screen({
  children,
  tabBarPadding,
  scroll = true,
  style,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.md,
    paddingBottom: (tabBarPadding ? TAB_BAR_CLEARANCE : space.xl) + insets.bottom,
  };

  if (!scroll) {
    return (
      <View style={[styles.page, padding, style]}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.page, style]}
      contentContainerStyle={[styles.content, padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export interface HeaderProps {
  title: string;
  eyebrow?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}

export function Header({ title, eyebrow, back, right, onBack }: HeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={14}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          style={styles.backButton}
        >
          <Icon name="back" size={20} color={colors.text} strokeWidth={2.4} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text variant="title" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.xl,
    gap: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
