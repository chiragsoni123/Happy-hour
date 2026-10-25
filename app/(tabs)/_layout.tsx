import * as Haptics from 'expo-haptics';
import { Redirect, useRouter } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import {
  Pressable,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/store/useStore';
import { colors, elevation, radius, space, themed, useTheme } from '@/theme';
import { Icon, Text, type IconName } from '@/ui';

/**
 * A floating bar rather than a docked one, with the single action staff use hundreds of
 * times a day lifted out of it. New Sale is not a tab — it opens a fresh bill — so it
 * behaves like a button and is sized like the centrepiece it is.
 *
 * `TabList` has to be a direct child of `Tabs`: that is how expo-router discovers the
 * triggers, so the bar styling lives on `TabList` itself rather than on a wrapper.
 */
export default function TabsLayout() {
  const actorId = useStore((s) => s.actorId);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  useTheme();
  const bottom = Math.max(insets.bottom, space.md);

  if (!actorId) return <Redirect href="/sign-in" />;

  return (
    <Tabs style={styles.root}>
      <TabSlot />

      <TabList style={[styles.bar, { bottom }]}>
        <TabTrigger name="home" href="/(tabs)/home" asChild>
          <TabButton icon="home" label="Home" />
        </TabTrigger>
        <TabTrigger name="games" href="/(tabs)/games" asChild>
          <TabButton icon="gamepad" label="Games" />
        </TabTrigger>

        {/* Leaves room for the raised New Sale button. */}
        <View style={styles.spacer} />

        <TabTrigger name="dues" href="/(tabs)/dues" asChild>
          <TabButton icon="wallet" label="Dues" />
        </TabTrigger>
        <TabTrigger name="more" href="/(tabs)/more" asChild>
          <TabButton icon="menu" label="More" />
        </TabTrigger>
      </TabList>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New sale"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/bill/new');
        }}
        style={({ pressed }) => [
          styles.fab,
          elevation('float'),
          { bottom: bottom + 18, transform: [{ scale: pressed ? 0.95 : 1 }] },
        ]}
      >
        <Icon name="plus" size={26} color={colors.onAccent} strokeWidth={3} />
        <Text variant="eyebrow" color={colors.onAccent}>
          Sale
        </Text>
      </Pressable>
    </Tabs>
  );
}

interface TabButtonProps extends TabTriggerSlotProps {
  icon: IconName;
  label: string;
}

const TabButton = forwardRef<View, TabButtonProps>(
  ({ icon, label, isFocused, onPress, ...rest }, ref) => {
    const tint = isFocused ? colors.accentText : colors.textFaint;
    return (
      <Pressable
        ref={ref}
        {...rest}
        accessibilityRole="tab"
        accessibilityState={{ selected: !!isFocused }}
        accessibilityLabel={label}
        onPress={(event) => {
          void Haptics.selectionAsync();
          onPress?.(event);
        }}
        style={styles.tab}
      >
        <Icon name={icon} size={22} color={tint} strokeWidth={isFocused ? 2.6 : 2} />
        <Text variant="eyebrow" color={tint}>
          {label}
        </Text>
      </Pressable>
    );
  },
);
TabButton.displayName = 'TabButton';

const styles = themed(() => ({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  bar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    ...elevation('float'),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: space.sm,
  },
  spacer: {
    width: 72,
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderWidth: 5,
    borderColor: colors.bg,
  },
}));
