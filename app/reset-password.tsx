import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useStore } from '@/store/useStore';
import { colors, space, useTheme } from '@/theme';
import { Button, Card, Eyebrow, Field, Header, Loader, Screen, Text } from '@/ui';

/**
 * Where the password-reset link lands. Supabase verifies the link and redirects here
 * with a one-time `?code=`; this screen exchanges it for a session, then asks for the
 * new password. The person is already signed in by the time they type it, so a
 * successful save goes straight to the till.
 */
export default function ResetPassword() {
  useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const openRecoveryLink = useStore((s) => s.openRecoveryLink);
  const finishPasswordReset = useStore((s) => s.finishPasswordReset);

  const [state, setState] = useState<'exchanging' | 'ready' | 'failed'>('exchanging');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!code) {
      setState('failed');
      return;
    }
    void openRecoveryLink(code).then((ok) => {
      if (alive) setState(ok ? 'ready' : 'failed');
    });
    return () => {
      alive = false;
    };
  }, [code, openRecoveryLink]);

  const submit = async () => {
    setBusy(true);
    const ok = await finishPasswordReset(password);
    setBusy(false);
    if (ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/home');
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (state === 'exchanging') return <Loader message="Checking the link" />;

  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 6 && confirm === password;

  return (
    <Screen contentStyle={{ gap: space.xl }}>
      <Header
        title={state === 'failed' ? 'That link did not work' : 'Choose a new password'}
        eyebrow="Password reset"
        back
        onBack={() => router.replace('/sign-in')}
      />

      {state === 'failed' ? (
        <>
          <Card level={2} accentEdge={colors.warn} style={{ gap: space.xs }}>
            <Text variant="bodyStrong">The link has expired, was already used, or was opened elsewhere.</Text>
            <Text variant="small" color={colors.textMuted}>
              Reset links work once, for an hour, and only on the phone that asked for them.
              Ask for a new one and open it here.
            </Text>
          </Card>
          <Button label="Back to sign in" tone="accent" size="lg" full onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secure
            icon="lock"
            autoFocus
          />
          <Field
            label="Type it again"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Same as above"
            secure
            icon="lock"
            hint={mismatch ? 'These do not match yet.' : undefined}
          />
          <Button
            label="Save and sign in"
            tone="accent"
            size="lg"
            full
            loading={busy}
            disabled={!ready}
            onPress={() => void submit()}
          />
          <Card level={2} style={{ gap: space.xs }}>
            <Eyebrow>Then</Eyebrow>
            <Text variant="small" color={colors.textMuted}>
              You are signed in as soon as it saves. Next time, use the new password.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}
