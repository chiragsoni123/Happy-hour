jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      },
      removeItem: (k: string) => {
        store.delete(k);
        return Promise.resolve();
      },
    },
  };
});

import { balanceOf } from '@/domain/ledger';
import { cashPosition, dayTotals } from '@/domain/reporting';
import { currentBusinessDay } from '@/domain/time';
import type { Database, ID } from '@/domain/types';

import { AppError } from '../errors';
import { LocalBackend } from '../local/LocalBackend';

const OWNER = 'staff_owner';
const STAFF = 'staff_floor';
const DAY = currentBusinessDay();

async function fresh(): Promise<LocalBackend> {
  const backend = new LocalBackend();
  await backend.resetToSeed();
  return backend;
}

/** Opens a bill, puts `quantity` of a product on it, and returns the bill id. */
async function billWith(
  backend: LocalBackend,
  productId: ID,
  quantity = 1,
  actorId = STAFF,
): Promise<ID> {
  const { sale } = await backend.openBill({ actorId });
  await backend.addProductToBill({ actorId, saleId: sale.id, productId, quantity });
  return sale.id;
}

function product(db: Database, id: ID) {
  const found = db.products.find((p) => p.id === id);
  if (!found) throw new Error(`missing product ${id}`);
  return found;
}

describe('product sale', () => {
  it('records a cash sale, deducts stock and writes a payment', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_coke', 2);
    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'CASH',
      clientOpId: 'op-1',
    });

    const sale = db.sales.find((s) => s.id === saleId);
    expect(sale?.status).toBe('COMPLETED');
    expect(sale?.total).toBe(8000); // 2 x ₹40
    expect(product(db, 'prod_coke').stock).toBe(28);

    const payment = db.payments.find((p) => p.sale_id === saleId);
    expect(payment).toMatchObject({ method: 'CASH', amount: 8000, collected_by: STAFF });
    expect(dayTotals(db, DAY).cashSales).toBe(8000);
    expect(dayTotals(db, DAY).revenue).toBe(8000);
  });

  it('records a UPI sale against UPI, not cash', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_maggie');
    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'UPI',
      clientOpId: 'op-2',
    });
    const totals = dayTotals(db, DAY);
    expect(totals.upiSales).toBe(5000);
    expect(totals.cashSales).toBe(0);
  });

  it('snapshots the price so a later price change cannot rewrite history', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_coke');
    await backend.completeSale({ actorId: STAFF, saleId, method: 'CASH', clientOpId: 'op-3' });

    const db = await backend.upsertProduct({
      actorId: OWNER,
      product: {
        id: 'prod_coke',
        category_id: 'cat_drinks',
        name: 'Coke',
        price: 6000,
        low_stock_threshold: 10,
        track_stock: true,
      },
    });

    const item = db.sale_items.find((i) => i.sale_id === saleId);
    expect(item?.unit_price).toBe(4000);
    expect(db.sales.find((s) => s.id === saleId)?.total).toBe(4000);
    expect(product(db, 'prod_coke').price).toBe(6000);
  });

  it('refuses an empty bill', async () => {
    const backend = await fresh();
    const { sale } = await backend.openBill({ actorId: STAFF });
    await expect(
      backend.completeSale({ actorId: STAFF, saleId: sale.id, method: 'CASH', clientOpId: 'op-4' }),
    ).rejects.toThrow(AppError);
  });
});

