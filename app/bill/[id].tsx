import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CustomerPicker } from '@/components/CustomerPicker';
import { DueConfirmSheet, UpiConfirmSheet } from '@/components/CheckoutSheets';
import { balanceOf } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { formatClock, formatDuration, formatStopwatch, secondsBetween } from '@/domain/time';
import type { CheckoutMethod, ID, Product } from '@/domain/types';
import { useNow, useOpId } from '@/hooks/useNow';
import { billView, catalogue, resourceBoard } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, radius, space } from '@/theme';
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
      backend.startSession({ actorId, resourceId, saleId: target, customerId: bill?.customer?.id ?? null }),
    );
  };

  const stopGame = async (sessionId: ID) => {
    await run((backend, actorId) => backend.stopSession({ actorId, sessionId }));
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

  return (
    <>
      <Screen scroll={false} style={{ paddingBottom: 0 }} contentStyle={{ flex: 1, gap: space.lg }}>
        <Header
          title={bill ? `Bill #${bill.sale.number}` : 'New sale'}
          eyebrow={bill ? `Opened ${formatClock(bill.sale.opened_at)}` : 'Tap items to add them'}
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
          {bill && (bill.items.length > 0 || bill.activeSessions.length > 0) ? (
            <Card level={2} style={{ gap: space.sm }}>
              <View style={styles.billHead}>
                <Pressable
                  onPress={() => setPickingCustomer(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.customerChip}
                >
                  <Icon name="people" size={16} color={bill.customer ? colors.accent : colors.textFaint} />
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
                    <Text variant="small" color={colors.accent} tabular>
                      {formatStopwatch(secondsBetween(view.session.started_at, now))} running ·{' '}
                      {formatMoney(view.priced.amount)}
                    </Text>
                  </View>
                  <Button
                    label="Stop"
                    icon="stop"
                    tone="accent"
                    size="sm"
                    loading={busy}
                    onPress={() => void stopGame(view.session.id)}
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
                          ? `${formatDuration(item.quantity)} at ${formatMoney(item.unit_price)}/min`
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
                    ) : null}
                    <Money value={item.line_total} variant="bodyStrong" />
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState
              icon="receipt"
              title="Empty bill"
              detail="Tap a product below, or add game time to this bill."
            />
          )}

          <View style={styles.toolRow}>
            <Button
              label="Add game time"
              icon="gamepad"
              tone="ghost"
              size="sm"
              onPress={() => setAddingGame(true)}
              disabled={!can(actor?.role, 'session.start') || availableResources.length === 0}
            />
          </View>

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

      <Sheet
        visible={addingGame}
        onClose={() => setAddingGame(false)}
        eyebrow="Same bill"
        title="Add game time"
      >
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
                  color={colors.accent}
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
      <Money value={product.price} variant="heading" color={colors.accent} />
      {product.track_stock ? (
        <Text variant="small" color={out ? colors.danger : colors.textFaint}>
          {out ? 'Out of stock' : `${product.stock} left`}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.hairline,
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
    borderColor: colors.hairline,
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
    borderColor: colors.hairline,
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
});
