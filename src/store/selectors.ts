import { balancesByCustomer } from '@/domain/ledger';
import { priceSession } from '@/domain/pricing';
import type { PricedSession } from '@/domain/pricing';
import type {
  Category,
  Customer,
  Database,
  DayKey,
  GameResource,
  GameType,
  GamingSession,
  ID,
  Product,
  Sale,
  SaleItem,
} from '@/domain/types';

export interface ActiveSessionView {
  session: GamingSession;
  resource: GameResource;
  gameType: GameType;
  customer: Customer | null;
  sale: Sale;
  priced: PricedSession;
}

/** Everything the Home and Games screens need about a running game, priced to `nowIso`. */
export function activeSessions(db: Database, nowIso: string): ActiveSessionView[] {
  return db.gaming_sessions
    .filter((s) => s.status === 'ACTIVE')
    .map((session) => {
      const resource = db.game_resources.find((r) => r.id === session.resource_id);
      const gameType = db.game_types.find((t) => t.id === session.game_type_id);
      const sale = db.sales.find((s) => s.id === session.sale_id);
      if (!resource || !gameType || !sale) return null;
      return {
        session,
        resource,
        gameType,
        customer: db.customers.find((c) => c.id === session.customer_id) ?? null,
        sale,
        priced: priceSession(session, nowIso),
      };
    })
    .filter((v): v is ActiveSessionView => v !== null)
    .sort((a, b) => a.session.started_at.localeCompare(b.session.started_at));
}

export interface ResourceView {
  resource: GameResource;
  gameType: GameType;
  session: ActiveSessionView | null;
}

export function resourceBoard(db: Database, nowIso: string): ResourceView[] {
  const running = activeSessions(db, nowIso);
  return db.game_resources
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((resource) => {
      const gameType = db.game_types.find((t) => t.id === resource.game_type_id);
      if (!gameType) return null;
      return {
        resource,
        gameType,
        session: running.find((s) => s.session.resource_id === resource.id) ?? null,
      };
    })
    .filter((v): v is ResourceView => v !== null);
}

export interface BillView {
  sale: Sale;
  items: SaleItem[];
  customer: Customer | null;
  total: number;
  /** Live total including the still-running game, so the bill never looks too cheap. */
  runningTotal: number;
  activeSessions: ActiveSessionView[];
}

export function billView(db: Database, saleId: ID, nowIso: string): BillView | null {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) return null;
  const items = db.sale_items
    .filter((i) => i.sale_id === saleId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const live = activeSessions(db, nowIso).filter((s) => s.session.sale_id === saleId);
  const total = items.reduce((sum, i) => sum + i.line_total, 0);
  return {
    sale,
    items,
    customer: db.customers.find((c) => c.id === sale.customer_id) ?? null,
    total,
    runningTotal: total + live.reduce((sum, s) => sum + s.priced.amount, 0),
    activeSessions: live,
  };
}

export function openBills(db: Database, nowIso: string): BillView[] {
  return db.sales
    .filter((s) => s.status === 'OPEN')
    .map((s) => billView(db, s.id, nowIso))
    .filter((v): v is BillView => v !== null)
    .sort((a, b) => b.sale.opened_at.localeCompare(a.sale.opened_at));
}

export interface CategoryWithProducts {
  category: Category;
  products: Product[];
}

export function catalogue(db: Database): CategoryWithProducts[] {
  return db.categories
    .filter((c) => !c.archived)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({
      category,
      products: db.products
        .filter((p) => !p.archived && p.category_id === category.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.products.length > 0);
}

export function lowStockProducts(db: Database): Product[] {
  return db.products
    .filter((p) => !p.archived && p.track_stock && p.stock <= p.low_stock_threshold)
    .sort((a, b) => a.stock - b.stock);
}

export interface DebtorView {
  customer: Customer;
  balance: number;
  lastActivity: string | null;
}

/** Customers who owe money, biggest first. */
export function debtors(db: Database): DebtorView[] {
  const balances = balancesByCustomer(db.due_transactions);
  return db.customers
    .map((customer) => {
      const rows = db.due_transactions.filter((t) => t.customer_id === customer.id);
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      return {
        customer,
        balance: balances.get(customer.id) ?? 0,
        lastActivity: last?.created_at ?? null,
      };
    })
    .filter((d) => d.balance !== 0)
    .sort((a, b) => b.balance - a.balance);
}

export function searchCustomers(db: Database, query: string): DebtorView[] {
  const balances = balancesByCustomer(db.due_transactions);
  const q = query.trim().toLowerCase();
  return db.customers
    .filter((c) => !c.archived)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
    .map((customer) => ({
      customer,
      balance: balances.get(customer.id) ?? 0,
      lastActivity: null,
    }))
    .sort((a, b) => b.balance - a.balance || a.customer.name.localeCompare(b.customer.name))
    .slice(0, 40);
}

export function dayIsClosed(db: Database, day: DayKey): boolean {
  const closing = db.daily_closings.find((c) => c.business_day === day);
  return closing?.status === 'CLOSED';
}

export function profileName(db: Database, id: ID | null): string {
  if (!id) return '—';
  return db.profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';
}
