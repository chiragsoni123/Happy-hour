import {
  View,
} from 'react-native';

import { previewSettlement } from '@/domain/ledger';
import { formatMoney, type Paise } from '@/domain/money';
import type { Customer } from '@/domain/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Card, Eyebrow, Icon, Money, Sheet, Text } from '@/ui';

export interface UpiConfirmSheetProps {
  visible: boolean;
  amount: Paise;
  vpa: string | null;
  payee: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * UPI is confirmed by a human, deliberately. A QR on screen proves nothing about
 * whether money arrived, so the sale is only marked paid after staff say they saw the
 * credit. When a payment provider is added later, this sheet is where its callback
 * replaces the button.
 */
export function UpiConfirmSheet({
  visible,
  amount,
  vpa,
  payee,
  busy,
  onCancel,
  onConfirm,
}: UpiConfirmSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      eyebrow="UPI"
      title="Confirm the money arrived"
      footer={
        <>
          <Button
            label="Yes, payment received"
            icon="check"
            tone="warn"
            size="lg"
            full
            loading={busy}
            onPress={onConfirm}
          />
          <Button label="Not yet" tone="ghost" full onPress={onCancel} />
        </>
      }
    >
      <Card level={2} style={styles.amountCard}>
        <Eyebrow>Amount to collect</Eyebrow>
        <Money value={amount} variant="hero" color={colors.upiText} fancySymbol />
        {vpa ? (
          <View style={styles.vpa}>
            <Icon name="upi" size={16} color={colors.textMuted} />
            <Text variant="bodyStrong" color={colors.textMuted}>
              {vpa}
              {payee ? ` · ${payee}` : ''}
            </Text>
          </View>
        ) : (
          <Text variant="small" color={colors.textFaint} align="center">
            Add your UPI ID in Settings to show it here.
          </Text>
        )}
      </Card>

      <Card level={2} accentEdge={colors.warn}>
        <Text variant="bodyStrong">Check your phone before confirming.</Text>
        <Text variant="small" color={colors.textMuted}>
          A QR on screen is not a payment. This sale is only recorded once you confirm the credit
          notification, and the confirmation is stamped with your name.
        </Text>
      </Card>
    </Sheet>
  );
}

export interface DueConfirmSheetProps {
  visible: boolean;
  amount: Paise;
  customer: Customer | null;
  previousBalance: Paise;
  busy: boolean;
  onChangeCustomer: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Shows what the customer already owes before adding more to it. */
export function DueConfirmSheet({
  visible,
  amount,
  customer,
  previousBalance,
  busy,
  onChangeCustomer,
  onCancel,
  onConfirm,
}: DueConfirmSheetProps) {
  const newBalance = previousBalance + amount;
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      eyebrow="Due"
      title={customer ? `Add to ${customer.name}'s tab` : 'Add to a tab'}
      footer={
        <>
          <Button
            label={`Confirm due of ${formatMoney(amount)}`}
            icon="check"
            tone="chalk"
            size="lg"
            full
            loading={busy}
            disabled={!customer}
            onPress={onConfirm}
          />
          <Button label="Change customer" tone="ghost" full onPress={onChangeCustomer} />
        </>
      }
    >
      <Card level={2} style={{ gap: space.md }}>
        <LedgerLine label="Already owes" value={previousBalance} />
        <LedgerLine label="This bill" value={amount} accent />
        <View style={styles.rule} />
        <LedgerLine label="New balance" value={newBalance} big />
      </Card>

      <Text variant="small" color={colors.textMuted}>
        This is counted as revenue today. It moves out of dues only when the customer actually
        pays, and that payment is recorded separately.
      </Text>
    </Sheet>
  );
}

export interface SettleSheetProps {
  visible: boolean;
  customerName: string;
  outstanding: Paise;
  paying: Paise;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}

/** Wraps the settlement number pad with a live preview of the resulting balance. */
export function SettlePreview({ outstanding, paying }: { outstanding: Paise; paying: Paise }) {
  const preview = previewSettlement(outstanding, paying);
  return (
    <Card level={2} style={{ gap: space.md }}>
      <LedgerLine label="Outstanding" value={preview.previous} />
      <LedgerLine label="Paying now" value={-preview.paying} accent />
      <View style={styles.rule} />
      <LedgerLine label="Remaining" value={preview.remaining} big />
      {preview.overpayment > 0 ? (
        <Text variant="small" color={colors.warn}>
          {formatMoney(preview.overpayment)} more than owed. It will be held as credit on the
          account.
        </Text>
      ) : null}
    </Card>
  );
}

function LedgerLine({
  label,
  value,
  accent,
  big,
}: {
  label: string;
  value: Paise;
  accent?: boolean;
  big?: boolean;
}) {
  return (
    <View style={styles.line}>
      <Text variant={big ? 'bodyStrong' : 'body'} color={big ? colors.text : colors.textMuted}>
        {label}
      </Text>
      <Money
        value={value}
        variant={big ? 'title' : 'bodyStrong'}
        color={accent ? colors.accentText : colors.text}
        sign={accent && value > 0}
      />
    </View>
  );
}

const styles = themed(() => ({
  amountCard: {
    alignItems: 'center',
    gap: space.sm,
  },
  vpa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
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
}));
