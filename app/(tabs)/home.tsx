import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { cashPosition } from '@/domain/reporting';
import { currentBusinessDay, formatClock, formatStopwatch, greeting, secondsBetween } from '@/domain/time';
import { useNow } from '@/hooks/useNow';
import { activeSessions, lowStockProducts, openBills, type BillView } from '@/store/selectors';
import { useActor, useDb } from '@/store/useStore';
import { colors, space, statusColors } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  Eyebrow,
  Icon,
  Money,
  Row,
  Screen,
  Section,
  Text,
} from '@/ui';

/**
 * Home answers one question: what is happening right now? Live games first, then the
 * bills that are still open, then today's money. Nothing here needs interpretation.
 */
export default function Home() {
  const db = useDb();
  const actor = useActor();
  const router = useRouter();
  const now = useNow();
  const day = currentBusinessDay();

  const sessions = useMemo(() => activeSessions(db, now), [db, now]);
  const bills = useMemo(() => openBills(db, now), [db, now]);
  const position = useMemo(() => cashPosition(db, day), [db, day]);
  const lowStock = useMemo(() => lowStockProducts(db), [db]);
  const closed = db.daily_closings.find((c) => c.business_day === day)?.status === 'CLOSED';

  const seeFullMoney = can(actor?.role, 'report.full');

  return (
    <Screen tabBarPadding>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>{db.settings.venue_name}</Eyebrow>
          <Text variant="title">
            {greeting()}, {actor?.full_name.split(' ')[0] ?? 'there'}
          </Text>
        </View>
        {closed ? <Badge label="Day closed" color={colors.warn} /> : null}
      </View>

      <Card level={1} style={styles.heroCard}>
        <Eyebrow color={colors.onAccent}>Today&apos;s sales</Eyebrow>
        <Money value={position.revenue} variant="hero" color={colors.onAccent} fancySymbol />
        <View style={styles.heroSplit}>
          <HeroStat label="Gaming" value={position.gamingRevenue} />
          <View style={styles.heroRule} />
          <HeroStat label="Products" value={position.productRevenue} />
          <View style={styles.heroRule} />
          <HeroStat label="Bills" value={position.saleCount} raw />
        </View>
      </Card>

      <View style={styles.quickRow}>
        <Button
          label="New sale"
          icon="plus"
          tone="accent"
          size="lg"
          onPress={() => router.push('/bill/new')}
          style={{ flex: 1 }}
        />
        <Button
          label="Start game"
          icon="play"
          tone="neutral"
          size="lg"
          onPress={() => router.push('/(tabs)/games')}
          style={{ flex: 1 }}
        />
      </View>

      <Section
        title={`Active games (${sessions.length})`}
        action={{ label: 'All tables', onPress: () => router.push('/(tabs)/games') }}
      >
        {sessions.length === 0 ? (
          <Card level={2}>
            <Text variant="body" color={colors.textMuted}>
              Nothing running. Tap Start game to put a console or table on the clock.
            </Text>
          </Card>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.md, paddingRight: space.xl }}
            style={{ marginHorizontal: -space.xl, paddingHorizontal: space.xl }}
          >
            {sessions.map((view) => (
              <Card
                key={view.session.id}
                level={2}
                style={styles.sessionCard}
                accentEdge={statusColors.IN_USE}
                onPress={() => router.push(`/bill/${view.sale.id}`)}
              >
                <View style={styles.sessionHead}>
                  <Icon name={view.gameType.glyph === 'pool' ? 'pool' : 'gamepad'} size={20} color={colors.accent} />
                  <Text variant="heading">{view.resource.label}</Text>
                </View>
                <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                  {view.customer?.name ?? 'Walk-in'} · from {formatClock(view.session.started_at)}
                </Text>
                <Text variant="display" color={colors.accent} tabular>
                  {formatStopwatch(secondsBetween(view.session.started_at, now))}
                </Text>
                <Money value={view.priced.amount} variant="heading" />
              </Card>
            ))}
          </ScrollView>
        )}
      </Section>

      {bills.length > 0 ? (
        <Section title={`Open bills (${bills.length})`}>
          <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
            {bills.map((bill, index) => (
              <View key={bill.sale.id}>
                {index > 0 ? <Divider /> : null}
                <Row
                  title={bill.customer?.name ?? bill.sale.label ?? `Bill #${bill.sale.number}`}
                  subtitle={`${describeBill(bill)} · opened ${formatClock(bill.sale.opened_at)}`}
                  value={formatMoney(bill.runningTotal)}
                  valueColor={colors.accent}
                  onPress={() => router.push(`/bill/${bill.sale.id}`)}
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section
        title="Today's collection"
        action={
          can(actor?.role, 'day.close')
            ? { label: 'Cash drawer', onPress: () => router.push('/more/cash') }
            : undefined
        }
      >
        <Card level={2} style={{ gap: space.lg }}>
          <View style={styles.collectRow}>
            <Collect label="Cash" value={position.cashSales} color={colors.cash} />
            <Collect label="UPI" value={position.upiSales} color={colors.upi} />
            <Collect label="New dues" value={position.newDues} color={colors.due} />
          </View>
          {seeFullMoney ? (
            <>
              <Divider />
              <View style={styles.collectRow}>
                <Collect label="Settled" value={position.cashSettlements + position.upiSettlements} color={colors.brand} />
                <Collect label="Expenses" value={-position.cashExpenses} color={colors.danger} />
                <Collect label="Expected cash" value={position.expectedCash} color={colors.text} />
              </View>
            </>
          ) : null}
        </Card>
      </Section>

      {lowStock.length > 0 && db.settings.low_stock_banner ? (
        <Card level={2} accentEdge={colors.warn} onPress={() => router.push('/more/inventory')}>
          <View style={styles.warnRow}>
            <Icon name="alert" size={22} color={colors.warn} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{lowStock.length} item{lowStock.length === 1 ? '' : 's'} running low</Text>
              <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                {lowStock.slice(0, 4).map((p) => `${p.name} (${p.stock})`).join(', ')}
              </Text>
            </View>
            <Icon name="chevron" size={16} color={colors.textFaint} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

/** "1 game running", "3 items", or both — a bill on the clock is never just "0 items". */
function describeBill(bill: BillView): string {
  const parts: string[] = [];
  if (bill.activeSessions.length > 0) {
    parts.push(`${bill.activeSessions.length} game${bill.activeSessions.length === 1 ? '' : 's'} running`);
  }
  if (bill.items.length > 0) {
    parts.push(`${bill.items.length} item${bill.items.length === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Empty';
}

function HeroStat({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Eyebrow color="rgba(5,7,3,0.6)">{label}</Eyebrow>
      <Text variant="bodyStrong" color={colors.onAccent} tabular>
        {raw ? value : formatMoney(value)}
      </Text>
    </View>
  );
}

function Collect({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <Money value={value} variant="heading" color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  heroCard: {
    backgroundColor: colors.accent,
    gap: space.sm,
  },
  heroSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.md,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(5,7,3,0.18)',
  },
  heroRule: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(5,7,3,0.18)',
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  sessionCard: {
    width: 190,
    gap: space.xs,
  },
  sessionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  collectRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
