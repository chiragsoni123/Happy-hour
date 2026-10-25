import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  View,
} from 'react-native';

import { SettlePreview } from '@/components/CheckoutSheets';
import { balanceOf, statementFor } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { businessDayOf, formatClock, relativeDayLabel } from '@/domain/time';
import type { DueTransaction, PaymentMethod } from '@/domain/types';
import { useOpId } from '@/hooks/useNow';
import { profileName } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, radius, space, themed } from '@/theme';
import {
  Badge,
  Button,
  Card,
  digitsToPaise,
  Divider,
  EmptyState,
  Eyebrow,
  Header,
  Money,
  NumberPad,
  paiseToDigits,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

/**
 * A customer's statement. Every line is a ledger row, and the balance shown at the top
 * is the sum of those rows — the same arithmetic the customer can do on their own
 * fingers if they ask.
 */
export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);
  const { opId, renew } = useOpId();

  const [settling, setSettling] = useState(false);
  const [digits, setDigits] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');

  const customer = db.customers.find((c) => c.id === id) ?? null;
  const balance = useMemo(() => (customer ? balanceOf(db.due_transactions, customer.id) : 0), [db, customer]);
  const statement = useMemo(
    () => (customer ? statementFor(db.due_transactions, customer.id) : []),
    [db, customer],
  );

  if (!customer) {
    return (
      <Screen>
        <Header title="Customer" back />
        <EmptyState icon="people" title="That customer no longer exists" />
      </Screen>
    );
  }

  const paying = digitsToPaise(digits);

  const openSettle = () => {
    setDigits(paiseToDigits(balance));
    setMethod('CASH');
    setSettling(true);
  };

  const settle = async () => {
    const done = await run(
      (backend, actorId) =>
        backend.settleDue({
          actorId,
          customerId: customer.id,
          amount: paying,
          method,
          clientOpId: opId,
        }),
      { success: `${formatMoney(paying)} collected from ${customer.name}` },
    );
    if (done) {
      renew();
      setSettling(false);
      setDigits('');
    }
  };

  return (
    <>
      <Screen>
        <Header
          title={customer.name}
          eyebrow={customer.phone ?? 'Customer'}
          back
          right={balance > 0 ? <Badge label="Owes" color={colors.warn} /> : undefined}
        />

        <Card level={1} style={[styles.hero, balance <= 0 && { backgroundColor: colors.surfaceRaised }]}>
          <Eyebrow color={balance > 0 ? 'rgba(5,7,3,0.6)' : colors.textFaint}>
            {balance < 0 ? 'In credit' : 'Outstanding'}
          </Eyebrow>
          <Money
            value={Math.abs(balance)}
            variant="hero"
            color={balance > 0 ? colors.onAccent : colors.text}
            fancySymbol
          />
        </Card>

        {balance > 0 && can(actor?.role, 'due.settle') ? (
          <Button label="Settle payment" icon="wallet" tone="accent" size="lg" full onPress={openSettle} />
        ) : null}

        <Section title={`Ledger (${statement.length})`}>
          {statement.length === 0 ? (
            <EmptyState icon="receipt" title="No history yet" />
          ) : (
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {statement.map((entry, index) => (
                <View key={entry.transaction.id}>
                  {index > 0 ? <Divider /> : null}
                  <LedgerRow db={db} entry={entry.transaction} runningBalance={entry.runningBalance} />
                </View>
              ))}
            </Card>
          )}
        </Section>

        {customer.notes ? (
          <Card level={2}>
            <Eyebrow>Notes</Eyebrow>
            <Text variant="body" color={colors.textMuted}>
              {customer.notes}
            </Text>
          </Card>
        ) : null}
      </Screen>

      <Sheet
        visible={settling}
        onClose={() => setSettling(false)}
        eyebrow={customer.name}
        title="Settle payment"
        footer={
          <Button
            label={`Confirm ${formatMoney(paying)} by ${method}`}
            icon="check"
            tone={method === 'CASH' ? 'accent' : 'warn'}
            size="lg"
            full
            loading={busy}
            disabled={paying <= 0}
            onPress={() => void settle()}
          />
        }
      >
        <SettlePreview outstanding={balance} paying={paying} />

        <Segmented
          options={[
            { value: 'CASH', label: 'Cash' },
            { value: 'UPI', label: 'UPI' },
          ]}
          value={method}
          onChange={setMethod}
        />

        <NumberPad
          value={digits}
          onChange={setDigits}
          label="Collecting"
          quick={quickAmounts(balance)}
        />

        <Text variant="small" color={colors.textFaint}>
          Settlements are not counted as new revenue — the sale was already recorded when the due
          was created. This only moves money into the drawer.
        </Text>
      </Sheet>
    </>
  );
}

function quickAmounts(balance: number): number[] {
  const options = new Set<number>();
  if (balance > 0) options.add(balance);
  for (const amount of [10000, 20000, 50000, 100000]) {
    if (amount < balance) options.add(amount);
  }
  return [...options].sort((a, b) => a - b);
}

function LedgerRow({
  db,
  entry,
  runningBalance,
}: {
  db: ReturnType<typeof useDb>;
  entry: DueTransaction;
  runningBalance: number;
}) {
  const debit = entry.direction === 'DEBIT';
  const sale = entry.sale_id ? db.sales.find((s) => s.id === entry.sale_id) : null;
  const payment = entry.payment_id ? db.payments.find((p) => p.id === entry.payment_id) : null;

  const title = debit
    ? entry.reason === 'SALE_DUE'
      ? sale
        ? summariseSale(db, sale.id)
        : 'Due added'
      : 'Adjustment'
    : entry.reason === 'SETTLEMENT'
      ? `Paid by ${payment?.method ?? 'cash'}`
      : 'Sale voided';

  return (
    <View style={styles.ledgerRow}>
      <View style={[styles.marker, { backgroundColor: debit ? colors.warn : colors.brand }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {relativeDayLabel(businessDayOf(entry.created_at))} {formatClock(entry.created_at)} ·{' '}
          {profileName(db, entry.created_by)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Money
          value={debit ? entry.amount : -entry.amount}
          variant="bodyStrong"
          color={debit ? colors.warn : colors.brand}
          sign
        />
        <Text variant="small" color={colors.textFaint} tabular>
          {formatMoney(runningBalance)}
        </Text>
      </View>
    </View>
  );
}

function summariseSale(db: ReturnType<typeof useDb>, saleId: string): string {
  const items = db.sale_items.filter((i) => i.sale_id === saleId);
  if (items.length === 0) return 'Due added';
  const names = items.slice(0, 2).map((i) => i.name);
  const extra = items.length - names.length;
  return names.join(', ') + (extra > 0 ? ` +${extra}` : '');
}

const styles = themed(() => ({
  hero: {
    backgroundColor: colors.accent,
    gap: space.xs,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  marker: {
    width: 4,
    height: 34,
    borderRadius: radius.pill,
  },
}));
