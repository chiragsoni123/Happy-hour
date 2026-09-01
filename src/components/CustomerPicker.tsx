import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMoney } from '@/domain/money';
import type { ID } from '@/domain/types';
import { searchCustomers } from '@/store/selectors';
import { useDb, useStore } from '@/store/useStore';
import { colors, space } from '@/theme';
import { Button, Card, Divider, EmptyState, Field, Row, Sheet, Text } from '@/ui';

export interface CustomerPickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (customerId: ID) => void;
  title?: string;
  /** Copy shown above the list, e.g. why a customer is required. */
  note?: string;
}

/**
 * Search-or-create in one sheet. A due cannot be recorded without a customer, so the
 * "new customer" path is one tap away rather than a separate screen — the whole point
 * is that staff never abandon a sale because the customer is not in the system yet.
 */
export function CustomerPicker({ visible, onClose, onPick, title, note }: CustomerPickerProps) {
  const db = useDb();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const results = useMemo(() => searchCustomers(db, query), [db, query]);

  const reset = () => {
    setQuery('');
    setCreating(false);
    setName('');
    setPhone('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const create = async () => {
    const result = await run((backend, actorId) =>
      backend.createCustomer({ actorId, name: name.trim() || query.trim(), phone: phone.trim() || null }),
    );
    if (result) {
      const id = result.customerId;
      reset();
      onPick(id);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title ?? 'Choose customer'}
      eyebrow={creating ? 'New customer' : 'Search or create'}
      footer={
        creating ? (
          <>
            <Button
              label="Save and use"
              tone="accent"
              size="lg"
              full
              loading={busy}
              disabled={!(name.trim() || query.trim())}
              onPress={() => void create()}
            />
            <Button label="Back to search" tone="ghost" full onPress={() => setCreating(false)} />
          </>
        ) : (
          <Button
            label="New customer"
            icon="plus"
            tone="neutral"
            size="lg"
            full
            onPress={() => {
              setName(query);
              setCreating(true);
            }}
          />
        )
      }
    >
      {note ? (
        <Text variant="small" color={colors.textMuted}>
          {note}
        </Text>
      ) : null}

      {creating ? (
        <View style={{ gap: space.lg }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Rahul Sharma" autoFocus />
          <Field
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            placeholder="98765 43210"
            keyboardType="phone-pad"
            maxLength={15}
          />
          <Text variant="small" color={colors.textFaint}>
            Only a name is required. Nothing else about the customer is stored.
          </Text>
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Search name or phone"
            icon="search"
          />
          {results.length === 0 ? (
            <EmptyState
              icon="people"
              title={query ? `No customer called "${query}"` : 'No customers yet'}
              detail="Create one below — it takes a name and nothing more."
            />
          ) : (
            <Card level={2} padded={false} style={styles.list}>
              {results.map((row, index) => (
                <View key={row.customer.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={row.customer.name}
                    subtitle={row.customer.phone ?? undefined}
                    value={row.balance > 0 ? `Owes ${formatMoney(row.balance)}` : undefined}
                    valueColor={colors.warn}
                    onPress={() => {
                      reset();
                      onPick(row.customer.id);
                    }}
                  />
                </View>
              ))}
            </Card>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.xl,
  },
});
