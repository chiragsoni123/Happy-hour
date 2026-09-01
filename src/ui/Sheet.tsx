import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, space } from '@/theme';

import { Icon } from './Icon';
import { Eyebrow, Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  /** Pinned to the bottom, outside the scroll area, so the commit button is always reachable. */
  footer?: ReactNode;
}

/** Bottom sheet used for every focused task: checkout, settle, add stock, expenses. */
export function Sheet({ visible, onClose, title, eyebrow, children, footer }: SheetProps) {
  const insets = useSafeAreaInsets();

  // Mount only while open. Toggling `Modal.visible` alone leaves the sheet on screen on
  // web, where the exit animation never reports back, so a committed action would look
  // like it had not happened.
  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.dock}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.xl) }]}>
            <View style={styles.grabber} />
            <View style={styles.head}>
              <View style={{ flex: 1, gap: 2 }}>
                {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
                <Text variant="title">{title}</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.close}
              >
                <Icon name="close" size={18} color={colors.textMuted} strokeWidth={2.4} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.body}
              contentContainerStyle={{ gap: space.lg, paddingBottom: space.lg }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,6,3,0.72)',
    justifyContent: 'flex-end',
  },
  dock: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    maxHeight: '92%',
    ...shadow.float,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    alignSelf: 'center',
    marginBottom: space.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.lg,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  footer: {
    gap: space.md,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
