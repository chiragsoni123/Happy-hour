import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import {
  ACCENTS,
  colors,
  radius,
  space,
  themed,
  useThemeStore,
  type AccentName,
  type ThemeMode,
} from '@/theme';
import { Card, Eyebrow, Icon, Segmented, Text } from '@/ui';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Phone' },
];

/**
 * Appearance is a per-phone preference, not venue data. It is stored on the device and
 * never sent to the database, so two people sharing the counter can each set the app up
 * the way they like without affecting anyone else or anything about the books.
 */
export function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const accent = useThemeStore((s) => s.accent);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);

  return (
    <Card level={2} style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Eyebrow>Theme</Eyebrow>
        <Segmented options={MODES} value={mode} onChange={setMode} />
        <Text variant="small" color={colors.textFaint}>
          Phone follows the handset&apos;s own light or dark setting.
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Eyebrow>Accent colour</Eyebrow>
        <View style={styles.swatches}>
          {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
            const swatch = ACCENTS[name];
            const active = name === accent;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={`${swatch.label} accent`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setAccent(name);
                }}
                style={({ pressed }) => [
                  styles.swatch,
                  { backgroundColor: swatch.color, opacity: pressed ? 0.8 : 1 },
                  active && styles.swatchActive,
                ]}
              >
                {active ? <Icon name="check" size={20} color={swatch.on} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text variant="small" color={colors.textFaint}>
          Only on this phone. The three payment keys keep their own colours whatever you pick,
          so cash, UPI and due never look alike.
        </Text>
      </View>
    </Card>
  );
}

const styles = themed(() => ({
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: colors.text,
  },
}));
