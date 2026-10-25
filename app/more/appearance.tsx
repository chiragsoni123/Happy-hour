import { AppearanceSettings } from '@/components/AppearanceSettings';
import { useDb } from '@/store/useStore';
import { colors } from '@/theme';
import { Card, Header, Screen, Text } from '@/ui';

/** Open to every role: it changes how this phone looks, never what the books say. */
export default function Appearance() {
  useDb();
  return (
    <Screen>
      <Header title="Appearance" eyebrow="This phone only" back />
      <AppearanceSettings />
      <Card level={2}>
        <Text variant="small" color={colors.textMuted}>
          Nothing here is shared. Another phone on the counter can look completely different and
          every sale, due and count is still the same underneath.
        </Text>
      </Card>
    </Screen>
  );
}
