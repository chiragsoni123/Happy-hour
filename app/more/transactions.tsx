import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { businessDayOf, formatClock, relativeDayLabel } from '@/domain/time';
import type { CheckoutMethod, Sale } from '@/domain/types';
import { profileName } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Header,
  Money,
  Row,
  Screen,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

type MethodFilter = 'ALL' | CheckoutMethod;

/**
 * Transaction search, and the only place a completed sale can be corrected. Nothing is
 * ever deleted: a wrong sale is voided, which reverses stock, payment and any due,
 * leaving both the original and the reversal on the record.
 */
export default function Transactions() {
  const db = useDb();
  const actor = useActor();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<MethodFilter>('ALL');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [reason, setReason] = useState('');

  const canVoid = can(actor?.role, 'sale.void');

  const sales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.sales
      .filter((s) => s.status !== 'OPEN')
      .filter((s) => method === 'ALL' || s.checkout_method === method)
      .filter((s) => {
        if (!q) return true;
        const customer = db.customers.find((c) => c.id === s.customer_id);
        const items = db.sale_items.filter((i) => i.sale_id === s.id);
        return (
          String(s.number).includes(q) ||
          (customer?.name.toLowerCase().includes(q) ?? false) ||
          items.some((i) => i.name.toLowerCase().includes(q)) ||
          profileName(db, s.completed_by).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.completed_at ?? b.opened_at).localeCompare(a.completed_at ?? a.opened_at))
      .slice(0, 60);
  }, [db, query, method]);

  const items = selected ? db.sale_items.filter((i) => i.sale_id === selected.id) : [];

  const voidSale = async () => {
    if (!selected) return;
    const done = await run(
      (backend, actorId) => backend.voidSale({ actorId, saleId: selected.id, reason }),
      { success: `Sale #${selected.number} voided` },
    );
    if (done) {
      setSelected(null);
      setReason('');
    }
  };

  return (
    <>
      <Screen>
        <Header title="Transactions" eyebrow={`${sales.length} shown`} back />

        <Field value={query} onChangeText={setQuery} placeholder="Bill number, customer, item, staff" icon="search" />

        <Segmented
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'CASH', label: 'Cash' },
            { value: 'UPI', label: 'UPI' },
            { value: 'DUE', label: 'Due' },
          ]}
          value={method}
          onChange={setMethod}
        />

        {sales.length === 0 ? (
          <EmptyState icon="receipt" title="Nothing matches" />
        ) : (
          <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
            {sales.map((sale, index) => {
              const customer = db.customers.find((c) => c.id === sale.customer_id);
              const voided = sale.status === 'VOIDED';
              return (
                <View key={sale.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={`#${sale.number} · ${customer?.name ?? 'Walk-in'}`}
                    subtitle={`${relativeDayLabel(sale.business_day)} ${formatClock(sale.completed_at ?? sale.opened_at)} · ${sale.checkout_method ?? '—'} · ${profileName(db, sale.completed_by)}`}
                    value={formatMoney(sale.total)}
                    valueColor={voided ? colors.textFaint : methodColor(sale.checkout_method)}
                    onPress={() => {
                      setSelected(sale);
                      setReason('');
                    }}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </Screen>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected ? relativeDayLabel(selected.business_day) : ''}
        title={selected ? `Bill #${selected.number}` : ''}
        footer={
          selected?.status === 'COMPLETED' && canVoid ? (
            <Button
              label="Void this sale"
              icon="alert"
              tone="danger"
              size="lg"
              full
              loading={busy}
              disabled={!reason.trim()}
              onPress={() => void voidSale()}
            />
          ) : null
        }
      >
        {selected ? (
          <>
            <Card level={2} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Money
                  value={selected.total}
                  variant="display"
                  color={selected.status === 'VOIDED' ? colors.textFaint : colors.text}
                  fancySymbol
                />
                <View style={{ flex: 1 }} />
                <Badge
                  label={selected.status}
                  color={selected.status === 'VOIDED' ? colors.danger : colors.brand}
                />
              </View>
              <Text variant="small" color={colors.textMuted}>
                {selected.checkout_method} · closed by {profileName(db, selected.completed_by)} at{' '}
                {formatClock(selected.completed_at ?? selected.opened_at)}
              </Text>
              {selected.status === 'VOIDED' ? (
                <Text variant="small" color={colors.danger}>
                  Voided by {profileName(db, selected.voided_by)}
                  {selected.voided_at ? ` on ${relativeDayLabel(businessDayOf(selected.voided_at))}` : ''}
                  {selected.void_reason ? `: ${selected.void_reason}` : ''}
                </Text>
              ) : null}
            </Card>

            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={item.name}
                    subtitle={
                      item.kind === 'GAMING'
                        ? `${item.quantity} min at ${formatMoney(item.unit_price)}/min`
                        : `${item.quantity} × ${formatMoney(item.unit_price)}`
                    }
                    value={formatMoney(item.line_total)}
                  />
                </View>
              ))}
            </Card>

            {selected.status === 'COMPLETED' && canVoid ? (
              <>
                <Field
                  label="Reason for voiding"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Wrong amount, duplicate entry"
                />
                <Text variant="small" color={colors.textFaint}>
                  Voiding returns the stock, cancels the payment and reverses the due if there was
                  one. The original sale stays visible with your name against the void.
                </Text>
              </>
            ) : null}

            {!canVoid ? (
              <Text variant="small" color={colors.textFaint}>
                Only a manager or the owner can correct a completed sale.
              </Text>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}

function methodColor(method: CheckoutMethod | null): string {
  if (method === 'CASH') return colors.cash;
  if (method === 'UPI') return colors.upi;
  if (method === 'DUE') return colors.due;
  return colors.text;
}