describe('duplicate submission', () => {
  it('returns the first sale instead of creating a second one', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_chips');
    const first = await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'CASH',
      clientOpId: 'same-key',
    });
    const second = await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'CASH',
      clientOpId: 'same-key',
    });

    expect(second.saleId).toBe(first.saleId);
    expect(second.db.payments.filter((p) => p.sale_id === saleId)).toHaveLength(1);
    expect(dayTotals(second.db, DAY).cashSales).toBe(3000);
  });

  it('does not double-count a repeated due settlement', async () => {
    const backend = await fresh();
    const { customerId } = await backend.createCustomer({ actorId: STAFF, name: 'Rahul' });
    const saleId = await billWith(backend, 'prod_cig_pack');
    await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'DUE',
      customerId,
      clientOpId: 'due-1',
    });

    await backend.settleDue({
      actorId: STAFF,
      customerId,
      amount: 10000,
      method: 'CASH',
      clientOpId: 'settle-1',
    });
    const db = await backend.settleDue({
      actorId: STAFF,
      customerId,
      amount: 10000,
      method: 'CASH',
      clientOpId: 'settle-1',
    });

    expect(db.payments.filter((p) => p.kind === 'DUE_SETTLEMENT')).toHaveLength(1);
    expect(balanceOf(db.due_transactions, customerId)).toBe(25000);
  });
});

