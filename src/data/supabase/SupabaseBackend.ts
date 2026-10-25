import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type {
  AddProductInput,
  Backend,
  ChangeQuantityInput,
  CloseDayInput,
  CompleteSaleInput,
  CreateCustomerInput,
  CreateExpenseInput,
  OpenBillInput,
  OpeningCashInput,
  SettleDueInput,
  StartSessionInput,
  StockMovementInput,
  StopSessionInput,
  UpdatePricingRuleInput,
  UpsertProductInput,
  UpsertStaffInput,
} from '@/data/backend';
import { AppError, type AppErrorCode } from '@/data/errors';
import { currentBusinessDay, nowIso, toDateKey } from '@/domain/time';
import type { Database, ID, ResourceStatus, Sale, Settings } from '@/domain/types';

import { getSupabase } from './client';

/**
 * How far back the app pulls transactional history on launch. Reports and the cash
 * drawer only ever look at recent days, so fetching a rolling window keeps both the
 * startup cost and the monthly egress flat as the years accumulate.
 *
 * Dues are the exception: an outstanding balance is the sum of a customer's whole
 * history, so `due_transactions` is always fetched in full. It is a small table.
 */
const HISTORY_DAYS = 45;
const AUDIT_PAGE = 200;
/** Last good snapshot, so a relaunch paints instantly instead of waiting on the network. */
const CACHE_KEY = 'happyhour.mirror.v1';

/** Small, and needed in full. */
const WHOLE_TABLES = [
  'profiles',
  'categories',
  'products',
  'game_types',
  'game_resources',
  'pricing_rules',
  'customers',
  // A customer's balance is the sum of their entire history, so this one is never windowed.
  'due_transactions',
  'settings',
] as const;

/** Grows forever, so only the recent window is pulled. */
const WINDOWED_TABLES = {
  sales: 'business_day',
  sale_items: 'created_at',
  payments: 'business_day',
  inventory_transactions: 'business_day',
  gaming_sessions: 'business_day',
  cash_expenses: 'business_day',
  daily_closings: 'business_day',
} as const;

type TableName = (typeof WHOLE_TABLES)[number] | keyof typeof WINDOWED_TABLES;

/** Checkout and void ripple the furthest: money, stock, dues and the day all move. */
const SALE_TABLES: readonly TableName[] = [
  'sales',
  'sale_items',
  'payments',
  'products',
  'inventory_transactions',
  'due_transactions',
  'gaming_sessions',
  'daily_closings',
];

/**
 * Talks to Postgres. Every write is one RPC or one RLS-guarded statement, so the
 * atomicity and the permission rules live in the database rather than here — this class
 * is a translator, not a place where business rules are decided.
 *
 * It keeps an in-memory mirror of the tables in the same shape as the local backend, so
 * no screen had to change. After a write it refetches only the tables that write could
 * have touched.
 */
