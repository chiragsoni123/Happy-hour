import type { Paise } from './money';
import { totalOutstanding } from './ledger';
import type {
  CashExpense,
  Database,
  DayKey,
  DueTransaction,
  ID,
  Payment,
  Sale,
  SaleItem,
} from './types';

/**
 * Every figure the owner sees is derived here from the underlying rows. Nothing in the
 * app stores a running total that could drift from the transactions behind it.
 *
 * The one distinction that decides whether the books are right:
 *   revenue  = value of goods and game time sold (CASH + UPI + DUE sales)
 *   cash/upi = money that physically arrived (sale payments + due settlements)
 * A due settlement moves money but is NOT revenue — it was already counted on the day
 * the due was created.
 */

/**
 * Inclusive span of business days. `null` means "everything loaded". Every report takes
 * one of these; a single day is just `{ from: d, to: d }`.
 */
export interface DayRange {
  from: DayKey;
  to: DayKey;
}

export function inRange(day: DayKey, range: DayRange | null): boolean {
  if (!range) return true;
  return day >= range.from && day <= range.to;
}

export function singleDay(day: DayKey): DayRange {
  return { from: day, to: day };
}

export interface DayTotals {
  /** The range these totals cover, echoed back for labelling. */
  range: DayRange | null;
  revenue: Paise;
  gamingRevenue: Paise;
  productRevenue: Paise;
  cashSales: Paise;
  upiSales: Paise;
  newDues: Paise;
  cashSettlements: Paise;
  upiSettlements: Paise;
  cashExpenses: Paise;
  /** Money in the drawer from trading, before opening float. */
  netCashMovement: Paise;
  saleCount: number;
  voidCount: number;
}

const isLiveSale = (s: Sale) => s.status === 'COMPLETED';
const isLivePayment = (p: Payment) => p.status === 'COMPLETED';
const isLiveExpense = (e: CashExpense) => e.status === 'COMPLETED';

export function dayTotals(db: Database, day: DayKey): DayTotals {
  return rangeTotals(db, singleDay(day));
}

export function rangeTotals(db: Database, range: DayRange | null): DayTotals {
  const sales = db.sales.filter((s) => inRange(s.business_day, range));
  const completed = sales.filter(isLiveSale);
  const completedIds = new Set(completed.map((s) => s.id));

  const items = db.sale_items.filter((i) => completedIds.has(i.sale_id));
  const gamingRevenue = sumBy(items.filter((i) => i.kind === 'GAMING'), (i) => i.line_total);
  const productRevenue = sumBy(items.filter((i) => i.kind === 'PRODUCT'), (i) => i.line_total);

  const payments = db.payments.filter((p) => inRange(p.business_day, range) && isLivePayment(p));
  const salePayments = payments.filter((p) => p.kind === 'SALE');
  const settlements = payments.filter((p) => p.kind === 'DUE_SETTLEMENT');

  const newDues = sumBy(
    db.due_transactions.filter(
      (t) => inRange(t.business_day, range) && t.direction === 'DEBIT' && t.reason === 'SALE_DUE',
    ),
    (t) => t.amount,
  );

  const cashSales = sumBy(salePayments.filter((p) => p.method === 'CASH'), (p) => p.amount);
  const upiSales = sumBy(salePayments.filter((p) => p.method === 'UPI'), (p) => p.amount);
  const cashSettlements = sumBy(settlements.filter((p) => p.method === 'CASH'), (p) => p.amount);
  const upiSettlements = sumBy(settlements.filter((p) => p.method === 'UPI'), (p) => p.amount);
  const cashExpenses = sumBy(
    db.cash_expenses.filter((e) => inRange(e.business_day, range) && isLiveExpense(e)),
    (e) => e.amount,
  );

  return {
    range,
    revenue: gamingRevenue + productRevenue,
    gamingRevenue,
    productRevenue,
    cashSales,
    upiSales,
    newDues,
    cashSettlements,
    upiSettlements,
    cashExpenses,
    netCashMovement: cashSales + cashSettlements - cashExpenses,
    saleCount: completed.length,
    voidCount: sales.filter((s) => s.status === 'VOIDED').length,
  };
}

export interface CashPosition extends DayTotals {
  openingCash: Paise;
  expectedCash: Paise;
  dayOpen: boolean;
  actualCash: Paise | null;
  difference: Paise | null;
}

/**
 * Expected drawer = opening float + cash sales + cash settlements - cash expenses.
 * This is the number the whole app exists to make trustworthy.
 */
