import { useMemo, useState } from 'react';
import {
  View,
} from 'react-native';

import { formatMoney } from '@/domain/money';
import { can } from '@/domain/permissions';
import { businessDayOf, formatClock, relativeDayLabel } from '@/domain/time';
import type { InventoryMovement, Product } from '@/domain/types';
import { profileName } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, radius, space, themed } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Header,
  Row,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

const MOVEMENTS: { value: Exclude<InventoryMovement, 'SALE'>; label: string }[] = [
  { value: 'PURCHASE', label: 'Add stock' },
  { value: 'ADJUSTMENT', label: 'Correction' },
  { value: 'DAMAGED', label: 'Damaged' },
];

/**
 * Stock is never typed in directly — it is the running balance of movements. Adding a
 * delivery, correcting a miscount and writing off breakage are three different reasons,
 * and the difference is what makes a discrepancy traceable a week later.
 */
export default function Inventory() {
  const db = useDb();
  const actor = useActor();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Product | null>(null);
  const [movement, setMovement] = useState<Exclude<InventoryMovement, 'SALE'>>('PURCHASE');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const canAdd = can(actor?.role, 'inventory.add');

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.products
      .filter((p) => !p.archived && p.track_stock)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aLow = a.stock <= a.low_stock_threshold ? 0 : 1;
        const bLow = b.stock <= b.low_stock_threshold ? 0 : 1;
        return aLow - bLow || a.name.localeCompare(b.name);
      });
  }, [db, query]);

  const movements = useMemo(
    () =>
      db.inventory_transactions
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 20),
    [db],
  );

  const lowCount = products.filter((p) => p.stock <= p.low_stock_threshold).length;

  const open = (product: Product) => {
    setTarget(product);
    setMovement('PURCHASE');
    setQty('');
    setNote('');
  };

  const submit = async () => {
    if (!target) return;
    const magnitude = Number(qty);
    if (!Number.isFinite(magnitude) || magnitude <= 0) return;
    const change = movement === 'PURCHASE' ? magnitude : -magnitude;
    const done = await run(
      (backend, actorId) =>
        backend.recordStockMovement({
          actorId,
          productId: target.id,
          movement,
          quantityChange: change,
          note: note || null,
        }),
      { success: `${target.name}: ${change > 0 ? '+' : ''}${change}` },
    );
    if (done) setTarget(null);
  };

  return (
    <>
      <Screen>
        <Header
          title="Inventory"
          eyebrow={`${products.length} tracked items`}
          back
          right={lowCount > 0 ? <Badge label={`${lowCount} low`} color={colors.warn} /> : undefined}
        />

        <Field value={query} onChangeText={setQuery} placeholder="Search product" icon="search" />

        {products.length === 0 ? (
          <EmptyState icon="box" title="Nothing matches" />
        ) : (
          <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
            {products.map((product, index) => {
              const low = product.stock <= product.low_stock_threshold;
              return (
                <View key={product.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={product.name}
                    subtitle={`${formatMoney(product.price)} · alert at ${product.low_stock_threshold}`}
                    value={`${product.stock}`}
                    valueColor={low ? colors.warn : colors.text}
                    onPress={canAdd ? () => open(product) : undefined}
                    right={
                      low ? (
                        <View style={styles.lowPill}>
                          <Text variant="eyebrow" color={colors.warn}>
                            Low
                          </Text>
                        </View>
                      ) : undefined
                    }
                  />
                </View>
              );
            })}
          </Card>
        )}

        <Section title="Recent movements">
          {movements.length === 0 ? (
            <EmptyState icon="history" title="No movements yet" />
          ) : (
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {movements.map((row, index) => {
                const product = db.products.find((p) => p.id === row.product_id);
                return (
                  <View key={row.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={`${product?.name ?? 'Item'} · ${row.movement.toLowerCase()}`}
                      subtitle={`${relativeDayLabel(businessDayOf(row.created_at))} ${formatClock(row.created_at)} · ${profileName(db, row.created_by)}${row.note ? ` · ${row.note}` : ''}`}
                      value={`${row.quantity_change > 0 ? '+' : ''}${row.quantity_change}`}
                      valueColor={row.quantity_change > 0 ? colors.brand : colors.textMuted}
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </Section>
      </Screen>

      <Sheet
        visible={!!target}
        onClose={() => setTarget(null)}
        eyebrow={target ? `${target.stock} in stock` : ''}
        title={target?.name ?? ''}
        footer={
          <Button
            label={movement === 'PURCHASE' ? 'Add to stock' : 'Record movement'}
            tone="accent"
            size="lg"
            full
            loading={busy}
            disabled={!qty || Number(qty) <= 0}
            onPress={() => void submit()}
          />
        }
      >
        <Segmented options={MOVEMENTS} value={movement} onChange={setMovement} />
        <Field
          label="Quantity"
          value={qty}
          onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="0"
          autoFocus
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder={movement === 'PURCHASE' ? 'Supplier, invoice' : 'Why the count changed'}
        />
        {target ? (
          <Card level={2}>
            <Text variant="bodyStrong">
              New stock:{' '}
              {target.stock + (movement === 'PURCHASE' ? Number(qty || 0) : -Number(qty || 0))}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              Sales already reduce stock automatically. Use a correction only when the shelf and
              the app disagree.
            </Text>
          </Card>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = themed(() => ({
  lowPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.warn,
  },
}));