describe('dues', () => {
  it('requires a customer', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_coke');
    await expect(
      backend.completeSale({ actorId: STAFF, saleId, method: 'DUE', clientOpId: 'op-5' }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_REQUIRED' });
  });

  it('counts a due sale as revenue today but not as cash', async () => {
    const backend = await fresh();
    const { customerId } = await backend.createCustomer({ actorId: STAFF, name: 'Rahul' });
    const saleId = await billWith(backend, 'prod_maggie', 2);
    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'DUE',
      customerId,
      clientOpId: 'op-6',
    });

    const totals = dayTotals(db, DAY);
    expect(totals.revenue).toBe(10000);
    expect(totals.newDues).toBe(10000);
    expect(totals.cashSales).toBe(0);
    expect(balanceOf(db.due_transactions, customerId)).toBe(10000);
  });

  it('settles partially, then fully, without ever rewriting the original due', async () => {
    const backend = await fresh();
    const { customerId } = await backend.createCustomer({ actorId: STAFF, name: 'Rahul' });
    const saleId = await billWith(backend, 'prod_cig_pack'); // ₹350
    await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'DUE',
      customerId,
      clientOpId: 'op-7',
    });

    await backend.settleDue({
      actorId: STAFF,
      customerId,
      amount: 20000,
      method: 'CASH',
      clientOpId: 's-1',
    });
    const db = await backend.settleDue({
      actorId: STAFF,
      customerId,
      amount: 15000,
      method: 'UPI',
      clientOpId: 's-2',
    });

    expect(balanceOf(db.due_transactions, customerId)).toBe(0);
    const debits = db.due_transactions.filter((t) => t.customer_id === customerId && t.direction === 'DEBIT');
    expect(debits).toHaveLength(1);
    expect(debits[0]?.amount).toBe(35000);

    const totals = dayTotals(db, DAY);
    // Settlements move money without adding revenue.
    expect(totals.revenue).toBe(35000);
    expect(totals.cashSettlements).toBe(20000);
    expect(totals.upiSettlements).toBe(15000);
    expect(totals.cashSales).toBe(0);
  });

  it('refuses to settle against a customer who owes nothing', async () => {
    const backend = await fresh();
    const { customerId } = await backend.createCustomer({ actorId: STAFF, name: 'Nobody' });
    await expect(
      backend.settleDue({
        actorId: STAFF,
        customerId,
        amount: 10000,
        method: 'CASH',
        clientOpId: 's-3',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });
});

describe('voiding', () => {
  it('returns stock, cancels the payment and leaves an audit trail', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_coke', 3);
    await backend.completeSale({ actorId: STAFF, saleId, method: 'CASH', clientOpId: 'op-8' });

    const db = await backend.voidSale({ actorId: OWNER, saleId, reason: 'Wrong amount' });

    expect(product(db, 'prod_coke').stock).toBe(30);
    expect(db.payments.find((p) => p.sale_id === saleId)?.status).toBe('VOIDED');
    expect(db.sales.find((s) => s.id === saleId)).toMatchObject({
      status: 'VOIDED',
      voided_by: OWNER,
      void_reason: 'Wrong amount',
    });
    expect(dayTotals(db, DAY).cashSales).toBe(0);
    expect(dayTotals(db, DAY).revenue).toBe(0);
    expect(db.audit_logs.some((l) => l.action === 'SALE_VOIDED')).toBe(true);
  });

  it('reverses a due with a balancing credit rather than deleting the debit', async () => {
    const backend = await fresh();
    const { customerId } = await backend.createCustomer({ actorId: STAFF, name: 'Rahul' });
    const saleId = await billWith(backend, 'prod_cig_pack');
    await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'DUE',
      customerId,
      clientOpId: 'op-9',
    });

    const db = await backend.voidSale({ actorId: OWNER, saleId, reason: 'Entered twice' });

    expect(balanceOf(db.due_transactions, customerId)).toBe(0);
    expect(db.due_transactions.filter((t) => t.customer_id === customerId)).toHaveLength(2);
  });

  it('is refused to staff', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_coke');
    await backend.completeSale({ actorId: STAFF, saleId, method: 'CASH', clientOpId: 'op-10' });
    await expect(
      backend.voidSale({ actorId: STAFF, saleId, reason: 'oops' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('inventory and concurrency', () => {
  it('never lets two bills take the same last unit', async () => {
    const backend = await fresh();
    // Drive stock down to a single Popcorn.
    await backend.recordStockMovement({
      actorId: OWNER,
      productId: 'prod_popcorn',
      movement: 'ADJUSTMENT',
      quantityChange: -5,
      note: 'set up test',
    });

    const a = await billWith(backend, 'prod_popcorn', 1);
    const { sale: saleB } = await backend.openBill({ actorId: STAFF });

    // The second bill cannot even reserve it while the first bill holds it.
    await expect(
      backend.addProductToBill({
        actorId: STAFF,
        saleId: saleB.id,
        productId: 'prod_popcorn',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });

    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId: a,
      method: 'CASH',
      clientOpId: 'op-11',
    });
    expect(product(db, 'prod_popcorn').stock).toBe(0);
  });

  it('refuses to add more than is on the shelf', async () => {
    const backend = await fresh();
    const { sale } = await backend.openBill({ actorId: STAFF });
    await expect(
      backend.addProductToBill({
        actorId: STAFF,
        saleId: sale.id,
        productId: 'prod_popcorn',
        quantity: 99,
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('records every movement with the resulting balance', async () => {
    const backend = await fresh();
    const db = await backend.recordStockMovement({
      actorId: OWNER,
      productId: 'prod_kurkure',
      movement: 'PURCHASE',
      quantityChange: 50,
    });
    const last = db.inventory_transactions.filter((t) => t.product_id === 'prod_kurkure').pop();
    expect(last).toMatchObject({ movement: 'PURCHASE', quantity_change: 50, balance_after: 58 });
    expect(product(db, 'prod_kurkure').stock).toBe(58);
  });

  it('will not take stock below zero', async () => {
    const backend = await fresh();
    await expect(
      backend.recordStockMovement({
        actorId: OWNER,
        productId: 'prod_kurkure',
        movement: 'DAMAGED',
        quantityChange: -99,
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });
});

describe('gaming sessions', () => {
  it('stops two staff starting the same console', async () => {
    const backend = await fresh();
    await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_ps5_1' });
    await expect(
      backend.startSession({ actorId: OWNER, period: 'DAY', resourceId: 'res_ps5_1' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_BUSY' });
  });

  it('frees the console and bills the time when stopped', async () => {
    const backend = await fresh();
    const started = await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_pool_1' });
    const { db } = await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });

    expect(db.game_resources.find((r) => r.id === 'res_pool_1')?.status).toBe('AVAILABLE');
    const session = db.gaming_sessions.find((s) => s.id === started.sessionId);
    expect(session?.status).toBe('STOPPED');
    // A session of a few seconds still bills the 5-minute minimum at ₹8/min.
    expect(session?.amount).toBe(4000);
    const item = db.sale_items.find((i) => i.session_id === started.sessionId);
    expect(item).toMatchObject({ kind: 'GAMING', line_total: 4000 });
  });

  it('cannot be stopped twice', async () => {
    const backend = await fresh();
    const started = await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_ps5_2' });
    await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    await expect(
      backend.stopSession({ actorId: STAFF, sessionId: started.sessionId }),
    ).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('counts gaming revenue only once the bill is paid', async () => {
    const backend = await fresh();
    const started = await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_ps5_3' });
    const stopped = await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    expect(dayTotals(stopped.db, DAY).revenue).toBe(0);

    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId: started.saleId,
      method: 'UPI',
      clientOpId: 'op-12',
    });
    const totals = dayTotals(db, DAY);
    expect(totals.gamingRevenue).toBe(5000); // PS5 minimum
    expect(totals.upiSales).toBe(5000);
    expect(db.gaming_sessions.find((s) => s.id === started.sessionId)?.status).toBe('BILLED');
  });

  it('keeps food and game time on one bill', async () => {
    const backend = await fresh();
    const started = await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_ps5_1' });
    await backend.addProductToBill({
      actorId: STAFF,
      saleId: started.saleId,
      productId: 'prod_coke',
      quantity: 1,
    });
    await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId: started.saleId,
      method: 'CASH',
      clientOpId: 'op-13',
    });

    expect(db.sales.find((s) => s.id === started.saleId)?.total).toBe(9000); // ₹50 game + ₹40 coke
    expect(db.sale_items.filter((i) => i.sale_id === started.saleId)).toHaveLength(2);
  });

  it('refuses checkout while the clock is still running', async () => {
    const backend = await fresh();
    const started = await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_pool_2' });
    await expect(
      backend.completeSale({
        actorId: STAFF,
        saleId: started.saleId,
        method: 'CASH',
        clientOpId: 'op-14',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('manual game amounts', () => {
  it('charges the meter when no amount is given', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_pool_1',
    });
    const { db } = await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    const session = db.gaming_sessions.find((s) => s.id === started.sessionId);
    expect(session).toMatchObject({ amount: 4000, metered_amount: 4000, amount_source: 'METERED' });
  });

  it('charges what the staff member typed instead of what the clock said', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_pool_1',
    });
    const { db } = await backend.stopSession({
      actorId: STAFF,
      sessionId: started.sessionId,
      amount: 2500,
    });

    const session = db.gaming_sessions.find((s) => s.id === started.sessionId);
    // The discount is visible: the meter's figure is kept beside what was charged.
    expect(session).toMatchObject({ amount: 2500, metered_amount: 4000, amount_source: 'MANUAL' });
    expect(db.sale_items.find((i) => i.session_id === started.sessionId)?.line_total).toBe(2500);
    expect(db.sales.find((s) => s.id === started.saleId)?.total).toBe(2500);
  });

  it('bills the overridden figure, not the meter', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_ps5_1',
    });
    await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId, amount: 3000 });
    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId: started.saleId,
      method: 'CASH',
      clientOpId: 'manual-1',
    });
    expect(dayTotals(db, DAY).gamingRevenue).toBe(3000);
    expect(dayTotals(db, DAY).cashSales).toBe(3000);
  });

  it('corrects the amount while the bill is still open', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_ps5_2',
    });
    await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    const db = await backend.setGamingAmount({
      actorId: STAFF,
      sessionId: started.sessionId,
      amount: 1500,
    });
    expect(db.sales.find((s) => s.id === started.saleId)?.total).toBe(1500);
    expect(db.gaming_sessions.find((s) => s.id === started.sessionId)?.amount_source).toBe('MANUAL');
  });

  it('refuses to change a game once its bill has been paid', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_ps5_3',
    });
    await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    await backend.completeSale({
      actorId: STAFF,
      saleId: started.saleId,
      method: 'CASH',
      clientOpId: 'manual-2',
    });
    await expect(
      backend.setGamingAmount({ actorId: STAFF, sessionId: started.sessionId, amount: 100 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a negative amount', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_pool_2',
    });
    await expect(
      backend.stopSession({ actorId: STAFF, sessionId: started.sessionId, amount: -100 }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });
});

describe('day and night tariffs', () => {
  it('snapshots the night rate onto a session started on it', async () => {
    const backend = await fresh();
    // Put the night rate somewhere different from the day rate.
    await backend.updatePricingRule({
      actorId: OWNER,
      ruleId: 'rule_ps5_night',
      patch: { rate_per_minute: 2000, minimum_charge: 10000 },
    });

    const started = await backend.startSession({
      actorId: STAFF,
      period: 'NIGHT',
      resourceId: 'res_ps5_1',
    });
    const { db } = await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    const session = db.gaming_sessions.find((s) => s.id === started.sessionId);
    expect(session).toMatchObject({ period: 'NIGHT', rate_per_minute: 2000, amount: 10000 });
  });

  it('leaves a running session on the rate it started with', async () => {
    const backend = await fresh();
    const started = await backend.startSession({
      actorId: STAFF,
      period: 'DAY',
      resourceId: 'res_ps5_1',
    });
    await backend.updatePricingRule({
      actorId: OWNER,
      ruleId: 'rule_ps5_day',
      patch: { rate_per_minute: 9900 },
    });
    const { db } = await backend.stopSession({ actorId: STAFF, sessionId: started.sessionId });
    expect(db.gaming_sessions.find((s) => s.id === started.sessionId)?.rate_per_minute).toBe(1000);
  });
});

describe('cash reconciliation', () => {
  it('computes expected cash from float, sales, settlements and expenses', async () => {
    const backend = await fresh();
    await backend.setOpeningCash({ actorId: OWNER, day: DAY, amount: 200000 });

    const cashSale = await billWith(backend, 'prod_cig_pack'); // ₹350 cash
    await backend.completeSale({ actorId: STAFF, saleId: cashSale, method: 'CASH', clientOpId: 'c-1' });

    const upiSale = await billWith(backend, 'prod_maggie'); // ₹50 UPI, not cash
    await backend.completeSale({ actorId: STAFF, saleId: upiSale, method: 'UPI', clientOpId: 'c-2' });

    const { customerId } = await backend.createCustomer({ actorId: STAFF, name: 'Rahul' });
    const dueSale = await billWith(backend, 'prod_sandwich'); // ₹60 on the tab
    await backend.completeSale({
      actorId: STAFF,
      saleId: dueSale,
      method: 'DUE',
      customerId,
      clientOpId: 'c-3',
    });
    await backend.settleDue({
      actorId: STAFF,
      customerId,
      amount: 6000,
      method: 'CASH',
      clientOpId: 'c-4',
    });

    const db = await backend.createExpense({
      actorId: STAFF,
      amount: 20000,
      category: 'SUPPLIES',
      reason: 'Milk',
    });

    const position = cashPosition(db, DAY);
    expect(position.openingCash).toBe(200000);
    expect(position.cashSales).toBe(35000);
    expect(position.cashSettlements).toBe(6000);
    expect(position.cashExpenses).toBe(20000);
    expect(position.expectedCash).toBe(221000);
    // Revenue counts all three sales; the settlement adds nothing to it.
    expect(position.revenue).toBe(46000);
  });

  it('freezes the difference at close and blocks further writes to that day', async () => {
    const backend = await fresh();
    await backend.setOpeningCash({ actorId: OWNER, day: DAY, amount: 200000 });
    const saleId = await billWith(backend, 'prod_coke');
    await backend.completeSale({ actorId: STAFF, saleId, method: 'CASH', clientOpId: 'c-5' });

    const db = await backend.closeDay({ actorId: OWNER, day: DAY, actualCash: 203500 });
    const closing = db.daily_closings.find((c) => c.business_day === DAY);
    expect(closing).toMatchObject({
      status: 'CLOSED',
      expected_cash: 204000,
      actual_cash: 203500,
      difference: -500,
      closed_by: OWNER,
    });

    await expect(
      backend.createExpense({ actorId: STAFF, amount: 100, category: 'OTHER', reason: 'late' }),
    ).rejects.toMatchObject({ code: 'DAY_CLOSED' });
  });

  it('refuses to close while a bill is still open', async () => {
    const backend = await fresh();
    await billWith(backend, 'prod_coke');
    await expect(
      backend.closeDay({ actorId: OWNER, day: DAY, actualCash: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to close while a game is running', async () => {
    const backend = await fresh();
    await backend.startSession({ actorId: STAFF, period: 'DAY', resourceId: 'res_ps5_1' });
    await expect(
      backend.closeDay({ actorId: OWNER, day: DAY, actualCash: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('does not let staff close the day', async () => {
    const backend = await fresh();
    await expect(
      backend.closeDay({ actorId: STAFF, day: DAY, actualCash: 0 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('atomicity', () => {
  it('writes nothing at all when part of a checkout fails', async () => {
    const backend = await fresh();
    const { sale } = await backend.openBill({ actorId: STAFF });
    await backend.addProductToBill({
      actorId: STAFF,
      saleId: sale.id,
      productId: 'prod_coke',
      quantity: 2,
    });

    // Someone else clears the shelf between adding and paying.
    await backend.recordStockMovement({
      actorId: OWNER,
      productId: 'prod_coke',
      movement: 'DAMAGED',
      quantityChange: -30,
    });

    await expect(
      backend.completeSale({ actorId: STAFF, saleId: sale.id, method: 'CASH', clientOpId: 'op-15' }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });

    const db = await backend.load();
    expect(db.sales.find((s) => s.id === sale.id)?.status).toBe('OPEN');
    expect(db.payments).toHaveLength(0);
    expect(product(db, 'prod_coke').stock).toBe(0);
  });
});

describe('permissions', () => {
  it('does not let staff change a price', async () => {
    const backend = await fresh();
    await expect(
      backend.upsertProduct({
        actorId: STAFF,
        product: {
          id: 'prod_coke',
          category_id: 'cat_drinks',
          name: 'Coke',
          price: 100,
          low_stock_threshold: 10,
          track_stock: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not let staff manage other staff', async () => {
    const backend = await fresh();
    await expect(
      backend.upsertStaff({
        actorId: STAFF,
        staff: { full_name: 'Ghost', role: 'OWNER', pin: '0000', active: true },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets staff take money and create dues', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_water');
    await expect(
      backend.completeSale({ actorId: STAFF, saleId, method: 'CASH', clientOpId: 'op-16' }),
    ).resolves.toBeTruthy();
  });
});

describe('removing a product', () => {
  it('lets the owner take an item off the menu and put it back', async () => {
    const backend = await fresh();
    let db = await backend.archiveProduct({ actorId: OWNER, productId: 'prod_lighter' });
    expect(product(db, 'prod_lighter').archived).toBe(true);
    db = await backend.archiveProduct({ actorId: OWNER, productId: 'prod_lighter', restore: true });
    expect(product(db, 'prod_lighter').archived).toBe(false);
  });

  it('is refused to a manager', async () => {
    const backend = await fresh();
    await expect(
      backend.archiveProduct({ actorId: 'staff_manager', productId: 'prod_lighter' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps a removed item on the sales it was already part of', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_lighter');
    await backend.completeSale({ actorId: STAFF, saleId, method: 'CASH', clientOpId: 'rm-1' });
    const db = await backend.archiveProduct({ actorId: OWNER, productId: 'prod_lighter' });
    expect(db.sale_items.some((i) => i.sale_id === saleId && i.product_id === 'prod_lighter')).toBe(true);
    expect(dayTotals(db, DAY).revenue).toBe(2000);
  });
});

describe('audit', () => {
  it('stamps the acting staff member on every recorded action', async () => {
    const backend = await fresh();
    const saleId = await billWith(backend, 'prod_coke');
    const { db } = await backend.completeSale({
      actorId: STAFF,
      saleId,
      method: 'CASH',
      clientOpId: 'op-17',
    });
    const actions = db.audit_logs.map((l) => l.action);
    expect(actions).toContain('SALE_OPENED');
    expect(actions).toContain('PAYMENT_CREATED');
    expect(actions).toContain('SALE_COMPLETED');
    expect(db.audit_logs.every((l) => !!l.actor_id)).toBe(true);
  });
});
