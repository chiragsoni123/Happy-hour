import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { totalOutstanding } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import {
  cashPosition,
  gamingReport,
  productReport,
  staffReport,
} from '@/domain/reporting';
import { currentBusinessDay, formatDuration, relativeDayLabel, toDateKey } from '@/domain/time';
import { useDb } from '@/store/useStore';
import { colors, radius, space } from '@/theme';
import {
  Card,
  Divider,
  EmptyState,
  Eyebrow,
  Header,
  Money,
  Row,
  Screen,
  Section,
  Segmented,
  Text,
} from '@/ui';

/**
 * Everything here is recomputed from transactions on every render. There is no reporting
 * table to fall out of step with the ledger.
 */
export default function Reports() {
  const db = useDb();
  const today = currentBusinessDay();
  const [day, setDay] = useState(today);

  const position = useMemo(() => cashPosition(db, day), [db, day]);
  const gaming = useMemo(() => gamingReport(db, day), [db, day]);
  const products = useMemo(() => productReport(db, day), [db, day]);
  const staff = useMemo(() => staffReport(db, day), [db, day]);
  const outstanding = useMemo(() => totalOutstanding(db.due_transactions), [db]);

  const dayOptions = useMemo(() => {
    const days: { value: string; label: string }[] = [];
    for (let i = 0; i < 3; i += 1) {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      days.push({ value: key, label: relativeDayLabel(key, today) });
    }
    return days;
  }, [today]);

  const topProducts = products.slice(0, 8);
  const maxProductRevenue = topProducts[0]?.revenue ?? 1;

  return (
    <Screen>
      <Header title="Reports" eyebrow={relativeDayLabel(day, today)} back />

      <Segmented options={dayOptions} value={day} onChange={setDay} />

      <Card level={1} style={styles.hero}>
        <Eyebrow color="rgba(5,7,3,0.6)">Revenue</Eyebrow>
        <Money value={position.revenue} variant="hero" color={colors.onAccent} fancySymbol />
        <View style={styles.heroSplit}>
          <HeroCell label="Gaming" value={position.gamingRevenue} />
          <HeroCell label="Products" value={position.productRevenue} />
          <HeroCell label="Bills" value={position.saleCount} raw />
        </View>
      </Card>

      <Section title="Money in">
        <Card level={2} style={{ gap: space.md }}>
          <Line label="Cash sales" value={position.cashSales} tone={colors.cash} />
          <Line label="UPI sales" value={position.upiSales} tone={colors.upi} />
          <Line label="New dues" value={position.newDues} tone={colors.due} />
          <Divider />
          <Line label="Due settlements (not revenue)" value={position.cashSettlements + position.upiSettlements} tone={colors.brand} />
          <Line label="Cash expenses" value={-position.cashExpenses} tone={colors.danger} />
          <Divider />
          <Line label="Outstanding dues, all time" value={outstanding} tone={colors.warn} big />
        </Card>
      </Section>

      <Section title="Gaming">
        {gaming.length === 0 ? (
          <Card level={2}>
            <Text variant="body" color={colors.textMuted}>
              No games billed on this day.
            </Text>
          </Card>
        ) : (
          <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
            {gaming.map((row, index) => (
              <View key={row.gameTypeId}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={row.name}
                  subtitle={`${row.sessions} session${row.sessions === 1 ? '' : 's'} · ${formatDuration(row.minutes)}`}
                  value={formatMoney(row.revenue)}
                  valueColor={colors.accent}
                />
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Top products">
        {topProducts.length === 0 ? (
          <Card level={2}>
            <Text variant="body" color={colors.textMuted}>
              Nothing sold on this day.
            </Text>
          </Card>
        ) : (
          <Card level={2} style={{ gap: space.lg }}>
            {topProducts.map((row) => (
              <View key={row.productId} style={{ gap: space.sm }}>
                <View style={styles.barHead}>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text variant="small" color={colors.textMuted} tabular>
                    {row.quantity} sold
                  </Text>
                  <Money value={row.revenue} variant="bodyStrong" color={colors.accent} />
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.max(6, (row.revenue / maxProductRevenue) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Staff">
        {staff.length === 0 ? (
          <EmptyState icon="people" title="No activity on this day" />
        ) : (
          <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
            {staff.map((row, index) => (
              <View key={row.staffId}>
                {index > 0 ? <Divider /> : null}
                <View style={{ paddingVertical: space.md, gap: space.sm }}>
                  <View style={styles.barHead}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {row.name}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {row.transactions} bill{row.transactions === 1 ? '' : 's'}
                      {row.voids > 0 ? ` · ${row.voids} void` : ''}
                    </Text>
                  </View>
                  <View style={styles.chips}>
                    <Chip label="Cash" value={row.cashCollected} color={colors.cash} />
                    <Chip label="UPI" value={row.upiCollected} color={colors.upi} />
                    <Chip label="Dues" value={row.duesCreated} color={colors.due} />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

function HeroCell({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Eyebrow color="rgba(5,7,3,0.6)">{label}</Eyebrow>
      <Text variant="bodyStrong" color={colors.onAccent} tabular>
        {raw ? value : formatMoney(value)}
      </Text>
    </View>
  );
}

function Line({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: number;
  tone?: string;
  big?: boolean;
}) {
  return (
    <View style={styles.line}>
      <Text variant={big ? 'bodyStrong' : 'body'} color={big ? colors.text : colors.textMuted}>
        {label}
      </Text>
      <Money value={value} variant={big ? 'heading' : 'bodyStrong'} color={tone ?? colors.text} />
    </View>
  );
}

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text variant="eyebrow" color={color}>
        {label}
      </Text>
      <Text variant="small" color={colors.text} tabular>
        {formatMoney(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.accent,
    gap: space.xs,
  },
  heroSplit: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(5,7,3,0.18)',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  barHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
});
