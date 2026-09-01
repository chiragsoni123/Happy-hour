import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CustomerPicker } from '@/components/CustomerPicker';
import { formatMoney } from '@/domain/money';
import { totalOutstanding } from '@/domain/ledger';
import { relativeDayLabel, businessDayOf } from '@/domain/time';
import { debtors } from '@/store/selectors';
import { useDb } from '@/store/useStore';
import { colors, space } from '@/theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  Money,
  Row,
  Screen,
  Section,
  Text,
} from '@/ui';

/**
 * Dues, sorted by who owes the most. The number at the top is the total the cafe is
 * owed, computed from the ledger rather than stored anywhere — so it cannot drift.
 */
export default function Dues() {
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);

  const owing = useMemo(() => debtors(db), [db]);
  const outstanding = useMemo(() => totalOutstanding(db.due_transactions), [db]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owing;
    return owing.filter(
      (d) => d.customer.name.toLowerCase().includes(q) || (d.customer.phone ?? '').includes(q),
    );
  }, [owing, query]);

  const credits = owing.filter((d) => d.balance < 0);

  return (
    <>
      <Screen tabBarPadding>
        <View style={{ gap: 2 }}>
          <Eyebrow>Money on the books</Eyebrow>
          <Text variant="title">Dues</Text>
        </View>

        <Card level={1} style={styles.hero}>
          <Eyebrow color="rgba(5,7,3,0.6)">Total outstanding</Eyebrow>
          <Money value={outstanding} variant="hero" color={colors.onAccent} fancySymbol />
          <Text variant="small" color="rgba(5,7,3,0.7)">
            {owing.filter((d) => d.balance > 0).length} customer
            {owing.filter((d) => d.balance > 0).length === 1 ? '' : 's'} with a running tab
          </Text>
        </Card>

        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Search customer"
          icon="search"
        />

        <Button
          label="Find or add a customer"
          icon="people"
          tone="ghost"
          full
          onPress={() => setPicking(true)}
        />

        {results.filter((d) => d.balance > 0).length === 0 ? (
          <EmptyState
            icon="wallet"
            title={query ? 'No match' : 'Nobody owes anything'}
            detail={query ? undefined : 'Dues appear here the moment a bill is closed as DUE.'}
          />
        ) : (
          <Section title="Owes the cafe">
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {results
                .filter((d) => d.balance > 0)
                .map((row, index) => (
                  <View key={row.customer.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row
                      title={row.customer.name}
                      subtitle={
                        row.lastActivity
                          ? `Last activity ${relativeDayLabel(businessDayOf(row.lastActivity))}`
                          : row.customer.phone ?? undefined
                      }
                      value={formatMoney(row.balance)}
                      valueColor={colors.warn}
                      onPress={() => router.push(`/customer/${row.customer.id}`)}
                    />
                  </View>
                ))}
            </Card>
          </Section>
        )}

        {credits.length > 0 ? (
          <Section title="In credit">
            <Card level={2} padded={false} style={{ paddingHorizontal: space.xl }}>
              {credits.map((row, index) => (
                <View key={row.customer.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row
                    title={row.customer.name}
                    subtitle="Paid more than owed"
                    value={formatMoney(-row.balance)}
                    valueColor={colors.brand}
                    onPress={() => router.push(`/customer/${row.customer.id}`)}
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
      </Screen>

      <CustomerPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(customerId) => {
          setPicking(false);
          router.push(`/customer/${customerId}`);
        }}
        title="Customers"
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.accent,
    gap: space.xs,
  },
});
