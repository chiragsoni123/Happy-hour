import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  View,
} from 'react-native';

import { CustomerPicker } from '@/components/CustomerPicker';
import { DueConfirmSheet, UpiConfirmSheet } from '@/components/CheckoutSheets';
import { GameAmountSheet } from '@/components/GameAmountSheet';
import { balanceOf } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { formatClock, formatDuration, formatStopwatch, secondsBetween } from '@/domain/time';
import { TARIFF_LABEL } from '@/domain/pricing';
import type { CheckoutMethod, ID, Product } from '@/domain/types';
import { useNow, useOpId } from '@/hooks/useNow';
import { useTariff } from '@/hooks/useTariff';
import { billView, catalogue, resourceBoard } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, radius, space, themed } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  Header,
  Icon,
  Money,
  PaymentKeys,
  Screen,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

/**
 * The open bill: the one screen where a sale is actually built.
 *
 * `id` is either an existing bill or the literal `new`. A `new` bill is not written to
 * the database until the first item is added, so backing out of the sale screen never
 * leaves an empty bill behind for someone to reconcile later.
 */
export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const router = useRouter();
  const now = useNow();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);
  const notify = useStore((s) => s.notify);
  const { opId, renew } = useOpId();

  const [saleId, setSaleId] = useState<ID | null>(id && id !== 'new' ? id : null);
  const [query, setQuery] = useState('');
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<CheckoutMethod | null>(null);
  const [addingGame, setAddingGame] = useState(false);
  /** Session id whose charge is being set: on stopping it, or correcting it afterwards. */
  const [stoppingId, setStoppingId] = useState<ID | null>(null);
  const [correctingId, setCorrectingId] = useState<ID | null>(null);
  const { period, setPeriod } = useTariff();

  /**
   * Checkout and discard both finish the bill. Dismissing returns to the screen the bill
   * was opened from, instead of stacking another Home on top of the one already there.
   */
  const leaveBill = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/(tabs)/home');
  }, [router]);

  const bill = useMemo(() => (saleId ? billView(db, saleId, now) : null), [db, saleId, now]);
  const groups = useMemo(() => catalogue(db), [db]);
  const board = useMemo(() => resourceBoard(db, now), [db, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        products: group.products.filter((p) => p.name.toLowerCase().includes(q)),
      }))
      .filter((group) => group.products.length > 0);
  }, [groups, query]);

  const total = bill?.runningTotal ?? 0;
  const hasRunningGame = (bill?.activeSessions.length ?? 0) > 0;

  /**
   * A bill is either a table's or the counter's, never both in the staff member's head.
   * Table bills start from Games; counter sales start from the Sale button. Telling them
   * apart loudly is what stops a walk-in's crisps landing on somebody's PS5 tab.
   */
  const tableLabels = useMemo(() => {
    if (!bill) return [];
    const ids = new Set(
      db.gaming_sessions
        .filter((g) => g.sale_id === bill.sale.id && g.status !== 'VOIDED')
        .map((g) => g.resource_id),
    );
    return db.game_resources.filter((r) => ids.has(r.id)).map((r) => r.label);
  }, [db, bill]);
  const isTableBill = tableLabels.length > 0;
  const billName = isTableBill ? `${tableLabels.join(' + ')}'s bill` : 'Counter sale';
  const customerBalance = bill?.customer ? balanceOf(db.due_transactions, bill.customer.id) : 0;

  /** Creates the bill lazily on the first tap, then adds the product to it. */
  const addProduct = useCallback(
    async (product: Product) => {
      let target = saleId;
      if (!target) {
        const created = await run((backend, actorId) => backend.openBill({ actorId }));
        if (!created) return;
        target = created.sale.id;
        setSaleId(target);
      }
      await run((backend, actorId) =>
        backend.addProductToBill({ actorId, saleId: target, productId: product.id, quantity: 1 }),
      );
    },
    [run, saleId],
  );

  const changeQty = async (itemId: ID, quantity: number) => {
    await run((backend, actorId) => backend.changeBillItemQuantity({ actorId, itemId, quantity }));
  };

  const attachCustomer = async (customerId: ID) => {
    setPickingCustomer(false);
    if (!saleId) return;
    await run((backend, actorId) => backend.setBillCustomer({ actorId, saleId, customerId }));
    if (pendingMethod === 'DUE') setPendingMethod('DUE');
  };

  const startGameHere = async (resourceId: ID) => {
    setAddingGame(false);
    let target = saleId;
    if (!target) {
      const created = await run((backend, actorId) => backend.openBill({ actorId }));
      if (!created) return;
      target = created.sale.id;
      setSaleId(target);
    }
    await run((backend, actorId) =>
      backend.startSession({
        actorId,
        resourceId,
        period,
        saleId: target,
        customerId: bill?.customer?.id ?? null,
      }),
    );
  };

  const stopGame = async (amount: number) => {
    const sessionId = stoppingId;
    if (!sessionId) return;
    await run((backend, actorId) => backend.stopSession({ actorId, sessionId, amount }));
    setStoppingId(null);
  };

  const correctGame = async (amount: number) => {
    const sessionId = correctingId;
    if (!sessionId) return;
    await run((backend, actorId) => backend.setGamingAmount({ actorId, sessionId, amount }), {
      success: `Game time set to ${formatMoney(amount)}`,
    });
    setCorrectingId(null);
  };

  const pick = (method: CheckoutMethod) => {
    if (!bill || bill.items.length === 0) {
      notify('error', 'Add something to the bill first.');
      return;
    }
    if (hasRunningGame) {
      notify('error', 'Stop the running game before taking payment.');
      return;
    }
    if (method === 'CASH') {
      void checkout('CASH');
      return;
    }
    if (method === 'DUE' && !bill.customer) {
      setPendingMethod('DUE');
      setPickingCustomer(true);
      return;
    }
    setPendingMethod(method);
  };

  const checkout = async (method: CheckoutMethod) => {
    if (!saleId) return;
    const result = await run(
      (backend, actorId) =>
        backend.completeSale({
          actorId,
          saleId,
          method,
          customerId: bill?.customer?.id ?? null,
          clientOpId: opId,
        }),
      {
        success:
          method === 'DUE'
            ? `Added ${formatMoney(total)} to ${bill?.customer?.name ?? 'the tab'}`
            : `${formatMoney(total)} collected by ${method}`,
      },
    );
    setPendingMethod(null);
    if (result) {
      renew();
      leaveBill();
    }
  };

  const discard = async () => {
    if (!saleId) {
      router.back();
      return;
    }
    const done = await run((backend, actorId) => backend.discardBill({ actorId, saleId }), {
      success: 'Bill discarded',
    });
    if (done) leaveBill();
  };

  const availableResources = board.filter((v) => v.resource.status === 'AVAILABLE');
  const stopSession = bill?.activeSessions.find((v) => v.session.id === stoppingId) ?? null;
  const correctSession = correctingId
    ? (db.gaming_sessions.find((s) => s.id === correctingId) ?? null)
    : null;

  return (
    <>
      <Screen scroll={false} style={{ paddingBottom: 0 }} contentStyle={{ flex: 1, gap: space.lg }}>
        <Header
          title={bill ? billName : 'New counter sale'}
          eyebrow={
            bill
              ? `Bill #${bill.sale.number} · opened ${formatClock(bill.sale.opened_at)}`
              : 'Tap what they bought, then tap how they paid'
          }
          back
          right={
            saleId ? (
              <Pressable onPress={() => void discard()} hitSlop={12} accessibilityRole="button">
                <Icon name="trash" size={20} color={colors.textFaint} />
              </Pressable>
            ) : null
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: space.lg, paddingBottom: space.lg }}
        >
          {isTableBill ? (
            <Card level={2} accentEdge={colors.accent} style={styles.identity}>
              <Icon name="gamepad" size={20} color={colors.accentText} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">Everything here goes on {tableLabels.join(' + ')}</Text>
                <Text variant="small" color={colors.textMuted}>
                  Selling to someone else? Start a separate sale.
                </Text>
              </View>
              <Button
                label="New sale"
                icon="plus"
                tone="neutral"
                size="sm"
                onPress={() => router.push('/bill/new')}
              />
            </Card>
          ) : null}

          {bill && (bill.items.length > 0 || bill.activeSessions.length > 0) ? (
            <Card level={2} style={{ gap: space.sm }}>
              <View style={styles.billHead}>
                <Pressable
                  onPress={() => setPickingCustomer(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.customerChip}
                >
                  <Icon name="people" size={16} color={bill.customer ? colors.accentText : colors.textFaint} />
                  <Text variant="small" color={bill.customer ? colors.text : colors.textFaint}>
                    {bill.customer?.name ?? 'Add customer'}
                  </Text>
                </Pressable>
                {bill.customer && customerBalance > 0 ? (
                  <Badge label={`Owes ${formatMoney(customerBalance)}`} color={colors.warn} />
                ) : null}
              </View>

              {bill.activeSessions.map((view) => (
                <View key={view.session.id} style={styles.liveRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{view.resource.label}</Text>
                    <Text variant="small" color={colors.accentText} tabular>
                      {formatStopwatch(secondsBetween(view.session.started_at, now))} running ·{' '}
                      {formatMoney(view.priced.amount)}
                    </Text>
                  </View>
                  <Button
                    label="Stop"
                    icon="stop"
                    tone="accent"
                    size="sm"
                    onPress={() => setStoppingId(view.session.id)}
                  />
                </View>
              ))}

              {bill.items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 || bill.activeSessions.length > 0 ? <Divider /> : null}
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong">{item.name}</Text>
                      <Text variant="small" color={colors.textMuted}>
                        {item.kind === 'GAMING'
                          ? gamingSubtitle(db, item.session_id, item.quantity)
                          : `${item.quantity} × ${formatMoney(item.unit_price)}`}
                      </Text>
                    </View>
                    {item.kind === 'PRODUCT' ? (
                      <View style={styles.stepper}>
                        <StepButton icon="minus" onPress={() => void changeQty(item.id, item.quantity - 1)} />
                        <Text variant="bodyStrong" tabular style={{ minWidth: 22, textAlign: 'center' }}>
                          {item.quantity}
                        </Text>
                        <StepButton icon="plus" onPress={() => void changeQty(item.id, item.quantity + 1)} />
                      </View>
                    ) : item.session_id ? (
                      <Button
                        label="Edit"
                        tone="ghost"
                        size="sm"
                        onPress={() => setCorrectingId(item.session_id)}
                      />
                    ) : null}
                    <Money value={item.line_total} variant="bodyStrong" />
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState
              icon="receipt"
              title="Nothing on it yet"
              detail="Tap a product below to add it. Games are started from the Games tab."
            />
          )}

          {isTableBill ? (
            <View style={styles.toolRow}>
              <Button
                label="Add another table to this bill"
                icon="gamepad"
                tone="ghost"
                size="sm"
                onPress={() => setAddingGame(true)}
                disabled={!can(actor?.role, 'session.start') || availableResources.length === 0}
              />
            </View>
          ) : null}

          <Field value={query} onChangeText={setQuery} placeholder="Search products" icon="search" />

          {filtered.map((group) => (
            <View key={group.category.id} style={{ gap: space.sm }}>
              <Eyebrow>{group.category.name}</Eyebrow>
              <View style={styles.grid}>
                {group.products.map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    onPress={() => void addProduct(product)}
                    inBill={
                      bill?.items.find((i) => i.product_id === product.id)?.quantity ?? 0
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Eyebrow>Total</Eyebrow>
            <Money value={total} variant="display" fancySymbol />
          </View>
          <PaymentKeys amount={total} onPick={pick} disabled={busy || total <= 0} />
        </View>
      </Screen>

      <CustomerPicker
        visible={pickingCustomer}
        onClose={() => {
          setPickingCustomer(false);
          if (pendingMethod === 'DUE') setPendingMethod(null);
        }}
        onPick={(customerId) => void attachCustomer(customerId)}
        note={
          pendingMethod === 'DUE'
            ? 'A due has to belong to someone, so the balance can be collected later.'
            : undefined
        }
      />

      <UpiConfirmSheet
        visible={pendingMethod === 'UPI'}
        amount={total}
        vpa={db.settings.upi_vpa}
        payee={db.settings.upi_payee_name}
        busy={busy}
        onCancel={() => setPendingMethod(null)}
        onConfirm={() => void checkout('UPI')}
      />

      <DueConfirmSheet
        visible={pendingMethod === 'DUE' && !!bill?.customer}
        amount={total}
        customer={bill?.customer ?? null}
        previousBalance={customerBalance}
        busy={busy}
        onChangeCustomer={() => setPickingCustomer(true)}
        onCancel={() => setPendingMethod(null)}
        onConfirm={() => void checkout('DUE')}
      />

      <GameAmountSheet
        visible={!!stopSession}
        onClose={() => setStoppingId(null)}
        onConfirm={(amount) => void stopGame(amount)}
        busy={busy}
        mode="stop"
        resourceLabel={stopSession?.resource.label ?? ''}
        metered={stopSession?.priced.amount ?? 0}
        minutes={stopSession?.priced.billedMinutes ?? 0}
        ratePerMinute={stopSession?.session.rate_per_minute ?? 0}
        period={stopSession?.session.period ?? 'DAY'}
      />

      <GameAmountSheet
        visible={!!correctSession}
        onClose={() => setCorrectingId(null)}
        onConfirm={(amount) => void correctGame(amount)}
        busy={busy}
        mode="correct"
        resourceLabel={
          db.game_resources.find((r) => r.id === correctSession?.resource_id)?.label ?? 'Game time'
        }
        metered={correctSession?.metered_amount ?? correctSession?.amount ?? 0}
        minutes={correctSession?.billed_minutes ?? 0}
        ratePerMinute={correctSession?.rate_per_minute ?? 0}
        period={correctSession?.period ?? 'DAY'}
      />

      <Sheet
        visible={addingGame}
        onClose={() => setAddingGame(false)}
        eyebrow={`${TARIFF_LABEL[period]} rate`}
        title="Add game time"
      >
        <Segmented
          options={[
            { value: 'DAY', label: 'Day rate' },
            { value: 'NIGHT', label: 'Night rate' },
          ]}
          value={period}
          onChange={(next) => setPeriod(next as 'DAY' | 'NIGHT')}
        />
        {availableResources.length === 0 ? (
          <EmptyState icon="gamepad" title="Everything is busy" />
        ) : (
          <View style={styles.grid}>
            {availableResources.map((view) => (
              <Pressable
                key={view.resource.id}
                onPress={() => void startGameHere(view.resource.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.gameTile, pressed && { opacity: 0.8 }]}
              >
                <Icon
                  name={view.gameType.glyph === 'pool' ? 'pool' : 'gamepad'}
                  size={22}
                  color={colors.accentText}
                />
                <Text variant="bodyStrong">{view.resource.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Sheet>
    </>
  );
}

/**
 * A game line reads by what was charged, and says so when that differs from the meter —
 * a discount should be visible on the bill, not buried in the audit log.
 */
function gamingSubtitle(
  db: ReturnType<typeof useDb>,
  sessionId: ID | null,
  minutes: number,
): string {
  const session = sessionId ? db.gaming_sessions.find((s) => s.id === sessionId) : undefined;
  const duration = formatDuration(minutes);
  if (!session || session.amount_source !== 'MANUAL' || session.metered_amount === null) {
    return duration;
  }
  return `${duration} · meter said ${formatMoney(session.metered_amount)}`;
}

function StepButton({ icon, onPress }: { icon: 'plus' | 'minus'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={icon === 'plus' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      <Icon name={icon} size={16} color={colors.text} strokeWidth={2.6} />
    </Pressable>
  );
}

function ProductTile({
  product,
  onPress,
  inBill,
}: {
  product: Product;
  onPress: () => void;
  inBill: number;
}) {
  const out = product.track_stock && product.stock <= 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={out}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatMoney(product.price)}`}
      style={({ pressed }) => [
        styles.product,
        inBill > 0 && { borderColor: colors.accent, backgroundColor: colors.surfaceHigh },
        { opacity: out ? 0.35 : pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View style={styles.productHead}>
        <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>
          {product.name}
        </Text>
        {inBill > 0 ? (
          <View style={styles.count}>
            <Text variant="eyebrow" color={colors.onAccent}>
              {inBill}
            </Text>
          </View>
        ) : null}
      </View>
      <Money value={product.price} variant="heading" color={colors.accentText} />
      {product.track_stock ? (
        <Text variant="small" color={out ? colors.danger : colors.textFaint}>
          {out ? 'Out of stock' : `${product.stock} left`}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = themed(() => ({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  billHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.xs,
  },
  customerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  product: {
    width: '31%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    justifyContent: 'space-between',
    gap: space.xs,
  },
  productHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameTile: {
    width: '47%',
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: space.lg,
    gap: space.sm,
  },
  footer: {
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
}));