export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;

  private db: Database | null = null;
  private readonly sb: SupabaseClient;

  constructor(client: SupabaseClient = getSupabase()) {
    this.sb = client;
  }

  // ---------------------------------------------------------------- reading

  async load(): Promise<Database> {
    const cutoff = historyCutoff();

    const [
      profiles,
      categories,
      products,
      gameTypes,
      resources,
      pricingRules,
      customers,
      sales,
      saleItems,
      payments,
      dues,
      inventory,
      sessions,
      expenses,
      closings,
      settings,
      audit,
    ] = await Promise.all([
      this.all('profiles'),
      this.all('categories'),
      this.all('products'),
      this.all('game_types'),
      this.all('game_resources'),
      this.all('pricing_rules'),
      this.all('customers'),
      this.since('sales', 'business_day', cutoff),
      this.since('sale_items', 'created_at', cutoff),
      this.since('payments', 'business_day', cutoff),
      this.all('due_transactions'),
      this.since('inventory_transactions', 'business_day', cutoff),
      this.since('gaming_sessions', 'business_day', cutoff),
      this.since('cash_expenses', 'business_day', cutoff),
      this.since('daily_closings', 'business_day', cutoff),
      this.all('settings'),
      // Folded into the same batch rather than awaited first: one fewer round trip
      // before the app can paint.
      this.actorIsOwner().then((owner) => (owner ? this.recentAudit() : [])),
    ]);

    // An open bill or a running game from before the window still has to be reachable,
    // otherwise a session left running over a long closure would vanish from the board.
    const strays = await this.strays(sales as Sale[]);

    this.db = {
      schema_version: 1,
      profiles: profiles as Database['profiles'],
      categories: categories as Database['categories'],
      products: products as Database['products'],
      game_types: gameTypes as Database['game_types'],
      game_resources: resources as Database['game_resources'],
      pricing_rules: pricingRules as Database['pricing_rules'],
      customers: customers as Database['customers'],
      sales: [...(sales as Database['sales']), ...strays.sales],
      sale_items: [...(saleItems as Database['sale_items']), ...strays.items],
      payments: payments as Database['payments'],
      due_transactions: dues as Database['due_transactions'],
      inventory_transactions: inventory as Database['inventory_transactions'],
      gaming_sessions: [...(sessions as Database['gaming_sessions']), ...strays.sessions],
      cash_expenses: expenses as Database['cash_expenses'],
      daily_closings: closings as Database['daily_closings'],
      audit_logs: audit as Database['audit_logs'],
      settings: (settings[0] as Settings | undefined) ?? defaultSettings(),
      sale_counter: maxNumber(sales as Sale[]),
    };
    this.cache(this.db);
    return this.db;
  }

  private async all(table: string): Promise<unknown[]> {
    const { data, error } = await this.sb.from(table).select('*');
    if (error) throw translate(error);
    return data ?? [];
  }

  private async since(
    table: string,
    column: string,
    cutoff: string,
  ): Promise<unknown[]> {
    const { data, error } = await this.sb.from(table).select('*').gte(column, cutoff);
    if (error) throw translate(error);
    return data ?? [];
  }

  private async recentAudit(): Promise<unknown[]> {
    const { data, error } = await this.sb
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(AUDIT_PAGE);
    // Staff have no read policy on audit_logs; an empty result is the expected answer
    // for them rather than a failure worth blocking the launch for.
    if (error) return [];
    return data ?? [];
  }

  /** Anything still open from before the history window. */
  private async strays(
    windowed: Sale[],
  ): Promise<{ sales: Database['sales']; items: Database['sale_items']; sessions: Database['gaming_sessions'] }> {
    const known = new Set(windowed.map((s) => s.id));
    const [openSales, activeSessions] = await Promise.all([
      this.sb.from('sales').select('*').eq('status', 'OPEN'),
      this.sb.from('gaming_sessions').select('*').eq('status', 'ACTIVE'),
    ]);
    const extraSales = ((openSales.data ?? []) as Database['sales']).filter((s) => !known.has(s.id));
    if (extraSales.length === 0) {
      return { sales: [], items: [], sessions: [] };
    }
    const ids = extraSales.map((s) => s.id);
    const { data: items } = await this.sb.from('sale_items').select('*').in('sale_id', ids);
    const sessions = ((activeSessions.data ?? []) as Database['gaming_sessions']).filter((s) =>
      ids.includes(s.sale_id),
    );
    return { sales: extraSales, items: (items ?? []) as Database['sale_items'], sessions };
  }

  /**
   * Reads the last snapshot off the device so the app can paint before the network
   * answers. Returns null on a first run or after a sign-out.
   */
  async hydrate(): Promise<Database | null> {
    if (this.db) return this.db;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Database;
      this.db = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  private cache(db: Database): void {
    // Fire and forget: a failed cache write must never fail the operation that caused it.
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(db)).catch(() => undefined);
  }

  /**
   * Refetches only the tables a write could have touched, and patches them into the
   * mirror. Pulling all seventeen after every tap was the single biggest source of
   * sluggishness, and on a metered free tier it is also the biggest source of egress.
   * Passing no list falls back to a full reload.
   */
  private async refresh(tables?: readonly TableName[]): Promise<Database> {
    const current = this.db;
    if (!tables || !current) return this.load();

    const cutoff = historyCutoff();
    const rows = await Promise.all(
      tables.map((table) => {
        const column = (WINDOWED_TABLES as Record<string, string | undefined>)[table];
        return column ? this.since(table, column, cutoff) : this.all(table);
      }),
    );

    const next: Database = { ...current };
    tables.forEach((table, i) => {
      const fetched = rows[i] ?? [];
      if (table === 'settings') {
        next.settings = (fetched[0] as Settings | undefined) ?? current.settings;
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as unknown as Record<string, unknown>)[table] = fetched;
    });

    // An open bill from before the window has to survive a targeted refresh of `sales`.
    if (tables.includes('sales')) {
      const known = new Set(next.sales.map((s) => s.id));
      const stillOpen = current.sales.filter((s) => s.status === 'OPEN' && !known.has(s.id));
      if (stillOpen.length > 0) next.sales = [...next.sales, ...stillOpen];
    }
    if (tables.includes('sale_items')) {
      const known = new Set(next.sale_items.map((i) => i.id));
      const saleIds = new Set(next.sales.filter((s) => s.status === 'OPEN').map((s) => s.id));
      const stray = current.sale_items.filter((i) => saleIds.has(i.sale_id) && !known.has(i.id));
      if (stray.length > 0) next.sale_items = [...next.sale_items, ...stray];
    }

    next.sale_counter = maxNumber(next.sales);
    this.db = next;
    this.cache(next);
    return next;
  }

  /** Cached for the session: a role change signs the person out anyway. */
  private ownerCheck: Promise<boolean> | null = null;

  private actorIsOwner(): Promise<boolean> {
    if (!this.ownerCheck) {
      this.ownerCheck = (async () => {
        const { data } = await this.sb.auth.getUser();
        if (!data.user) return false;
        const { data: profile } = await this.sb
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        return (profile as { role?: string } | null)?.role === 'OWNER';
      })();
    }
    return this.ownerCheck;
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw translate(error);
    return data as T;
  }

  private async write(
    tables: readonly TableName[],
    run: () => Promise<{ error: PostgrestError | null }>,
  ): Promise<Database> {
    const { error } = await run();
    if (error) throw translate(error);
    return this.refresh(tables);
  }

  // ------------------------------------------------------------ trading day

  async setOpeningCash({ day, amount }: OpeningCashInput): Promise<Database> {
    const userId = await this.requireUser();
    return this.write(['daily_closings'], async () =>
      this.sb
        .from('daily_closings')
        .upsert(
          { business_day: day, opening_cash: amount, opened_by: userId },
          { onConflict: 'business_day' },
        ),
    );
  }

  async closeDay({ day, actualCash, note }: CloseDayInput): Promise<Database> {
    await this.rpc('close_day', { p_day: day, p_actual_cash: actualCash, p_note: note ?? null });
    return this.refresh(['daily_closings']);
  }

  async reopenDay({ day, reason }: { actorId: ID; day: string; reason: string }): Promise<Database> {
    await this.rpc('reopen_day', { p_day: day, p_reason: reason });
    return this.refresh(['daily_closings']);
  }

  // --------------------------------------------------------- bills and sales

  async openBill({ customerId, label }: OpenBillInput): Promise<{ db: Database; sale: Sale }> {
    const saleId = await this.rpc<ID>('open_bill', {
      p_customer_id: customerId ?? null,
      p_label: label ?? null,
    });
    const db = await this.refresh(['sales', 'daily_closings']);
    const sale = db.sales.find((s) => s.id === saleId);
    if (!sale) throw new AppError('NOT_FOUND', 'The bill could not be opened.');
    return { db, sale };
  }

  async addProductToBill({ saleId, productId, quantity }: AddProductInput): Promise<Database> {
    const userId = await this.requireUser();
    const db = this.db ?? (await this.load());
    const product = db.products.find((p) => p.id === productId);
    if (!product) throw new AppError('NOT_FOUND', 'That product no longer exists.');

    const existing = db.sale_items.find(
      (i) => i.sale_id === saleId && i.kind === 'PRODUCT' && i.product_id === productId,
    );

    // A soft check against the cached stock so the common case fails at the tap rather
    // than at checkout. `complete_sale` is what actually guarantees it.
    const wanted = (existing?.quantity ?? 0) + quantity;
    if (product.track_stock && wanted > product.stock) {
      throw new AppError(
        'OUT_OF_STOCK',
        product.stock <= 0 ? `${product.name} is out of stock.` : `Only ${product.stock} ${product.name} left.`,
      );
    }

    if (existing) {
      const nextQty = existing.quantity + quantity;
      return this.write(['sales', 'sale_items'], async () =>
        this.sb
          .from('sale_items')
          .update({ quantity: nextQty, line_total: nextQty * existing.unit_price })
          .eq('id', existing.id),
      );
    }

    return this.write(['sales', 'sale_items'], async () =>
      this.sb.from('sale_items').insert({
        sale_id: saleId,
        kind: 'PRODUCT',
        product_id: product.id,
        name: product.name,
        quantity,
        // Snapshot: what this line charged, fixed for good.
        unit_price: product.price,
        line_total: product.price * quantity,
        created_by: userId,
      }),
    );
  }

  async changeBillItemQuantity({ itemId, quantity }: ChangeQuantityInput): Promise<Database> {
    const db = this.db ?? (await this.load());
    const item = db.sale_items.find((i) => i.id === itemId);
    if (!item) throw new AppError('NOT_FOUND', 'That line no longer exists.');
    if (item.kind !== 'PRODUCT') {
      throw new AppError('CONFLICT', 'Game time is priced by the timer and cannot be edited.');
    }
    if (quantity <= 0) {
      return this.write(['sales', 'sale_items'], async () =>
        this.sb.from('sale_items').delete().eq('id', itemId),
      );
    }
    return this.write(['sales', 'sale_items'], async () =>
      this.sb
        .from('sale_items')
        .update({ quantity, line_total: item.unit_price * quantity })
        .eq('id', itemId),
    );
  }

  async removeBillItem({ itemId }: { actorId: ID; itemId: ID }): Promise<Database> {
    return this.write(['sales', 'sale_items'], async () =>
      this.sb.from('sale_items').delete().eq('id', itemId),
    );
  }

  async setBillCustomer({
    saleId,
    customerId,
  }: {
    actorId: ID;
    saleId: ID;
    customerId: ID | null;
  }): Promise<Database> {
    return this.write(['sales'], async () =>
      this.sb.from('sales').update({ customer_id: customerId }).eq('id', saleId),
    );
  }

  async discardBill({ saleId }: { actorId: ID; saleId: ID }): Promise<Database> {
    await this.rpc('discard_bill', { p_sale_id: saleId });
    return this.refresh(['sales', 'gaming_sessions', 'game_resources']);
  }

  async completeSale({
    saleId,
    method,
    customerId,
    clientOpId,
  }: CompleteSaleInput): Promise<{ db: Database; saleId: ID }> {
    const id = await this.rpc<ID>('complete_sale', {
      p_sale_id: saleId,
      p_method: method,
      p_customer_id: customerId ?? null,
      p_client_op_id: clientOpId,
    });
    return { db: await this.refresh(SALE_TABLES), saleId: id };
  }

  async voidSale({ saleId, reason }: { actorId: ID; saleId: ID; reason: string }): Promise<Database> {
    await this.rpc('void_sale', { p_sale_id: saleId, p_reason: reason });
    return this.refresh(SALE_TABLES);
  }

  // -------------------------------------------------------------- gaming

  async startSession({
    resourceId,
    period,
    customerId,
    saleId,
  }: StartSessionInput): Promise<{ db: Database; sessionId: ID; saleId: ID }> {
    const result = await this.rpc<{ session_id: ID; sale_id: ID }>('start_session', {
      p_resource_id: resourceId,
      p_customer_id: customerId ?? null,
      p_sale_id: saleId ?? null,
      p_period: period,
    });
    const db = await this.refresh(['gaming_sessions', 'game_resources', 'sales']);
    return { db, sessionId: result.session_id, saleId: result.sale_id };
  }

  async stopSession({ sessionId, amount }: StopSessionInput): Promise<{ db: Database; saleId: ID }> {
    const saleId = await this.rpc<ID>('stop_session', {
      p_session_id: sessionId,
      p_amount: amount ?? null,
    });
    const db = await this.refresh(['gaming_sessions', 'game_resources', 'sales', 'sale_items']);
    return { db, saleId };
  }

  async setGamingAmount({
    sessionId,
    amount,
  }: {
    actorId: ID;
    sessionId: ID;
    amount: number;
  }): Promise<Database> {
    await this.rpc('set_gaming_amount', { p_session_id: sessionId, p_amount: amount });
    return this.refresh(['gaming_sessions', 'sales', 'sale_items']);
  }

  async setResourceStatus({
    resourceId,
    status,
  }: {
    actorId: ID;
    resourceId: ID;
    status: ResourceStatus;
  }): Promise<Database> {
    if (status === 'IN_USE') {
      throw new AppError('CONFLICT', 'Start a session to put a table in use.');
    }
    return this.write(['game_resources'], async () =>
      this.sb.from('game_resources').update({ status }).eq('id', resourceId).eq('status', 'AVAILABLE'),
    );
  }

  // ------------------------------------------------------ customers and dues

  async createCustomer({
    name,
    phone,
    notes,
  }: CreateCustomerInput): Promise<{ db: Database; customerId: ID }> {
    const userId = await this.requireUser();
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('CONFLICT', 'A customer needs a name.');
    const { data, error } = await this.sb
      .from('customers')
      .insert({
        name: trimmed,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) throw translate(error);
    return { db: await this.refresh(['customers']), customerId: (data as { id: ID }).id };
  }

  async settleDue({ customerId, amount, method, note, clientOpId }: SettleDueInput): Promise<Database> {
    await this.rpc('settle_due', {
      p_customer_id: customerId,
      p_amount: amount,
      p_method: method,
      p_note: note ?? null,
      p_client_op_id: clientOpId,
    });
    return this.refresh(['payments', 'due_transactions', 'daily_closings']);
  }

  // ---------------------------------------------------------------- stock

  async recordStockMovement({
    productId,
    movement,
    quantityChange,
    note,
  }: StockMovementInput): Promise<Database> {
    await this.rpc('record_stock_movement', {
      p_product_id: productId,
      p_movement: movement,
      p_change: quantityChange,
      p_note: note ?? null,
    });
    return this.refresh(['products', 'inventory_transactions']);
  }

  // ------------------------------------------------------------ catalogue

  async upsertProduct({ product }: UpsertProductInput): Promise<Database> {
    const name = product.name.trim();
    if (!name) throw new AppError('CONFLICT', 'A product needs a name.');
    const row = {
      category_id: product.category_id,
      name,
      price: product.price,
      low_stock_threshold: product.low_stock_threshold,
      track_stock: product.track_stock,
      updated_at: nowIso(),
    };
    if (product.id) {
      return this.write(['products'], async () =>
        this.sb.from('products').update(row).eq('id', product.id),
      );
    }
    return this.write(['products'], async () => this.sb.from('products').insert(row));
  }

  async archiveProduct({
    productId,
    restore = false,
  }: {
    actorId: ID;
    productId: ID;
    restore?: boolean;
  }): Promise<Database> {
    // The database only lets the owner change `archived`; see the guard trigger.
    return this.write(['products'], async () =>
      this.sb
        .from('products')
        .update({ archived: !restore, updated_at: nowIso() })
        .eq('id', productId),
    );
  }

  async updatePricingRule({ ruleId, patch }: UpdatePricingRuleInput): Promise<Database> {
    return this.write(['pricing_rules'], async () =>
      this.sb.from('pricing_rules').update(patch).eq('id', ruleId),
    );
  }

  // ----------------------------------------------------------------- cash

  async createExpense({ amount, category, reason }: CreateExpenseInput): Promise<Database> {
    const userId = await this.requireUser();
    if (amount <= 0) throw new AppError('INVALID_AMOUNT', 'Enter an amount.');
    if (!reason.trim()) throw new AppError('CONFLICT', 'Say what the money was for.');
    await this.ensureToday(userId);
    return this.write(['cash_expenses', 'daily_closings'], async () =>
      this.sb
        .from('cash_expenses')
        .insert({ amount, category, reason: reason.trim(), created_by: userId }),
    );
  }

  async voidExpense({
    expenseId,
    reason,
  }: {
    actorId: ID;
    expenseId: ID;
    reason: string;
  }): Promise<Database> {
    const userId = await this.requireUser();
    return this.write(['cash_expenses'], async () =>
      this.sb
        .from('cash_expenses')
        .update({
          status: 'VOIDED',
          voided_at: nowIso(),
          voided_by: userId,
          void_reason: reason,
        })
        .eq('id', expenseId),
    );
  }

  // ------------------------------------------------------ staff and settings

  async upsertStaff({ staff }: UpsertStaffInput): Promise<Database> {
    if (!staff.id) {
      throw new AppError(
        'CONFLICT',
        'New staff sign up on the app themselves, then you set their role here.',
      );
    }
    return this.write(['profiles'], async () =>
      this.sb
        .from('profiles')
        .update({ full_name: staff.full_name.trim(), role: staff.role, active: staff.active })
        .eq('id', staff.id),
    );
  }

  async updateSettings({ patch }: { actorId: ID; patch: Partial<Settings> }): Promise<Database> {
    return this.write(['settings'], async () => this.sb.from('settings').update(patch).eq('id', 1));
  }

  async resetToSeed(): Promise<Database> {
    throw new AppError('FORBIDDEN', 'The shared database cannot be reset from the app.');
  }

  // ---------------------------------------------------------------- helpers

  private async requireUser(): Promise<ID> {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new AppError('NOT_AUTHENTICATED', 'Sign in again to continue.');
    return data.user.id;
  }

  /** The trading day row has to exist before anything can be booked against it. */
  private async ensureToday(userId: ID): Promise<void> {
    const day = currentBusinessDay();
    const db = this.db;
    if (db?.daily_closings.some((c) => c.business_day === day)) return;
    await this.sb
      .from('daily_closings')
      .upsert({ business_day: day, opened_by: userId }, { onConflict: 'business_day', ignoreDuplicates: true });
  }
}

function historyCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - HISTORY_DAYS);
  return toDateKey(d);
}

function maxNumber(sales: Sale[]): number {
  return sales.reduce((max, s) => Math.max(max, s.number), 1000);
}

function defaultSettings(): Settings {
  return {
    venue_name: 'Happy Hour',
    upi_vpa: null,
    upi_payee_name: null,
    business_day_start_hour: 6,
    low_stock_banner: true,
  };
}

/**
 * The database raises errors as `CODE: message`, matching the codes the UI already knows
 * how to talk about. Anything unrecognised is passed through rather than dressed up as
 * something it is not.
 */
function translate(error: PostgrestError): AppError {
  const raw = error.message ?? 'Something went wrong.';
  const match = /^([A-Z_]+)(?::\s*(.*))?$/s.exec(raw.trim());
  const known: AppErrorCode[] = [
    'NOT_AUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'DAY_CLOSED',
    'RESOURCE_BUSY',
    'OUT_OF_STOCK',
    'EMPTY_BILL',
    'CUSTOMER_REQUIRED',
    'INVALID_AMOUNT',
    'ALREADY_DONE',
    'NO_PRICING',
    'CONFLICT',
  ];
  if (match) {
    const code = match[1] as AppErrorCode;
    if (known.includes(code)) {
      return new AppError(code, match[2]?.trim() || friendly(code));
    }
  }
  // Postgres codes the app can still explain in plain words.
  if (error.code === '23505') return new AppError('ALREADY_DONE', 'That was already recorded.');
  if (error.code === '42501') {
    return new AppError('FORBIDDEN', 'Your role does not allow that.');
  }
  if (error.code === 'PGRST301' || error.code === '401') {
    return new AppError('NOT_AUTHENTICATED', 'Sign in again to continue.');
  }
  return new AppError('CONFLICT', raw);
}

function friendly(code: AppErrorCode): string {
  switch (code) {
    case 'DAY_CLOSED':
      return 'That day has been closed. Nothing can be added to it.';
    case 'EMPTY_BILL':
      return 'Add something to the bill first.';
    case 'CUSTOMER_REQUIRED':
      return 'Pick a customer before saving this as a due.';
    case 'FORBIDDEN':
      return 'Your role does not allow that.';
    case 'NOT_AUTHENTICATED':
      return 'Sign in again to continue.';
    default:
      return 'That could not be completed.';
  }
}