export function cashPosition(db: Database, day: DayKey): CashPosition {
  const totals = dayTotals(db, day);
  const closing = db.daily_closings.find((c) => c.business_day === day);
  const openingCash = closing?.opening_cash ?? 0;
  const expectedCash = openingCash + totals.cashSales + totals.cashSettlements - totals.cashExpenses;
  return {
    ...totals,
    openingCash,
    expectedCash,
    dayOpen: closing ? closing.status === 'OPEN' : false,
    actualCash: closing?.actual_cash ?? null,
    difference: closing?.status === 'CLOSED' ? closing.difference : null,
  };
}

export interface GamingReportRow {
  gameTypeId: ID;
  name: string;
  sessions: number;
  minutes: number;
  revenue: Paise;
}

export function gamingReport(db: Database, range: DayRange | null): GamingReportRow[] {
  const sessions = db.gaming_sessions.filter(
    (s) => inRange(s.business_day, range) && s.status === 'BILLED',
  );
  return db.game_types
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((type) => {
      const rows = sessions.filter((s) => s.game_type_id === type.id);
      return {
        gameTypeId: type.id,
        name: type.name,
        sessions: rows.length,
        minutes: sumBy(rows, (s) => s.billed_minutes ?? 0),
        revenue: sumBy(rows, (s) => s.amount ?? 0),
      };
    })
    .filter((row) => row.sessions > 0);
}

export interface ProductReportRow {
  productId: ID;
  name: string;
  quantity: number;
  revenue: Paise;
}

export function productReport(db: Database, range: DayRange | null): ProductReportRow[] {
  const completedIds = new Set(
    db.sales.filter((s) => inRange(s.business_day, range) && isLiveSale(s)).map((s) => s.id),
  );
  const byProduct = new Map<ID, ProductReportRow>();
  for (const item of db.sale_items) {
    if (item.kind !== 'PRODUCT' || !item.product_id || !completedIds.has(item.sale_id)) continue;
    const row = byProduct.get(item.product_id) ?? {
      productId: item.product_id,
      name: item.name,
      quantity: 0,
      revenue: 0,
    };
    row.quantity += item.quantity;
    row.revenue += item.line_total;
    byProduct.set(item.product_id, row);
  }
  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface StaffReportRow {
  staffId: ID;
  name: string;
  transactions: number;
  cashCollected: Paise;
  upiCollected: Paise;
  duesCreated: Paise;
  settlements: Paise;
  voids: number;
}

export function staffReport(db: Database, range: DayRange | null): StaffReportRow[] {
  return db.profiles
    .map((profile) => {
      const payments = db.payments.filter(
        (p) => inRange(p.business_day, range) && p.collected_by === profile.id && isLivePayment(p),
      );
      const sales = db.sales.filter(
        (s) => inRange(s.business_day, range) && s.completed_by === profile.id && isLiveSale(s),
      );
      return {
        staffId: profile.id,
        name: profile.full_name,
        transactions: sales.length,
        cashCollected: sumBy(payments.filter((p) => p.method === 'CASH'), (p) => p.amount),
        upiCollected: sumBy(payments.filter((p) => p.method === 'UPI'), (p) => p.amount),
        duesCreated: sumBy(
          db.due_transactions.filter(
            (t) =>
              inRange(t.business_day, range) &&
              t.created_by === profile.id &&
              t.direction === 'DEBIT' &&
              t.reason === 'SALE_DUE',
          ),
          (t) => t.amount,
        ),
        settlements: sumBy(
          payments.filter((p) => p.kind === 'DUE_SETTLEMENT'),
          (p) => p.amount,
        ),
        voids: db.sales.filter((s) => inRange(s.business_day, range) && s.voided_by === profile.id).length,
      };
    })
    .filter(
      (r) =>
        r.transactions > 0 ||
        r.cashCollected > 0 ||
        r.upiCollected > 0 ||
        r.duesCreated > 0 ||
        r.voids > 0,
    );
}

export function outstandingDues(ledger: readonly DueTransaction[]): Paise {
  return totalOutstanding(ledger);
}

export function saleTotal(items: readonly SaleItem[]): Paise {
  return sumBy(items, (i) => i.line_total);
}

export function sumBy<T>(rows: readonly T[], pick: (row: T) => number): number {
  let total = 0;
  for (const row of rows) total += pick(row);
  return total;
}
