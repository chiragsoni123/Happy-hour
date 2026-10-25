import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  View,
} from 'react-native';

import { authMode } from '@/data/auth';
import { ROLE_BLURB, ROLE_LABEL } from '@/domain/permissions';
import type { Profile } from '@/domain/types';
import { useStore } from '@/store/useStore';
import { colors, elevation, radius, space, themed, useTheme } from '@/theme';
import { Button, Card, Eyebrow, Field, Icon, Screen, Text } from '@/ui';

/**
 * Two ways in, decided by which backend is configured.
 *
 * Against Supabase each staff member has their own account, because `auth.uid()` is what
 * stamps every row and what the row-level policies judge — a shared login would make
 * "who collected this money?" unanswerable, which is the question the app exists for.
 */
export default function SignIn() {
  useTheme();
  const mode = useMemo(() => authMode(), []);
  return mode === 'password' ? <PasswordSignIn /> : <PinSignIn />;
}

// ------------------------------------------------------------------ Supabase

type Mode = 'signin' | 'signup' | 'forgot' | 'sent';

function PasswordSignIn() {
  const router = useRouter();
  const signInWithPassword = useStore((s) => s.signInWithPassword);
  const signUp = useStore((s) => s.signUp);
  const requestPasswordReset = useStore((s) => s.requestPasswordReset);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);

  const landed = (ok: boolean) => {
    setBusy(false);
    if (ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/home');
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const submit = async () => {
    setBusy(true);
    switch (mode) {
      case 'signin':
        landed(await signInWithPassword(email, password));
        return;
      case 'signup':
        landed(await signUp(email, password, fullName));
        return;
      case 'forgot':
      case 'sent': {
        const sent = await requestPasswordReset(email);
        setBusy(false);
        if (sent) setMode('sent');
        return;
      }
    }
  };

  const emailOk = email.trim().length > 3;
  const passwordOk = password.length >= 6;
  const ready =
    mode === 'forgot' || mode === 'sent'
      ? emailOk
      : emailOk && passwordOk && (mode !== 'signup' || !!fullName.trim());

  const subtitle: Record<Mode, string> = {
    signin: 'Sign in to start your shift',
    signup: 'Create your account',
    forgot: 'We will email you a link',
    sent: 'Check that inbox on this phone',
  };

  const action: Record<Mode, string> = {
    signin: 'Sign in',
    signup: 'Create account',
    forgot: 'Send link',
    sent: 'Send it again',
  };

  return (
    <Screen contentStyle={{ gap: space.xl }}>
      <Brand subtitle={subtitle[mode]} />

      {mode === 'signup' ? (
        <Field
          label="Your name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ravi Kumar"
          hint="This is the name that appears against every sale you ring up."
        />
      ) : null}

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        icon="people"
      />

      {mode === 'sent' ? (
        <Card level={2} accentEdge={colors.accent} style={{ gap: space.xs }}>
          <Text variant="bodyStrong">Tap the link in the email on this phone.</Text>
          <Text variant="small" color={colors.textMuted}>
            It opens the app on a screen to choose a new password. The link only works on
            the phone that asked for it, and only for an hour.
          </Text>
        </Card>
      ) : null}

      {mode === 'signin' || mode === 'signup' ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secure
          icon="lock"
        />
      ) : null}

      <Button
        label={action[mode]}
        tone="accent"
        size="lg"
        full
        loading={busy}
        disabled={!ready}
        onPress={() => void submit()}
      />

      {mode === 'signin' ? (
        <>
          <Pressable onPress={() => setMode('forgot')} hitSlop={12} accessibilityRole="button">
            <Text variant="small" color={colors.textMuted} align="center">
              Forgot your password?
            </Text>
          </Pressable>
          <Pressable onPress={() => setMode('signup')} hitSlop={12} accessibilityRole="button">
            <Text variant="small" color={colors.textMuted} align="center">
              First time here? Create an account
            </Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => setMode('signin')} hitSlop={12} accessibilityRole="button">
          <Text variant="small" color={colors.textMuted} align="center">
            Back to sign in
          </Text>
        </Pressable>
      )}

      {mode === 'signin' || mode === 'signup' ? (
        <Card level={2} style={{ gap: space.sm }}>
          <Eyebrow>How accounts work</Eyebrow>
          <Text variant="small" color={colors.textMuted}>
            The first account created becomes the owner. Everyone after that starts as staff, and
            the owner sets their role in More, Staff. Each person signs in as themselves so the
            books can always say who took the money.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

// --------------------------------------------------------------- device-local

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

function PinSignIn() {
  const router = useRouter();
  const db = useStore((s) => s.db);
  const signInWithPin = useStore((s) => s.signInWithPin);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  const staff = useMemo(() => (db?.profiles ?? []).filter((p) => p.active), [db]);

  const submit = async (next: string) => {
    if (!selected) return;
    setChecking(true);
    const ok = await signInWithPin(selected.id, next);
    setChecking(false);
    if (ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/home');
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPin('');
    }
  };

  const press = (key: string) => {
    if (!key || checking) return;
    void Haptics.selectionAsync();
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <Screen contentStyle={{ gap: space.xxl }}>
      <Brand subtitle={selected ? `PIN for ${selected.full_name}` : 'Who is on the counter?'} />

      {!selected ? (
        <View style={{ gap: space.md }}>
          {staff.map((profile) => (
            <Card key={profile.id} level={2} onPress={() => setSelected(profile)}>
              <View style={styles.staffRow}>
                <View style={styles.avatar}>
                  <Text variant="heading" color={colors.accentText}>
                    {initials(profile.full_name)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading">{profile.full_name}</Text>
                  <Text variant="small" color={colors.textMuted}>
                    {ROLE_LABEL[profile.role]} · {ROLE_BLURB[profile.role]}
                  </Text>
                </View>
                <Icon name="chevron" size={18} color={colors.textFaint} />
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <View style={{ gap: space.xxl }}>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.dot, i < pin.length && { backgroundColor: colors.accent }]}
              />
            ))}
          </View>

          <View style={styles.pad}>
            {PIN_KEYS.map((key, i) => (
              <Pressable
                key={`${key}-${i}`}
                onPress={() => press(key)}
                disabled={!key}
                accessibilityRole="button"
                accessibilityLabel={key === 'del' ? 'Delete' : key}
                style={({ pressed }) => [
                  styles.padKey,
                  !key && { opacity: 0 },
                  pressed && { backgroundColor: colors.surfaceHigh },
                ]}
              >
                {key === 'del' ? (
                  <Icon name="back" size={22} color={colors.textMuted} strokeWidth={2.4} />
                ) : (
                  <Text variant="title">{key}</Text>
                )}
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => {
              setSelected(null);
              setPin('');
            }}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Text variant="small" color={colors.textMuted} align="center">
              Not you? Pick someone else
            </Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

function Brand({ subtitle }: { subtitle: string }) {
  const venue = useStore((s) => s.db?.settings.venue_name) ?? 'Happy Hour';
  return (
    <View style={{ gap: space.sm, paddingTop: space.xxl }}>
      <View style={styles.mark}>
        <Icon name="gamepad" size={26} color={colors.onAccent} strokeWidth={2.4} />
      </View>
      <Text variant="hero">{venue}</Text>
      <Text variant="body" color={colors.textMuted}>
        {subtitle}
      </Text>
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = themed(() => ({
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
    ...elevation('card'),
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: space.lg,
    justifyContent: 'center',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  padKey: {
    width: '30%',
    flexGrow: 1,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
