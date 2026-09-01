import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { can, ROLE_LABEL, type Permission } from '@/domain/permissions';
import { currentBusinessDay } from '@/domain/time';
import { cashPosition } from '@/domain/reporting';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  Eyebrow,
  Money,
  Row,
  Screen,
  Section,
  Text,
  type IconName,
} from '@/ui';

interface Entry {
  href: string;
  title: string;
  subtitle: string;
  icon: IconName;
  permission: Permission;
}

const ENTRIES: Entry[] = [
  {
    href: '/more/cash',
    title: 'Cash drawer',
    subtitle: 'Opening float, expenses, close the day',
    icon: 'cash',
    permission: 'expense.create',
  },
  {
    href: '/more/reports',
    title: 'Reports',
    subtitle: 'Daily summary, gaming, products, staff',
    icon: 'chart',
    permission: 'report.full',
  },
  {
    href: '/more/transactions',
    title: 'Transactions',
    subtitle: 'Search and void',
    icon: 'receipt',
    permission: 'transaction.search',
  },
  {
    href: '/more/inventory',
    title: 'Inventory',
    subtitle: 'Stock levels and movements',
    icon: 'box',
    permission: 'inventory.read',
  },
  {
    href: '/more/products',
    title: 'Products and pricing',
    subtitle: 'Catalogue and game rates',
    icon: 'snack',
    permission: 'product.manage',
  },
  {
    href: '/more/staff',
    title: 'Staff',
    subtitle: 'Accounts, roles and PINs',
    icon: 'people',
    permission: 'staff.manage',
  },
  {
    href: '/more/audit',
    title: 'Audit log',
    subtitle: 'Who did what, and when',
    icon: 'history',
    permission: 'audit.read',
  },
  {
    href: '/more/settings',
    title: 'Settings',
    subtitle: 'Venue name, UPI, trading day',
    icon: 'settings',
    permission: 'settings.manage',
  },
];

export default function More() {
  const db = useDb();
  const actor = useActor();
  const router = useRouter();
  const signOut = useStore((s) => s.signOut);
  const day = currentBusinessDay();
  const position = cashPosition(db, day);

  const visible = ENTRIES.filter((entry) => can(actor?.role, entry.permission));

  return (
    <Screen tabBarPadding>
      <View style={{ gap: 2 }}>
        <Eyebrow>{db.settings.venue_name}</Eyebrow>
        <Text variant="title">More</Text>
      </View>

      <Card level={2} style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{actor?.full_name}</Text>
            <Text variant="small" color={colors.textMuted}>
              Signed in on this device
            </Text>
          </View>
          <Badge label={actor ? ROLE_LABEL[actor.role] : ''} color={colors.accent} />
        </View>
        <Divider />
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Eyebrow>Expected cash</Eyebrow>
            <Money value={position.expectedCash} variant="heading" color={colors.cash} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Eyebrow>Day</Eyebrow>
            <Text variant="heading" color={position.dayOpen ? colors.brand : colors.warn}>
              {position.dayOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>
      </Card>

      <Section title="Manage">
        <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
          {visible.map((entry, index) => (
            <View key={entry.href}>
              {index > 0 ? <Divider /> : null}
              <Row
                title={entry.title}
                subtitle={entry.subtitle}
                icon={entry.icon}
                iconColor={colors.accent}
                onPress={() => router.push(entry.href as never)}
              />
            </View>
          ))}
        </Card>
      </Section>

      <Card level={2} style={{ gap: space.sm }}>
        <Eyebrow>Data</Eyebrow>
        <Text variant="small" color={colors.textMuted}>
          Everything is stored on this device right now, so the app keeps working when the
          internet does not. Connecting Supabase will sync it across phones and back it up.
        </Text>
      </Card>

      <Button
        label="Sign out"
        icon="lock"
        tone="ghost"
        full
        onPress={() => {
          void signOut();
          router.replace('/sign-in');
        }}
      />
    </Screen>
  );
}
