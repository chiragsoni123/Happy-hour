import { useState } from 'react';
import { View } from 'react-native';

import { useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import { Button, Card, Eyebrow, Field, Header, Screen, Section, Text, Toggle } from '@/ui';

export default function Settings() {
  const db = useDb();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  const [venue, setVenue] = useState(db.settings.venue_name);
  const [vpa, setVpa] = useState(db.settings.upi_vpa ?? '');
  const [payee, setPayee] = useState(db.settings.upi_payee_name ?? '');
  const [lowStock, setLowStock] = useState(db.settings.low_stock_banner);

  const save = async () => {
    await run(
      (backend, actorId) =>
        backend.updateSettings({
          actorId,
          patch: {
            venue_name: venue.trim() || 'Happy Hour',
            upi_vpa: vpa.trim() || null,
            upi_payee_name: payee.trim() || null,
            low_stock_banner: lowStock,
          },
        }),
      { success: 'Settings saved' },
    );
  };

  return (
    <Screen>
      <Header title="Settings" eyebrow="Venue" back />

      <Field label="Venue name" value={venue} onChangeText={setVenue} placeholder="Happy Hour" />

      <Section title="UPI">
        <Field label="UPI ID" value={vpa} onChangeText={setVpa} placeholder="happyhour@okaxis" />
        <Field label="Payee name" value={payee} onChangeText={setPayee} placeholder="Happy Hour Gaming" />
        <Text variant="small" color={colors.textFaint}>
          Shown to staff on the UPI confirmation screen. Payment is still confirmed by a person —
          connecting a payment provider later replaces that step.
        </Text>
      </Section>

      <Section title="Behaviour">
        <Card level={2}>
          <Toggle
            label="Low stock banner on Home"
            value={lowStock}
            onChange={setLowStock}
            hint="Shows items at or below their alert level."
          />
        </Card>
      </Section>

      <Section title="Trading day">
        <Card level={2} style={{ gap: space.sm }}>
          <Eyebrow>Starts at {String(db.settings.business_day_start_hour).padStart(2, '0')}:00</Eyebrow>
          <Text variant="small" color={colors.textMuted}>
            A sale rung up at 1am belongs to the night before, so the drawer balances against the
            shift that actually took the money rather than against the calendar.
          </Text>
        </Card>
      </Section>

      <Section title="Backend">
        <Card level={2} style={{ gap: space.sm }}>
          <Eyebrow color={colors.accent}>On this device</Eyebrow>
          <Text variant="small" color={colors.textMuted}>
            Data is stored locally, which is why the app keeps taking sales when the connection
            drops. Connecting Supabase adds sync between phones, off-site backup, and enforcement
            of staff permissions in the database itself. The schema is ready in the project under
            supabase/migrations.
          </Text>
        </Card>
      </Section>

      <View style={{ height: space.sm }} />
      <Button label="Save settings" tone="accent" size="lg" full loading={busy} onPress={() => void save()} />
    </Screen>
  );
}
