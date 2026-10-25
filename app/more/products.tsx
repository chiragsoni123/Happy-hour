import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatMoney, parseAmount } from '@/domain/money';
import { can } from '@/domain/permissions';
import { rateLabel, TARIFF_LABEL } from '@/domain/pricing';
import type { Product } from '@/domain/types';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import {
  Button,
  Card,
  Divider,
  Eyebrow,
  Field,
  Header,
  Row,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
  Toggle,
} from '@/ui';

/**
 * Catalogue and rates. Editing a price here only affects future sales — every completed
 * line already carries its own snapshot of what was charged.
 */
export default function Products() {
  const db = useDb();
  const actor = useActor();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [rule, setRule] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id ?? '');
  const [threshold, setThreshold] = useState('10');
  const [tracked, setTracked] = useState(true);

  const [rate, setRate] = useState('');
  const [minimum, setMinimum] = useState('');
  const [ruleLabel, setRuleLabel] = useState('');

  const canPrice = can(actor?.role, 'price.manage');
  const canRemove = can(actor?.role, 'product.remove');

  const removed = useMemo(
    () => db.products.filter((p) => p.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [db],
  );

  const setRemoved = async (product: Product, restore: boolean) => {
    const done = await run(
      (backend, actorId) => backend.archiveProduct({ actorId, productId: product.id, restore }),
      { success: restore ? `${product.name} is back on the menu` : `${product.name} removed` },
    );
    if (done) setEditing(null);
  };

  const grouped = useMemo(
    () =>
      db.categories
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((category) => ({
          category,
          products: db.products
            .filter((p) => !p.archived && p.category_id === category.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        })),
    [db],
  );

  const openProduct = (product: Product | 'new') => {
    if (product === 'new') {
      setName('');
      setPrice('');
      setCategoryId(db.categories[0]?.id ?? '');
      setThreshold('10');
      setTracked(true);
    } else {
      setName(product.name);
      setPrice(String(Math.round(product.price / 100)));
      setCategoryId(product.category_id);
      setThreshold(String(product.low_stock_threshold));
      setTracked(product.track_stock);
    }
    setEditing(product);
  };

  const saveProduct = async () => {
    const amount = parseAmount(price);
    if (amount === null) return;
    const done = await run(
      (backend, actorId) =>
        backend.upsertProduct({
          actorId,
          product: {
            id: editing && editing !== 'new' ? editing.id : undefined,
            category_id: categoryId,
            name,
            price: amount,
            low_stock_threshold: Number(threshold) || 0,
            track_stock: tracked,
          },
        }),
      { success: `${name} saved` },
    );
    if (done) setEditing(null);
  };

  const openRule = (ruleId: string) => {
    const found = db.pricing_rules.find((r) => r.id === ruleId);
    if (!found) return;
    const type = db.game_types.find((t) => t.id === found.game_type_id);
    setRate(String(Math.round(found.rate_per_minute / 100)));
    setMinimum(String(Math.round(found.minimum_charge / 100)));
    setRuleLabel(`${type?.name ?? found.name} · ${TARIFF_LABEL[found.period]}`);
    setRule(ruleId);
  };

  const saveRule = async () => {
    if (!rule) return;
    const rateValue = parseAmount(rate);
    const minValue = parseAmount(minimum);
    if (rateValue === null || minValue === null) return;
    const done = await run(
      (backend, actorId) =>
        backend.updatePricingRule({
          actorId,
          ruleId: rule,
          patch: { rate_per_minute: rateValue, minimum_charge: minValue },
        }),
      { success: 'Rate updated for new sessions' },
    );
    if (done) setRule(null);
  };

  return (
    <>
      <Screen>
        <Header title="Products and pricing" eyebrow={`${db.products.length} products`} back />

        <Button label="New product" icon="plus" tone="accent" full onPress={() => openProduct('new')} />

        <Section title="Game rates">
          {db.game_types
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((type) => {
              const rules = db.pricing_rules
                .filter((r) => r.game_type_id === type.id && r.resource_id === null)
                .sort((a, b) => a.period.localeCompare(b.period));
              if (rules.length === 0) return null;
              return (
                <Card
                  key={type.id}
                  level={2}
                  padded={false}
                  style={{ paddingHorizontal: space.xl, marginBottom: space.md }}
                >
                  {rules.map((r, index) => (
                    <View key={r.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row
                        title={`${type.name} · ${TARIFF_LABEL[r.period]}`}
                        subtitle={`${rateLabel(r)}${
                          r.minimum_charge > 0 ? ` · minimum ${formatMoney(r.minimum_charge)}` : ''
                        }`}
                        value={canPrice ? 'Edit' : undefined}
                        valueColor={colors.accentText}
                        onPress={canPrice ? () => openRule(r.id) : undefined}
                      />
                    </View>
                  ))}
                </Card>
              );
            })}
          <Text variant="small" color={colors.textFaint}>
            Staff pick day or night when they start a table. The switch is manual on purpose —
            the cafe decides when the night rate begins, not the clock.
          </Text>
        </Section>

        {grouped.map((group) =>
          group.products.length === 0 ? null : (
            <Section key={group.category.id} title={group.category.name}>
              <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
                {group.products.map((product, index) => (
                  <View key={product.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={product.name}
                      subtitle={product.track_stock ? `${product.stock} in stock` : 'Not stock tracked'}
                      value={formatMoney(product.price)}
                      valueColor={colors.accentText}
                      onPress={() => openProduct(product)}
                    />
                  </View>
                ))}
              </Card>
            </Section>
          ),
        )}

        {canRemove && removed.length > 0 ? (
          <Section title={`Removed from the menu (${removed.length})`}>
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {removed.map((product, index) => (
                <View key={product.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={product.name}
                    subtitle="Hidden from sales and stock. Past sales still show it."
                    value="Restore"
                    valueColor={colors.brand}
                    onPress={() => void setRemoved(product, true)}
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
      </Screen>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        eyebrow={editing === 'new' ? 'New' : 'Edit'}
        title={editing === 'new' ? 'Add a product' : name}
        footer={
          <>
            <Button
              label="Save product"
              tone="accent"
              size="lg"
              full
              loading={busy}
              disabled={!name.trim() || parseAmount(price) === null}
              onPress={() => void saveProduct()}
            />
            {canRemove && editing && editing !== 'new' ? (
              <Button
                label="Remove from menu"
                icon="trash"
                tone="ghost"
                full
                loading={busy}
                onPress={() => void setRemoved(editing, false)}
              />
            ) : null}
          </>
        }
      >
        <Field label="Name" value={name} onChangeText={setName} placeholder="Coke" />
        <Field
          label="Price in rupees"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="40"
          hint={canPrice ? undefined : 'Only the owner can change prices.'}
        />
        <View style={{ gap: space.sm }}>
          <Eyebrow>Category</Eyebrow>
          <Segmented
            options={db.categories.slice(0, 4).map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
          />
        </View>
        <Toggle
          label="Track stock"
          value={tracked}
          onChange={setTracked}
          hint="Turn off for items you do not count, like tea from the shop next door."
        />
        {tracked ? (
          <Field
            label="Low stock alert at"
            value={threshold}
            onChangeText={(v) => setThreshold(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
        ) : null}
      </Sheet>

      <Sheet
        visible={!!rule}
        onClose={() => setRule(null)}
        eyebrow="Applies to new sessions only"
        title={ruleLabel || 'Game rate'}
        footer={
          <Button
            label="Save rate"
            tone="accent"
            size="lg"
            full
            loading={busy}
            onPress={() => void saveRule()}
          />
        }
      >
        <Field label="Rupees per minute" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
        <Field
          label="Minimum charge"
          value={minimum}
          onChangeText={setMinimum}
          keyboardType="decimal-pad"
          hint="Short sessions are billed at least this much."
        />
        <Text variant="small" color={colors.textFaint}>
          Sessions already running keep the rate they started on, and closed bills are never
          recalculated.
        </Text>
      </Sheet>
    </>
  );
}
