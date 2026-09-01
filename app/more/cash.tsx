import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { cashPosition } from '@/domain/reporting';
import { currentBusinessDay, formatClock, relativeDayLabel } from '@/domain/time';
import type { ExpenseCategory } from '@/domain/types';
import { profileName } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import {
  Badge,
  Button,
  Card,
  digitsToPaise,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  Header,
  Money,
  NumberPad,
  Row,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'SUPPLIES', label: 'Supplies' },
  { value: 'FOOD', label: 'Food' },
  { value: 'MAINTENANCE', label: 'Repairs' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * The screen that solves the original problem: what the drawer *should* hold, worked
 * out from every cash movement recorded today, next to what is actually in it.
 * A mismatch is shown, never hidden or quietly absorbed.
 */
export default function CashDrawer() {
  const db = useDb();
  const actor = useActor();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);
  const day = currentBusinessDay();

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [floatOpen, setFloatOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const [digits, setDigits] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('SUPPLIES');
  const [countNote, setCountNote] = useState('');

  const position = useMemo(() => cashPosition(db, day), [db, day]);
  const closing = db.daily_closings.find((c) => c.business_day === day);
  const expenses = db.cash_expenses
    .filter((e) => e.business_day === day)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const history = db.daily_closings
    .filter((c) => c.status === 'CLOSED')
    .sort((a, b) => b.business_day.localeCompare(a.business_day))
    .slice(0, 10);

  const amount = digitsToPaise(digits);
  const difference = amount - position.expectedCash;

  const openSheet = (which: 'expense' | 'float' | 'close') => {
    setDigits(which === 'float' ? String(Math.round(position.openingCash / 100)) : '');
    setReason('');
    setCountNote('');
    if (which === 'expense') setExpenseOpen(true);
    if (which === 'float') setFloatOpen(true);
    if (which === 'close') setCloseOpen(true);
  };

  const addExpense = async () => {
    const done = await run(
      (backend, actorId) => backend.createExpense({ actorId, amount, category, reason }),
      { success: `${formatMoney(amount)} cash out recorded` },
    );
    if (done) {
      setExpenseOpen(false);
      setDigits('');
      setReason('');
    }
  };

  const saveFloat = async () => {
    const done = await run(
      (backend, actorId) => backend.setOpeningCash({ actorId, day, amount }),
      { success: 'Opening cash updated' },
    );
    if (done) setFloatOpen(false);
  };

  const closeDay = async () => {
    const done = await run(
      (backend, actorId) =>
        backend.closeDay({ actorId, day, actualCash: amount, note: countNote || undefined }),
      { success: 'Day closed' },
    );
    if (done) {
      setCloseOpen(false);
      setDigits('');
    }
  };

  /**
   * Reopening exists because a real correction sometimes has to be made after closing.
   * It is owner-only, needs a written reason, and lands in the audit log — the closed
   * figures are simply recomputed when the day is closed again.
   */
  const reopenDay = async () => {
    const done = await run(
      (backend, actorId) => backend.reopenDay({ actorId, day, reason }),
      { success: 'Day reopened' },
    );
    if (done) {
      setReopenOpen(false);
      setReason('');
    }
  };

  return (
    <>
      <Screen>
        <Header
          title="Cash drawer"
          eyebrow={relativeDayLabel(day)}
          back
          right={
            closing?.status === 'CLOSED' ? <Badge label="Closed" color={colors.warn} /> : undefined
          }
        />

        <Card level={1} style={styles.hero}>
          <Eyebrow color="rgba(5,7,3,0.6)">Expected in the drawer</Eyebrow>
          <Money value={position.expectedCash} variant="hero" color={colors.onAccent} fancySymbol />
        </Card>

        <Card level={2} style={{ gap: space.md }}>
          <Line label="Opening float" value={position.openingCash} />
          <Line label="Cash sales" value={position.cashSales} sign />
          <Line label="Cash due settlements" value={position.cashSettlements} sign />
          <Line label="Cash expenses" value={-position.cashExpenses} sign />
          <View style={styles.rule} />
          <Line label="Expected cash" value={position.expectedCash} big />
          {closing?.status === 'CLOSED' ? (
            <>
              <Line label="Counted" value={closing.actual_cash ?? 0} big />
              <Line
                label="Difference"
                value={closing.difference ?? 0}
                big
                tone={
                  (closing.difference ?? 0) === 0
                    ? colors.brand
                    : (closing.difference ?? 0) > 0
                      ? colors.warn
                      : colors.danger
                }
                sign
              />
            </>
          ) : null}
        </Card>

        <View style={styles.actions}>
          <Button
            label="Cash expense"
            icon="minus"
            tone="neutral"
            onPress={() => openSheet('expense')}
            disabled={!can(actor?.role, 'expense.create') || closing?.status === 'CLOSED'}
            style={{ flex: 1 }}
          />
          <Button
            label="Opening float"
            icon="wallet"
            tone="neutral"
            onPress={() => openSheet('float')}
            disabled={!can(actor?.role, 'day.open') || closing?.status === 'CLOSED'}
            style={{ flex: 1 }}
          />
        </View>

        {can(actor?.role, 'day.close') && closing?.status !== 'CLOSED' ? (
          <Button
            label="Count and close the day"
            icon="check"
            tone="accent"
            size="lg"
            full
            onPress={() => openSheet('close')}
          />
        ) : null}

        {closing?.status === 'CLOSED' && can(actor?.role, 'day.reopen') ? (
          <Button
            label="Reopen the day"
            icon="history"
            tone="ghost"
            full
            onPress={() => {
              setReason('');
              setReopenOpen(true);
            }}
          />
        ) : null}

        <Section title={`Today's expenses (${expenses.length})`}>
          {expenses.length === 0 ? (
            <Card level={2}>
              <Text variant="body" color={colors.textMuted}>
                No cash has left the drawer today.
              </Text>
            </Card>
          ) : (
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {expenses.map((expense, index) => (
                <View key={expense.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={expense.reason}
                    subtitle={`${formatClock(expense.created_at)} · ${profileName(db, expense.created_by)}${
                      expense.status === 'VOIDED' ? ' · voided' : ''
                    }`}
                    value={formatMoney(-expense.amount)}
                    valueColor={expense.status === 'VOIDED' ? colors.textFaint : colors.danger}
                  />
                </View>
              ))}
            </Card>
          )}
        </Section>

        {history.length > 0 ? (
          <Section title="Closed days">
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {history.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={relativeDayLabel(row.business_day, day)}
                    subtitle={`Counted ${formatMoney(row.actual_cash ?? 0)} · closed by ${profileName(db, row.closed_by)}`}
                    value={formatMoney(row.difference ?? 0, { sign: true })}
                    valueColor={
                      (row.difference ?? 0) === 0
                        ? colors.brand
                        : (row.difference ?? 0) > 0
                          ? colors.warn
                          : colors.danger
                    }
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : (
          <EmptyState icon="history" title="No closed days yet" />
        )}
      </Screen>

      <Sheet
        visible={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        eyebrow="Cash out"
        title="Record an expense"
        footer={
          <Button
            label={`Record ${formatMoney(amount)} out`}
            tone="accent"
            size="lg"
            full
            loading={busy}
            disabled={amount <= 0 || !reason.trim()}
            onPress={() => void addExpense()}
          />
        }
      >
        <Field label="What was it for" value={reason} onChangeText={setReason} placeholder="Milk, cleaning, repair" />
        <View style={{ gap: space.sm }}>
          <Eyebrow>Category</Eyebrow>
          <Segmented options={EXPENSE_CATEGORIES} value={category} onChange={setCategory} />
        </View>
        <NumberPad value={digits} onChange={setDigits} label="Amount" quick={[5000, 10000, 20000, 50000]} />
        <Text variant="small" color={colors.textFaint}>
          Expenses are cash movements, never sales. They reduce the expected drawer and appear in
          the day&apos;s reconciliation.
        </Text>
      </Sheet>

      <Sheet
        visible={floatOpen}
        onClose={() => setFloatOpen(false)}
        eyebrow="Start of day"
        title="Opening cash"
        footer={
          <Button
            label="Save opening float"
            tone="accent"
            size="lg"
            full
            loading={busy}
            onPress={() => void saveFloat()}
          />
        }
      >
        <NumberPad value={digits} onChange={setDigits} label="In the drawer at open" quick={[100000, 200000, 500000]} />
        <Text variant="small" color={colors.textFaint}>
          Carried forward automatically from the last closed day. Correct it here if the float
          was different.
        </Text>
      </Sheet>

      <Sheet
        visible={closeOpen}
        onClose={() => setCloseOpen(false)}
        eyebrow="End of day"
        title="Count the drawer"
        footer={
          <Button
            label="Close the day"
            icon="lock"
            tone={difference === 0 ? 'accent' : 'warn'}
            size="lg"
            full
            loading={busy}
            disabled={digits === ''}
            onPress={() => void closeDay()}
          />
        }
      >
        <Card level={2} style={{ gap: space.md }}>
          <Line label="Expected" value={position.expectedCash} />
          <Line label="Counted" value={amount} />
          <View style={styles.rule} />
          <Line
            label={difference === 0 ? 'Balanced' : difference > 0 ? 'Extra in drawer' : 'Short'}
            value={difference}
            big
            sign
            tone={difference === 0 ? colors.brand : difference > 0 ? colors.warn : colors.danger}
          />
        </Card>

        {difference !== 0 && digits !== '' ? (
          <Card level={2} accentEdge={colors.danger}>
            <Text variant="bodyStrong">
              {formatMoney(Math.abs(difference))} {difference > 0 ? 'more' : 'less'} than expected.
            </Text>
            <Text variant="small" color={colors.textMuted}>
              Close anyway if the count is right — the difference is recorded against your name so
              it can be looked into, rather than quietly disappearing.
            </Text>
          </Card>
        ) : null}

        <NumberPad value={digits} onChange={setDigits} label="Counted in the drawer" />
        <Field label="Note (optional)" value={countNote} onChangeText={setCountNote} placeholder="Anything worth remembering" />
      </Sheet>

      <Sheet
        visible={reopenOpen}
        onClose={() => setReopenOpen(false)}
        eyebrow={relativeDayLabel(day)}
        title="Reopen the day"
        footer={
          <Button
            label="Reopen"
            icon="history"
            tone="warn"
            size="lg"
            full
            loading={busy}
            disabled={!reason.trim()}
            onPress={() => void reopenDay()}
          />
        }
      >
        <Card level={2} accentEdge={colors.warn}>
          <Text variant="bodyStrong">The counted figures will be recalculated.</Text>
          <Text variant="small" color={colors.textMuted}>
            Use this only to correct a real mistake. The reopen, your name and this reason are
            written to the audit log, and the day has to be counted and closed again afterwards.
          </Text>
        </Card>
        <Field
          label="Why is this day being reopened"
          value={reason}
          onChangeText={setReason}
          placeholder="Sale entered against the wrong day"
          autoFocus
        />
      </Sheet>
    </>
  );
}

function Line({
  label,
  value,
  big,
  sign,
  tone,
}: {
  label: string;
  value: number;
  big?: boolean;
  sign?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.line}>
      <Text variant={big ? 'bodyStrong' : 'body'} color={big ? colors.text : colors.textMuted}>
        {label}
      </Text>
      <Money
        value={value}
        variant={big ? 'title' : 'bodyStrong'}
        color={tone ?? colors.text}
        sign={sign && value > 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.accent,
    gap: space.xs,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  rule: {
    height: 1,
    backgroundColor: colors.hairline,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
});
