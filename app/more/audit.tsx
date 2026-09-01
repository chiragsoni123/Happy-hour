import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { businessDayOf, formatClock, relativeDayLabel } from '@/domain/time';
import { profileName } from '@/store/selectors';
import { useDb } from '@/store/useStore';
import { colors, radius, space } from '@/theme';
import { Card, Divider, EmptyState, Field, Header, Screen, Text } from '@/ui';

const TONE: Record<string, string> = {
  SALE_VOIDED: colors.danger,
  PAYMENT_VOIDED: colors.danger,
  CASH_EXPENSE_VOIDED: colors.danger,
  DAY_CLOSED: colors.warn,
  PRICE_CHANGED: colors.warn,
  STAFF_ROLE_CHANGED: colors.warn,
  DUE_CREATED: colors.due,
  DUE_SETTLED: colors.brand,
  PAYMENT_CREATED: colors.accent,
};

/** Append-only record of everything that mattered, newest first. */
export default function Audit() {
  const db = useDb();
  const [query, setQuery] = useState('');

  const logs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.audit_logs
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter(
        (log) =>
          !q ||
          log.action.toLowerCase().includes(q) ||
          log.summary.toLowerCase().includes(q) ||
          profileName(db, log.actor_id).toLowerCase().includes(q),
      )
      .slice(0, 120);
  }, [db, query]);

  return (
    <Screen>
      <Header title="Audit log" eyebrow={`${db.audit_logs.length} entries`} back />

      <Field value={query} onChangeText={setQuery} placeholder="Search action or staff" icon="search" />

      {logs.length === 0 ? (
        <EmptyState icon="history" title="Nothing recorded yet" />
      ) : (
        <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
          {logs.map((log, index) => (
            <View key={log.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <View style={[styles.marker, { backgroundColor: TONE[log.action] ?? colors.hairline }]} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="eyebrow" color={TONE[log.action] ?? colors.textMuted}>
                    {log.action.replace(/_/g, ' ')}
                  </Text>
                  <Text variant="bodyStrong">{log.summary}</Text>
                  <Text variant="small" color={colors.textFaint}>
                    {profileName(db, log.actor_id)} ·{' '}
                    {relativeDayLabel(businessDayOf(log.created_at))} {formatClock(log.created_at)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
  },
  marker: {
    width: 4,
    borderRadius: radius.pill,
  },
});
