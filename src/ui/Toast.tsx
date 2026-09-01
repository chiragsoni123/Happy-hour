import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/store/useStore';
import { colors, radius, shadow, space } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const TONE: Record<string, { bg: string; fg: string; icon: IconName }> = {
  success: { bg: colors.accent, fg: colors.onAccent, icon: 'check' },
  error: { bg: colors.danger, fg: '#1B0400', icon: 'alert' },
  info: { bg: colors.surfaceHigh, fg: colors.text, icon: 'clock' },
};

/**
 * One toast at a time, top-anchored so it never covers the payment keys at the bottom
 * of the screen. Errors stay twice as long as confirmations.
 */
export function ToastHost() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-140)).current;

  useEffect(() => {
    if (!toast) return;
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 18 }).start();
    const timeout = setTimeout(
      () => {
        Animated.timing(slide, {
          toValue: -140,
          duration: 180,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) dismiss();
        });
      },
      toast.tone === 'error' ? 4200 : 2200,
    );
    return () => clearTimeout(timeout);
  }, [toast, slide, dismiss]);

  if (!toast) return null;
  const tone = TONE[toast.tone] ?? TONE.info;
  if (!tone) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + space.sm, transform: [{ translateY: slide }] },
      ]}
    >
      <Pressable
        onPress={dismiss}
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: tone.bg }]}
      >
        <Icon name={tone.icon} size={20} color={tone.fg} strokeWidth={2.6} />
        <Text variant="bodyStrong" color={tone.fg} style={{ flex: 1 }}>
          {toast.title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    ...shadow.float,
  },
});
