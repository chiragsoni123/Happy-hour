import type { Paise } from './money';
import type { Customer, DueTransaction, ID } from './types';

/**
 * Dues are a ledger, never a mutable balance field.
 *
 * `balance = sum(DEBIT) - sum(CREDIT)`
 *
 * Every change to what a customer owes is an append. Voiding a due sale appends a
 * reversing CREDIT rather than deleting the original DEBIT, so the history a customer
 * can be shown always reconstructs the number they are being asked to pay.
 */
export function balanceOf(ledger: readonly DueTransaction[], customerId: ID): Paise {
  let balance = 0;
  for (const t of ledger) {
    if (t.customer_id !== customerId) continue;
    balance += t.direction === 'DEBIT' ? t.amount : -t.amount;
  }
  return balance;
}

/** Outstanding balance for every customer, keyed by id. */
export function balancesByCustomer(ledger: readonly DueTransaction[]): Map<ID, Paise> {
  const map = new Map<ID, Paise>();
  for (const t of ledger) {
    const prev = map.get(t.customer_id) ?? 0;
    map.set(t.customer_id, prev + (t.direction === 'DEBIT' ? t.amount : -t.amount));
  }
  return map;
}

export function totalOutstanding(ledger: readonly DueTransaction[]): Paise {
  let total = 0;
  for (const balance of balancesByCustomer(ledger).values()) {
    // Credit balances (a customer who overpaid) are not receivables.
    if (balance > 0) total += balance;
  }
  return total;
}

export interface LedgerEntryView {
  transaction: DueTransaction;
  /** Balance after this entry, oldest-first. */
  runningBalance: Paise;
}

/** Customer statement, newest first, with the running balance carried at each row. */
export function statementFor(
  ledger: readonly DueTransaction[],
  customerId: ID,
): LedgerEntryView[] {
  const rows = ledger
    .filter((t) => t.customer_id === customerId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let running = 0;
  const views: LedgerEntryView[] = rows.map((transaction) => {
    running += transaction.direction === 'DEBIT' ? transaction.amount : -transaction.amount;
    return { transaction, runningBalance: running };
  });
  return views.reverse();
}

export interface SettlementPreview {
  previous: Paise;
  paying: Paise;
  remaining: Paise;
  /** Paying more than owed leaves the customer in credit; the UI warns before allowing it. */
  overpayment: Paise;
}

export function previewSettlement(previous: Paise, paying: Paise): SettlementPreview {
  const remaining = previous - paying;
  return {
    previous,
    paying,
    remaining: Math.max(0, remaining),
    overpayment: remaining < 0 ? -remaining : 0,
  };
}

export interface CustomerWithBalance {
  customer: Customer;
  balance: Paise;
}

export function withBalances(
  customers: readonly Customer[],
  ledger: readonly DueTransaction[],
): CustomerWithBalance[] {
  const balances = balancesByCustomer(ledger);
  return customers.map((customer) => ({ customer, balance: balances.get(customer.id) ?? 0 }));
}
