import { useState } from 'react';
import { View } from 'react-native';

import { backendKind } from '@/data';
import { ROLE_BLURB, ROLE_LABEL } from '@/domain/permissions';
import type { Profile, Role } from '@/domain/types';
import { useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  Eyebrow,
  Field,
  Header,
  Row,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
  Toggle,
} from '@/ui';

const ROLES: { value: Role; label: string }[] = [
  { value: 'STAFF', label: 'Staff' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'OWNER', label: 'Owner' },
];

export default function Staff() {
  const db = useDb();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  // With Supabase each staff member has their own account, so there is no PIN to set and
  // no way to create someone else's login from here — they sign up themselves.
  const usesAccounts = backendKind() === 'supabase';

  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [active, setActive] = useState(true);

  const open = (profile: Profile | 'new') => {
    if (profile === 'new') {
      setName('');
      setPin('');
      setRole('STAFF');
      setActive(true);
    } else {
      setName(profile.full_name);
      setPin(profile.pin ?? '');
      setRole(profile.role);
      setActive(profile.active);
    }
    setEditing(profile);
  };

  const save = async () => {
    const done = await run(
      (backend, actorId) =>
        backend.upsertStaff({
          actorId,
          staff: {
            id: editing && editing !== 'new' ? editing.id : undefined,
            full_name: name,
            role,
            pin: usesAccounts ? '0000' : pin,
            active,
          },
        }),
      { success: `${name} saved` },
    );
    if (done) setEditing(null);
  };

  return (
    <>
      <Screen>
        <Header title="Staff" eyebrow={`${db.profiles.filter((p) => p.active).length} active`} back />

        {usesAccounts ? (
          <Card level={2} style={{ gap: space.sm }}>
            <Eyebrow color={colors.accent}>Adding someone</Eyebrow>
            <Text variant="small" color={colors.textMuted}>
              New staff install the app and create their own account, which starts as Staff. They
              appear in the list below straight away and you set their role here.
            </Text>
          </Card>
        ) : (
          <Button label="Add staff member" icon="plus" tone="accent" full onPress={() => open('new')} />
        )}

        <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
          {db.profiles.map((profile, index) => (
            <View key={profile.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={profile.full_name}
                subtitle={ROLE_BLURB[profile.role]}
                onPress={() => open(profile)}
                right={
                  <Badge
                    label={profile.active ? ROLE_LABEL[profile.role] : 'Inactive'}
                    color={profile.active ? colors.accent : colors.textFaint}
                  />
                }
              />
            </View>
          ))}
        </Card>

        <Section title="What each role can do">
          <Card level={2} style={{ gap: space.md }}>
            {ROLES.map((r) => (
              <View key={r.value} style={{ gap: 2 }}>
                <Eyebrow color={colors.accent}>{r.label}</Eyebrow>
                <Text variant="small" color={colors.textMuted}>
                  {ROLE_BLURB[r.value]}
                </Text>
              </View>
            ))}
            <Text variant="small" color={colors.textFaint}>
              Roles are also enforced in the database, so a modified app cannot get around them.
            </Text>
          </Card>
        </Section>
      </Screen>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        eyebrow={editing === 'new' ? 'New' : 'Edit'}
        title={editing === 'new' ? 'Add staff member' : name}
        footer={
          <Button
            label="Save"
            tone="accent"
            size="lg"
            full
            loading={busy}
            disabled={!name.trim() || (!usesAccounts && pin.length !== 4)}
            onPress={() => void save()}
          />
        }
      >
        <Field label="Name" value={name} onChangeText={setName} placeholder="Ravi" />
        {usesAccounts ? null : (
          <Field
            label="4 digit PIN"
            value={pin}
            onChangeText={(v) => setPin(v.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
          />
        )}
        <View style={{ gap: space.sm }}>
          <Eyebrow>Role</Eyebrow>
          <Segmented options={ROLES} value={role} onChange={setRole} />
          <Text variant="small" color={colors.textMuted}>
            {ROLE_BLURB[role]}
          </Text>
        </View>
        <Toggle
          label="Can sign in"
          value={active}
          onChange={setActive}
          hint="Turning this off keeps their history but blocks the account."
        />
      </Sheet>
    </>
  );
}
