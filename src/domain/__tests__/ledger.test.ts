import {
  balanceOf,
  balancesByCustomer,
  previewSettlement,
  statementFor,
  totalOutstanding,
} from '../ledger';
import type { DueTransaction, LedgerDirection, LedgerReason } from '../types';

let seq = 0;
function entry(
  customer_id: string,
  direction: LedgerDirection,
  amount: number,
  reason: LedgerReason = direction === 'DEBIT' ? 'SALE_DUE' : 'SETTLEMENT',
): DueTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    customer_id,
    direction,
    reason,
    amount,
    sale_id: null,
    payment_id: null,
    note: null,
    business_day: '2026-08-31',
    created_at: new Date(Date.UTC(2026, 7, 31, 10, seq)).toISOString(),
    created_by: 'staff1',
  };
}

describe('balanceOf', () => {
  it('is debits minus credits', () => {
    const ledger = [entry('c1', 'DEBIT', 50000), entry('c1', 'CREDIT', 20000)];
    expect(balanceOf(ledger, 'c1')).toBe(30000);
  });

  it('ignores other customers', () => {
    const ledger = [entry('c1', 'DEBIT', 50000), entry('c2', 'DEBIT', 90000)];
    expect(balanceOf(ledger, 'c1')).toBe(50000);
  });

  it('handles a customer who paid more than owed as a credit balance', () => {
    const ledger = [entry('c1', 'DEBIT', 50000), entry('c1', 'CREDIT', 80000)];
    expect(balanceOf(ledger, 'c1')).toBe(-30000);
  });

  it('reconstructs the same balance from the full history after many movements', () => {
    const ledger = [
      entry('c1', 'DEBIT', 45000),
      entry('c1', 'DEBIT', 30000),
      entry('c1', 'CREDIT', 50000),
      entry('c1', 'DEBIT', 20000),
      entry('c1', 'CREDIT', 20000),
    ];
    expect(balanceOf(ledger, 'c1')).toBe(25000);
  });

  it('nets out a voided due sale via its reversing credit', () => {
    const ledger = [
      entry('c1', 'DEBIT', 45000),
      entry('c1', 'CREDIT', 45000, 'SALE_VOID_REVERSAL'),
    ];
    expect(balanceOf(ledger, 'c1')).toBe(0);
  });
});

describe('totalOutstanding', () => {
  it('sums only what is actually owed, not credit balances', () => {
    const ledger = [
      entry('c1', 'DEBIT', 80000),
      entry('c2', 'DEBIT', 20000),
      entry('c2', 'CREDIT', 50000), // c2 overpaid by ₹300
    ];
    expect(totalOutstanding(ledger)).toBe(80000);
  });

  it('is zero for an empty ledger', () => {
    expect(totalOutstanding([])).toBe(0);
  });
});

describe('balancesByCustomer', () => {
  it('keys every customer that appears in the ledger', () => {
    const map = balancesByCustomer([entry('c1', 'DEBIT', 100), entry('c2', 'DEBIT', 200)]);
    expect(map.get('c1')).toBe(100);
    expect(map.get('c2')).toBe(200);
    expect(map.size).toBe(2);
  });
});

describe('statementFor', () => {
  it('returns newest first with the running balance as of each row', () => {
    const ledger = [
      entry('c1', 'DEBIT', 30000),
      entry('c1', 'DEBIT', 45000),
      entry('c1', 'CREDIT', 50000),
    ];
    const rows = statementFor(ledger, 'c1');
    expect(rows.map((r) => r.runningBalance)).toEqual([25000, 75000, 30000]);
  });
});

describe('previewSettlement', () => {
  it('handles a partial payment', () => {
    expect(previewSettlement(80000, 50000)).toEqual({
      previous: 80000,
      paying: 50000,
      remaining: 30000,
      overpayment: 0,
    });
  });

  it('handles a full payment', () => {
    expect(previewSettlement(80000, 80000).remaining).toBe(0);
  });

  it('reports an overpayment instead of a negative balance', () => {
    const preview = previewSettlement(80000, 100000);
    expect(preview.remaining).toBe(0);
    expect(preview.overpayment).toBe(20000);
  });
});
