import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppError } from '@/data/errors';
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
import { balanceOf } from '@/domain/ledger';
import { formatMoney } from '@/domain/money';
import { can, type Permission } from '@/domain/permissions';
import { priceSession, rateLabel, resolvePricingRule } from '@/domain/pricing';
import { dayTotals } from '@/domain/reporting';
import { businessDayOf, currentBusinessDay, nowIso } from '@/domain/time';
import type {
  AuditAction,
  Database,
  DayKey,
  ID,
  Profile,
  ResourceStatus,
  Sale,
  Settings,
} from '@/domain/types';

import { buildSeed, newId, SCHEMA_VERSION } from './seed';

const STORAGE_KEY = 'happyhour.db.v1';

interface TxContext {
  actor: Profile;
  now: string;
  day: DayKey;
  audit: (entry: {
    action: AuditAction;
    entity_type: string;
    entity_id: ID;
    summary: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }) => void;
}

/**
 * Device-local implementation of {@link Backend}.
 *
 * Two properties make this safe to swap for Postgres later without changing any screen:
 *
 * 1. **Atomicity.** Every operation runs against a deep clone. The clone is committed
 *    and persisted only if the whole operation returns without throwing, so a failed
 *    checkout leaves no half-written sale — the same guarantee a `BEGIN/COMMIT` gives.
 * 2. **Serialisation.** Operations run one at a time through a promise queue, so two
 *    taps racing for the last Coke or the same PS5 are ordered, and the second one sees
 *    the first one's result.
 */
export class LocalBackend implements Backend {
  readonly kind = 'local' as const;

  private db: Database | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async load(): Promise<Database> {
    if (this.db) return this.db;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Database;
        if (parsed.schema_version === SCHEMA_VERSION) {
          this.db = parsed;
          return parsed;
        }
      } catch {
        // Corrupt payload: fall through to a fresh seed rather than trapping the app.
      }
    }
    const seed = buildSeed();
    this.db = seed;
    await this.persist(seed);
    return seed;
  }

  async resetToSeed(): Promise<Database> {
    const seed = buildSeed();
    this.db = seed;
    await this.persist(seed);
    return seed;
  }

  async signIn({ profileId, pin }: { profileId: ID; pin: string }): Promise<{ profile: Profile }> {
    const db = await this.load();
    const profile = db.profiles.find((p) => p.id === profileId);
    if (!profile || !profile.active) {
      throw new AppError('NOT_AUTHENTICATED', 'That staff account is not available.');
    }
    if (profile.pin !== pin) {
      throw new AppError('NOT_AUTHENTICATED', 'Wrong PIN.');
    }
    return { profile };
  }

  // ---------------------------------------------------------------- plumbing

  private async persist(db: Database): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  /**
   * Runs `fn` inside a serialised, all-or-nothing transaction.
   * Throwing anywhere inside `fn` discards every change it made.
   */
  private tx<T>(
    actorId: ID,
    permission: Permission | null,
    fn: (db: Database, ctx: TxContext) => T,
  ): Promise<{ db: Database; result: T }> {
    const run = async (): Promise<{ db: Database; result: T }> => {
      const current = await this.load();
      const draft: Database = JSON.parse(JSON.stringify(current)) as Database;

      const actor = draft.profiles.find((p) => p.id === actorId);
      if (!actor || !actor.active) {
        throw new AppError('NOT_AUTHENTICATED', 'Sign in again to continue.');
      }
      if (permission && !can(actor.role, permission)) {
        throw new AppError('FORBIDDEN', `${actor.full_name} is not allowed to do that.`);
      }

      const now = nowIso();
      const day = businessDayOf(now, draft.settings.business_day_start_hour);
      const ctx: TxContext = {
        actor,
        now,
        day,
        audit: (entry) => {
          draft.audit_logs.push({
            id: newId('aud'),
            action: entry.action,
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            summary: entry.summary,
            before: entry.before ?? null,
            after: entry.after ?? null,
            business_day: day,
            created_at: now,
            actor_id: actor.id,
          });
        },
      };

      const result = fn(draft, ctx);

      this.db = draft;
      await this.persist(draft);
      return { db: draft, result };
    };

    // Chain onto the queue so operations never interleave.
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async mutate(
    actorId: ID,
    permission: Permission | null,
    fn: (db: Database, ctx: TxContext) => void,
  ): Promise<Database> {
    const { db } = await this.tx(actorId, permission, fn);
    return db;
  }

  // ------------------------------------------------------------ trading day

  async setOpeningCash({ actorId, day, amount }: OpeningCashInput): Promise<Database> {
    return this.mutate(actorId, 'day.open', (db, ctx) => {
      if (amount < 0) throw new AppError('INVALID_AMOUNT', 'Opening cash cannot be negative.');
      const closing = ensureDay(db, ctx.actor.id, ctx.now, day);
      if (closing.status === 'CLOSED') {
        throw new AppError('DAY_CLOSED', 'This day is closed. Reopen it first.');
      }
      const before = closing.opening_cash;
      closing.opening_cash = amount;
      ctx.audit({
        action: 'DAY_OPENED',
        entity_type: 'daily_closings',
        entity_id: closing.id,
        summary: `Opening cash set for ${day}`,
        before: { opening_cash: before },
        after: { opening_cash: amount },
      });
    });
  }

  async closeDay({ actorId, day, actualCash, note }: CloseDayInput): Promise<Database> {
    return this.mutate(actorId, 'day.close', (db, ctx) => {
      if (actualCash < 0) throw new AppError('INVALID_AMOUNT', 'Counted cash cannot be negative.');
      const closing = ensureDay(db, ctx.actor.id, ctx.now, day);
      if (closing.status === 'CLOSED') {
        throw new AppError('ALREADY_DONE', 'This day is already closed.');
      }
      const openBills = db.sales.filter((s) => s.business_day === day && s.status === 'OPEN');
      if (openBills.length > 0) {
        throw new AppError(
          'CONFLICT',
          `${openBills.length} bill${openBills.length > 1 ? 's are' : ' is'} still open. Check them out or discard them first.`,
        );
      }
      const active = db.gaming_sessions.filter(
        (s) => s.business_day === day && s.status === 'ACTIVE',
      );
      if (active.length > 0) {
        throw new AppError('CONFLICT', `${active.length} game${active.length > 1 ? 's are' : ' is'} still running.`);
      }

      const totals = dayTotals(db, day);
      const expected =
        closing.opening_cash + totals.cashSales + totals.cashSettlements - totals.cashExpenses;

      closing.status = 'CLOSED';
      closing.cash_sales = totals.cashSales;
      closing.cash_settlements = totals.cashSettlements;
      closing.cash_expenses = totals.cashExpenses;
      closing.expected_cash = expected;
      closing.actual_cash = actualCash;
      closing.difference = actualCash - expected;
      closing.upi_sales = totals.upiSales;
      closing.upi_settlements = totals.upiSettlements;
      closing.new_dues = totals.newDues;
      closing.revenue = totals.revenue;
      closing.note = note ?? null;
      closing.closed_at = ctx.now;
      closing.closed_by = ctx.actor.id;

      ctx.audit({
        action: 'DAY_CLOSED',
        entity_type: 'daily_closings',
        entity_id: closing.id,
        summary: `Day ${day} closed, difference ${formatMoney(closing.difference)}`,
        after: {
          expected_cash: expected,
          actual_cash: actualCash,
          difference: closing.difference,
        },
      });
    });
  }

  async reopenDay({
    actorId,
    day,
    reason,
  }: {
    actorId: ID;
    day: DayKey;
    reason: string;
  }): Promise<Database> {
    return this.mutate(actorId, 'day.reopen', (db, ctx) => {
      const closing = db.daily_closings.find((c) => c.business_day === day);
      if (!closing) throw new AppError('NOT_FOUND', 'That day has no record.');
      if (closing.status !== 'CLOSED') throw new AppError('ALREADY_DONE', 'That day is already open.');
      const before = { ...closing };
      closing.status = 'OPEN';
      closing.closed_at = null;
      closing.closed_by = null;
      closing.note = reason;
      ctx.audit({
        action: 'DAY_OPENED',
        entity_type: 'daily_closings',
        entity_id: closing.id,
        summary: `Day ${day} reopened: ${reason}`,
        before: { status: before.status, actual_cash: before.actual_cash },
        after: { status: 'OPEN' },
      });
    });
  }

  // --------------------------------------------------------- bills and sales

  async openBill({ actorId, customerId, label }: OpenBillInput): Promise<{ db: Database; sale: Sale }> {
    const { db, result } = await this.tx(actorId, 'sale.create', (draft, ctx) => {
      assertDayOpen(draft, ctx.day);
      return createBill(draft, ctx, customerId ?? null, label ?? null);
    });
    return { db, sale: result };
  }

  async addProductToBill({ actorId, saleId, productId, quantity }: AddProductInput): Promise<Database> {
    return this.mutate(actorId, 'sale.create', (db, ctx) => {
      const sale = mustFind(db.sales.find((s) => s.id === saleId), 'bill');
      assertBillOpen(sale);
      assertDayOpen(db, sale.business_day);
      const product = mustFind(db.products.find((p) => p.id === productId), 'product');
      if (quantity <= 0) throw new AppError('INVALID_AMOUNT', 'Quantity must be at least 1.');

      const existing = db.sale_items.find(
        (i) => i.sale_id === saleId && i.kind === 'PRODUCT' && i.product_id === productId,
      );
      const alreadyOnThisBill = existing?.quantity ?? 0;
      assertStock(db, product.id, alreadyOnThisBill + quantity, saleId);

      if (existing) {
        existing.quantity += quantity;
        existing.line_total = existing.quantity * existing.unit_price;
      } else {
        db.sale_items.push({
          id: newId('item'),
          sale_id: saleId,
          kind: 'PRODUCT',
          product_id: product.id,
          session_id: null,
          name: product.name,
          quantity,
          unit_price: product.price,
          line_total: product.price * quantity,
          created_at: ctx.now,
          created_by: ctx.actor.id,
        });
      }
      recalcBill(db, saleId);
    });
  }

  async changeBillItemQuantity({ actorId, itemId, quantity }: ChangeQuantityInput): Promise<Database> {
    return this.mutate(actorId, 'sale.create', (db) => {
      const item = mustFind(db.sale_items.find((i) => i.id === itemId), 'line');
      const sale = mustFind(db.sales.find((s) => s.id === item.sale_id), 'bill');
      assertBillOpen(sale);
      if (item.kind !== 'PRODUCT') {
        throw new AppError('CONFLICT', 'Game time is priced by the timer and cannot be edited.');
      }
      if (quantity <= 0) {
        db.sale_items = db.sale_items.filter((i) => i.id !== itemId);
      } else {
        if (item.product_id) assertStock(db, item.product_id, quantity, sale.id);
        item.quantity = quantity;
        item.line_total = item.unit_price * quantity;
      }
      recalcBill(db, sale.id);
    });
  }

  async removeBillItem({ actorId, itemId }: { actorId: ID; itemId: ID }): Promise<Database> {
    return this.mutate(actorId, 'sale.create', (db, ctx) => {
      const item = mustFind(db.sale_items.find((i) => i.id === itemId), 'line');
      const sale = mustFind(db.sales.find((s) => s.id === item.sale_id), 'bill');
      assertBillOpen(sale);
      if (item.kind === 'GAMING' && item.session_id) {
        const session = db.gaming_sessions.find((s) => s.id === item.session_id);
        if (session) session.status = 'VOIDED';
      }
      db.sale_items = db.sale_items.filter((i) => i.id !== itemId);
      recalcBill(db, sale.id);
      ctx.audit({
        action: 'SALE_ITEM_REMOVED',
        entity_type: 'sale_items',
        entity_id: itemId,
        summary: `${item.name} removed from bill #${sale.number}`,
        before: { name: item.name, line_total: item.line_total },
      });
    });
  }

  async setBillCustomer({
    actorId,
    saleId,
    customerId,
  }: {
    actorId: ID;
    saleId: ID;
    customerId: ID | null;
  }): Promise<Database> {
    return this.mutate(actorId, 'sale.create', (db) => {
      const sale = mustFind(db.sales.find((s) => s.id === saleId), 'bill');
      assertBillOpen(sale);
      if (customerId) mustFind(db.customers.find((c) => c.id === customerId), 'customer');
      sale.customer_id = customerId;
      for (const session of db.gaming_sessions.filter((s) => s.sale_id === saleId)) {
        session.customer_id = customerId;
      }
    });
  }

  async discardBill({ actorId, saleId }: { actorId: ID; saleId: ID }): Promise<Database> {
    return this.mutate(actorId, 'sale.create', (db, ctx) => {
      const sale = mustFind(db.sales.find((s) => s.id === saleId), 'bill');
      assertBillOpen(sale);
      const hasGaming = db.sale_items.some((i) => i.sale_id === saleId && i.kind === 'GAMING');
      if (hasGaming && !can(ctx.actor.role, 'sale.void')) {
        throw new AppError('FORBIDDEN', 'A bill with game time can only be discarded by a manager.');
      }
      const running = db.gaming_sessions.some(
        (s) => s.sale_id === saleId && s.status === 'ACTIVE',
      );
      if (running) throw new AppError('CONFLICT', 'Stop the running game before discarding.');

      sale.status = 'VOIDED';
      sale.voided_at = ctx.now;
      sale.voided_by = ctx.actor.id;
      sale.void_reason = 'Discarded before checkout';
      for (const session of db.gaming_sessions.filter((s) => s.sale_id === saleId)) {
        session.status = 'VOIDED';
      }
      ctx.audit({
        action: 'SALE_VOIDED',
        entity_type: 'sales',
        entity_id: sale.id,
        summary: `Bill #${sale.number} discarded before checkout`,
      });
    });
  }

  async completeSale({
    actorId,
    saleId,
    method,
    customerId,
    clientOpId,
  }: CompleteSaleInput): Promise<{ db: Database; saleId: ID }> {
    const { db, result } = await this.tx(actorId, 'sale.create', (draft, ctx) => {
      // Idempotency: a retry or a double tap replays the first answer instead of
      // creating a second sale.
      const already = draft.sales.find(
        (s) => s.client_op_id === clientOpId && s.status === 'COMPLETED',
      );
      if (already) return already.id;

      const sale = mustFind(draft.sales.find((s) => s.id === saleId), 'bill');
      assertBillOpen(sale);
      assertDayOpen(draft, sale.business_day);

      // Checked before the empty-bill guard: a bill holding only a running game has no
      // lines yet, and "stop the game" is the useful thing to tell the staff member.
      const running = draft.gaming_sessions.some((s) => s.sale_id === saleId && s.status === 'ACTIVE');
      if (running) throw new AppError('CONFLICT', 'Stop the running game before checkout.');

      const items = draft.sale_items.filter((i) => i.sale_id === saleId);
      if (items.length === 0) throw new AppError('EMPTY_BILL', 'Add something to the bill first.');

      const total = items.reduce((sum, i) => sum + i.line_total, 0);
      if (total <= 0) throw new AppError('INVALID_AMOUNT', 'This bill has no value.');

      const resolvedCustomer = customerId ?? sale.customer_id ?? null;
      if (method === 'DUE' && !resolvedCustomer) {
        throw new AppError('CUSTOMER_REQUIRED', 'Pick a customer before saving this as a due.');
      }

      // Stock comes off only now, when the sale is real.
      for (const item of items) {
        if (item.kind !== 'PRODUCT' || !item.product_id) continue;
        const product = mustFind(
          draft.products.find((p) => p.id === item.product_id),
          'product',
        );
        if (!product.track_stock) continue;
        if (product.stock < item.quantity) {
          throw new AppError(
            'OUT_OF_STOCK',
            `Only ${product.stock} ${product.name} left. Someone else just sold some.`,
          );
        }
        product.stock -= item.quantity;
        draft.inventory_transactions.push({
          id: newId('inv'),
          product_id: product.id,
          movement: 'SALE',
          quantity_change: -item.quantity,
          balance_after: product.stock,
          sale_id: sale.id,
          note: null,
          business_day: ctx.day,
          created_at: ctx.now,
          created_by: ctx.actor.id,
        });
      }

      sale.status = 'COMPLETED';
      sale.total = total;
      sale.checkout_method = method;
      sale.customer_id = resolvedCustomer;
      sale.completed_at = ctx.now;
      sale.completed_by = ctx.actor.id;
      sale.client_op_id = clientOpId;

      if (method === 'DUE') {
        // Guarded above, but keep the invariant explicit at the write site.
        if (!resolvedCustomer) throw new AppError('CUSTOMER_REQUIRED', 'Pick a customer first.');
        draft.due_transactions.push({
          id: newId('due'),
          customer_id: resolvedCustomer,
          direction: 'DEBIT',
          reason: 'SALE_DUE',
          amount: total,
          sale_id: sale.id,
          payment_id: null,
          note: null,
          business_day: ctx.day,
          created_at: ctx.now,
          created_by: ctx.actor.id,
        });
        ctx.audit({
          action: 'DUE_CREATED',
          entity_type: 'sales',
          entity_id: sale.id,
          summary: `Bill #${sale.number} added to dues`,
          after: { amount: total, customer_id: resolvedCustomer },
        });
      } else {
        const payment = {
          id: newId('pay'),
          kind: 'SALE' as const,
          sale_id: sale.id,
          customer_id: resolvedCustomer,
          method,
          amount: total,
          status: 'COMPLETED' as const,
          business_day: ctx.day,
          collected_by: ctx.actor.id,
          collected_at: ctx.now,
          voided_by: null,
          voided_at: null,
          void_reason: null,
          client_op_id: clientOpId,
        };
        draft.payments.push(payment);
        ctx.audit({
          action: 'PAYMENT_CREATED',
          entity_type: 'payments',
          entity_id: payment.id,
          summary: `${method} ${formatMoney(total)} collected for bill #${sale.number}`,
          after: { method, amount: total },
        });
      }

      for (const session of draft.gaming_sessions.filter((s) => s.sale_id === saleId)) {
        if (session.status === 'STOPPED') session.status = 'BILLED';
      }

      ctx.audit({
        action: 'SALE_COMPLETED',
        entity_type: 'sales',
        entity_id: sale.id,
        summary: `Bill #${sale.number} closed as ${method} for ${formatMoney(total)}`,
        after: { total, method },
      });

      return sale.id;
    });
    return { db, saleId: result };
  }

  async voidSale({
    actorId,
    saleId,
    reason,
  }: {
    actorId: ID;
    saleId: ID;
    reason: string;
  }): Promise<Database> {
    return this.mutate(actorId, 'sale.void', (db, ctx) => {
      const sale = mustFind(db.sales.find((s) => s.id === saleId), 'sale');
      if (sale.status !== 'COMPLETED') {
        throw new AppError('ALREADY_DONE', 'Only a completed sale can be voided.');
      }
      assertDayOpen(db, sale.business_day, 'That day is closed. Reopen it before voiding.');
      if (!reason.trim()) throw new AppError('CONFLICT', 'A void needs a reason.');

      // Stock goes back.
      for (const item of db.sale_items.filter((i) => i.sale_id === saleId)) {
        if (item.kind !== 'PRODUCT' || !item.product_id) continue;
        const product = db.products.find((p) => p.id === item.product_id);
        if (!product || !product.track_stock) continue;
        product.stock += item.quantity;
        db.inventory_transactions.push({
          id: newId('inv'),
          product_id: product.id,
          movement: 'RETURN',
          quantity_change: item.quantity,
          balance_after: product.stock,
          sale_id: sale.id,
          note: `Sale #${sale.number} voided`,
          business_day: ctx.day,
          created_at: ctx.now,
          created_by: ctx.actor.id,
        });
      }

      // Money comes back out.
      for (const payment of db.payments.filter(
        (p) => p.sale_id === saleId && p.status === 'COMPLETED',
      )) {
        payment.status = 'VOIDED';
        payment.voided_at = ctx.now;
        payment.voided_by = ctx.actor.id;
        payment.void_reason = reason;
      }

      // A due sale is reversed with a balancing credit; the original debit stays.
      if (sale.checkout_method === 'DUE' && sale.customer_id) {
        db.due_transactions.push({
          id: newId('due'),
          customer_id: sale.customer_id,
          direction: 'CREDIT',
          reason: 'SALE_VOID_REVERSAL',
          amount: sale.total,
          sale_id: sale.id,
          payment_id: null,
          note: reason,
          business_day: ctx.day,
          created_at: ctx.now,
          created_by: ctx.actor.id,
        });
      }

      for (const session of db.gaming_sessions.filter((s) => s.sale_id === saleId)) {
        session.status = 'VOIDED';
      }

      sale.status = 'VOIDED';
      sale.voided_at = ctx.now;
      sale.voided_by = ctx.actor.id;
      sale.void_reason = reason;

      ctx.audit({
        action: 'SALE_VOIDED',
        entity_type: 'sales',
        entity_id: sale.id,
        summary: `Sale #${sale.number} voided: ${reason}`,
        before: { total: sale.total, method: sale.checkout_method },
        after: { status: 'VOIDED' },
      });
    });
  }

  // -------------------------------------------------------------- gaming

  async startSession({
    actorId,
    resourceId,
    customerId,
    saleId,
    note,
  }: StartSessionInput): Promise<{ db: Database; sessionId: ID; saleId: ID }> {
    const { db, result } = await this.tx(actorId, 'session.start', (draft, ctx) => {
      assertDayOpen(draft, ctx.day);
      const resource = mustFind(
        draft.game_resources.find((r) => r.id === resourceId),
        'table',
      );
      // Serialised transactions make this check sufficient to stop two staff starting
      // the same console.
      if (resource.status !== 'AVAILABLE') {
        throw new AppError('RESOURCE_BUSY', `${resource.label} is ${resource.status.toLowerCase().replace('_', ' ')}.`);
      }
      const rule = resolvePricingRule(draft.pricing_rules, resource.game_type_id, resource.id);
      if (!rule) {
        throw new AppError('NO_PRICING', `No price is set up for ${resource.label}.`);
      }

      let bill: Sale;
      if (saleId) {
        bill = mustFind(draft.sales.find((s) => s.id === saleId), 'bill');
        assertBillOpen(bill);
      } else {
        bill = createBill(draft, ctx, customerId ?? null, resource.label);
      }

      const session = {
        id: newId('ses'),
        resource_id: resource.id,
        game_type_id: resource.game_type_id,
        sale_id: bill.id,
        customer_id: customerId ?? bill.customer_id ?? null,
        pricing_rule_id: rule.id,
        rate_per_minute: rule.rate_per_minute,
        minimum_charge: rule.minimum_charge,
        min_billable_minutes: rule.min_billable_minutes,
        billing_increment_minutes: rule.billing_increment_minutes,
        status: 'ACTIVE' as const,
        started_at: ctx.now,
        ended_at: null,
        billed_minutes: null,
        amount: null,
        business_day: ctx.day,
        started_by: ctx.actor.id,
        ended_by: null,
        note: note ?? null,
      };
      draft.gaming_sessions.push(session);
      resource.status = 'IN_USE';

      ctx.audit({
        action: 'SESSION_STARTED',
        entity_type: 'gaming_sessions',
        entity_id: session.id,
        summary: `${resource.label} started at ${rateLabel(rule)}`,
        after: { resource: resource.label, rate_per_minute: rule.rate_per_minute },
      });

      return { sessionId: session.id, saleId: bill.id };
    });
    return { db, sessionId: result.sessionId, saleId: result.saleId };
  }

  async stopSession({ actorId, sessionId }: StopSessionInput): Promise<{ db: Database; saleId: ID }> {
    const { db, result } = await this.tx(actorId, 'session.stop', (draft, ctx) => {
      const session = mustFind(
        draft.gaming_sessions.find((s) => s.id === sessionId),
        'session',
      );
      if (session.status !== 'ACTIVE') {
        throw new AppError('ALREADY_DONE', 'That game has already been stopped.');
      }
      const priced = priceSession({ ...session, ended_at: null }, ctx.now);
      const resource = draft.game_resources.find((r) => r.id === session.resource_id);

      session.status = 'STOPPED';
      session.ended_at = ctx.now;
      session.ended_by = ctx.actor.id;
      session.billed_minutes = priced.billedMinutes;
      session.amount = priced.amount;
      if (resource && resource.status === 'IN_USE') resource.status = 'AVAILABLE';

      draft.sale_items.push({
        id: newId('item'),
        sale_id: session.sale_id,
        kind: 'GAMING',
        product_id: null,
        session_id: session.id,
        name: resource?.label ?? 'Game time',
        quantity: priced.billedMinutes,
        unit_price: session.rate_per_minute,
        line_total: priced.amount,
        created_at: ctx.now,
        created_by: ctx.actor.id,
      });
      recalcBill(draft, session.sale_id);

      ctx.audit({
        action: 'SESSION_STOPPED',
        entity_type: 'gaming_sessions',
        entity_id: session.id,
        summary: `${resource?.label ?? 'Game'} stopped after ${priced.billedMinutes} min for ${formatMoney(priced.amount)}`,
        after: { billed_minutes: priced.billedMinutes, amount: priced.amount },
      });

      return session.sale_id;
    });
    return { db, saleId: result };
  }

  async setResourceStatus({
    actorId,
    resourceId,
    status,
  }: {
    actorId: ID;
    resourceId: ID;
    status: ResourceStatus;
  }): Promise<Database> {
    return this.mutate(actorId, 'resource.manage', (db, ctx) => {
      const resource = mustFind(db.game_resources.find((r) => r.id === resourceId), 'table');
      if (resource.status === 'IN_USE') {
        throw new AppError('RESOURCE_BUSY', 'Stop the running game first.');
      }
      if (status === 'IN_USE') {
        throw new AppError('CONFLICT', 'Start a session to put a table in use.');
      }
      const before = resource.status;
      resource.status = status;
      ctx.audit({
        action: 'RESOURCE_STATUS_CHANGED',
        entity_type: 'game_resources',
        entity_id: resource.id,
        summary: `${resource.label}: ${before} to ${status}`,
        before: { status: before },
        after: { status },
      });
    });
  }

  // ------------------------------------------------------ customers and dues

  async createCustomer({
    actorId,
    name,
    phone,
    notes,
  }: CreateCustomerInput): Promise<{ db: Database; customerId: ID }> {
    const { db, result } = await this.tx(actorId, 'customer.create', (draft, ctx) => {
      const trimmed = name.trim();
      if (!trimmed) throw new AppError('CONFLICT', 'A customer needs a name.');
      const customer = {
        id: newId('cus'),
        name: trimmed,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        archived: false,
        created_at: ctx.now,
        created_by: ctx.actor.id,
      };
      draft.customers.push(customer);
      ctx.audit({
        action: 'CUSTOMER_CREATED',
        entity_type: 'customers',
        entity_id: customer.id,
        summary: `Customer ${customer.name} added`,
      });
      return customer.id;
    });
    return { db, customerId: result };
  }

  async settleDue({
    actorId,
    customerId,
    amount,
    method,
    note,
    clientOpId,
  }: SettleDueInput): Promise<Database> {
    return this.mutate(actorId, 'due.settle', (db, ctx) => {
      if (db.payments.some((p) => p.client_op_id === clientOpId)) return; // already recorded
      if (amount <= 0) throw new AppError('INVALID_AMOUNT', 'Enter an amount to collect.');
      const customer = mustFind(db.customers.find((c) => c.id === customerId), 'customer');
      assertDayOpen(db, ctx.day);

      const outstanding = balanceOf(db.due_transactions, customerId);
      if (outstanding <= 0) {
        throw new AppError('ALREADY_DONE', `${customer.name} has nothing outstanding.`);
      }

      const payment = {
        id: newId('pay'),
        kind: 'DUE_SETTLEMENT' as const,
        sale_id: null,
        customer_id: customerId,
        method,
        amount,
        status: 'COMPLETED' as const,
        business_day: ctx.day,
        collected_by: ctx.actor.id,
        collected_at: ctx.now,
        voided_by: null,
        voided_at: null,
        void_reason: null,
        client_op_id: clientOpId,
      };
      db.payments.push(payment);
      db.due_transactions.push({
        id: newId('due'),
        customer_id: customerId,
        direction: 'CREDIT',
        reason: 'SETTLEMENT',
        amount,
        sale_id: null,
        payment_id: payment.id,
        note: note ?? null,
        business_day: ctx.day,
        created_at: ctx.now,
        created_by: ctx.actor.id,
      });

      ctx.audit({
        action: 'DUE_SETTLED',
        entity_type: 'payments',
        entity_id: payment.id,
        summary: `${customer.name} paid ${formatMoney(amount)} by ${method}`,
        before: { outstanding },
        after: { outstanding: outstanding - amount, method },
      });
    });
  }

  // ---------------------------------------------------------------- stock

  async recordStockMovement({
    actorId,
    productId,
    movement,
    quantityChange,
    note,
  }: StockMovementInput): Promise<Database> {
    const permission: Permission = movement === 'PURCHASE' ? 'inventory.add' : 'inventory.adjust';
    return this.mutate(actorId, permission, (db, ctx) => {
      if (quantityChange === 0) throw new AppError('INVALID_AMOUNT', 'Enter a quantity.');
      const product = mustFind(db.products.find((p) => p.id === productId), 'product');
      const next = product.stock + quantityChange;
      if (next < 0) {
        throw new AppError('OUT_OF_STOCK', `That would take ${product.name} below zero.`);
      }
      product.stock = next;
      product.updated_at = ctx.now;
      db.inventory_transactions.push({
        id: newId('inv'),
        product_id: product.id,
        movement,
        quantity_change: quantityChange,
        balance_after: next,
        sale_id: null,
        note: note ?? null,
        business_day: ctx.day,
        created_at: ctx.now,
        created_by: ctx.actor.id,
      });
      ctx.audit({
        action: movement === 'PURCHASE' ? 'INVENTORY_ADDED' : 'INVENTORY_ADJUSTED',
        entity_type: 'products',
        entity_id: product.id,
        summary: `${product.name} ${quantityChange > 0 ? '+' : ''}${quantityChange} (${movement})`,
        before: { stock: next - quantityChange },
        after: { stock: next },
      });
    });
  }

  // ------------------------------------------------------------ catalogue

  async upsertProduct({ actorId, product }: UpsertProductInput): Promise<Database> {
    return this.mutate(actorId, 'product.manage', (db, ctx) => {
      const name = product.name.trim();
      if (!name) throw new AppError('CONFLICT', 'A product needs a name.');
      if (product.price < 0) throw new AppError('INVALID_AMOUNT', 'Price cannot be negative.');

      if (product.id) {
        const existing = mustFind(db.products.find((p) => p.id === product.id), 'product');
        const priceChanged = existing.price !== product.price;
        if (priceChanged && !can(ctx.actor.role, 'price.manage')) {
          throw new AppError('FORBIDDEN', 'Only the owner can change prices.');
        }
        const before = { ...existing };
        existing.name = name;
        existing.category_id = product.category_id;
        existing.price = product.price;
        existing.low_stock_threshold = product.low_stock_threshold;
        existing.track_stock = product.track_stock;
        existing.updated_at = ctx.now;
        ctx.audit({
          action: priceChanged ? 'PRICE_CHANGED' : 'PRODUCT_UPDATED',
          entity_type: 'products',
          entity_id: existing.id,
          summary: priceChanged
            ? `${name} price ${formatMoney(before.price)} to ${formatMoney(product.price)}`
            : `${name} updated`,
          before: { name: before.name, price: before.price },
          after: { name, price: product.price },
        });
        return;
      }

      const created = {
        id: newId('prod'),
        category_id: product.category_id,
        name,
        price: product.price,
        stock: 0,
        low_stock_threshold: product.low_stock_threshold,
        track_stock: product.track_stock,
        archived: false,
        created_at: ctx.now,
        updated_at: ctx.now,
      };
      db.products.push(created);
      ctx.audit({
        action: 'PRODUCT_CREATED',
        entity_type: 'products',
        entity_id: created.id,
        summary: `${name} added at ${formatMoney(product.price)}`,
        after: { name, price: product.price },
      });
    });
  }

  async archiveProduct({ actorId, productId }: { actorId: ID; productId: ID }): Promise<Database> {
    return this.mutate(actorId, 'product.manage', (db, ctx) => {
      const product = mustFind(db.products.find((p) => p.id === productId), 'product');
      product.archived = true;
      product.updated_at = ctx.now;
      ctx.audit({
        action: 'PRODUCT_UPDATED',
        entity_type: 'products',
        entity_id: product.id,
        summary: `${product.name} archived`,
        after: { archived: true },
      });
    });
  }

  async updatePricingRule({ actorId, ruleId, patch }: UpdatePricingRuleInput): Promise<Database> {
    return this.mutate(actorId, 'price.manage', (db, ctx) => {
      const rule = mustFind(db.pricing_rules.find((r) => r.id === ruleId), 'pricing rule');
      const before = { ...rule };
      if (patch.rate_per_minute !== undefined) rule.rate_per_minute = patch.rate_per_minute;
      if (patch.minimum_charge !== undefined) rule.minimum_charge = patch.minimum_charge;
      if (patch.min_billable_minutes !== undefined)
        rule.min_billable_minutes = patch.min_billable_minutes;
      if (patch.billing_increment_minutes !== undefined)
        rule.billing_increment_minutes = patch.billing_increment_minutes;
      ctx.audit({
        action: 'PRICING_RULE_UPDATED',
        entity_type: 'pricing_rules',
        entity_id: rule.id,
        summary: `${rule.name} updated`,
        before: { rate_per_minute: before.rate_per_minute, minimum_charge: before.minimum_charge },
        after: { rate_per_minute: rule.rate_per_minute, minimum_charge: rule.minimum_charge },
      });
    });
  }

  // ----------------------------------------------------------------- cash

  async createExpense({ actorId, amount, category, reason }: CreateExpenseInput): Promise<Database> {
    return this.mutate(actorId, 'expense.create', (db, ctx) => {
      if (amount <= 0) throw new AppError('INVALID_AMOUNT', 'Enter an amount.');
      if (!reason.trim()) throw new AppError('CONFLICT', 'Say what the money was for.');
      assertDayOpen(db, ctx.day);
      const expense = {
        id: newId('exp'),
        amount,
        category,
        reason: reason.trim(),
        status: 'COMPLETED' as const,
        business_day: ctx.day,
        created_at: ctx.now,
        created_by: ctx.actor.id,
        voided_by: null,
        voided_at: null,
        void_reason: null,
      };
      db.cash_expenses.push(expense);
      ctx.audit({
        action: 'CASH_EXPENSE_CREATED',
        entity_type: 'cash_expenses',
        entity_id: expense.id,
        summary: `${expense.reason} paid in cash: ${formatMoney(amount)}`,
        after: { amount, category },
      });
    });
  }

  async voidExpense({
    actorId,
    expenseId,
    reason,
  }: {
    actorId: ID;
    expenseId: ID;
    reason: string;
  }): Promise<Database> {
    return this.mutate(actorId, 'expense.void', (db, ctx) => {
      const expense = mustFind(db.cash_expenses.find((e) => e.id === expenseId), 'expense');
      if (expense.status === 'VOIDED') throw new AppError('ALREADY_DONE', 'Already voided.');
      assertDayOpen(db, expense.business_day, 'That day is closed. Reopen it first.');
      expense.status = 'VOIDED';
      expense.voided_at = ctx.now;
      expense.voided_by = ctx.actor.id;
      expense.void_reason = reason;
      ctx.audit({
        action: 'CASH_EXPENSE_VOIDED',
        entity_type: 'cash_expenses',
        entity_id: expense.id,
        summary: `Expense voided: ${reason}`,
      });
    });
  }

  // ------------------------------------------------------ staff and settings

  async upsertStaff({ actorId, staff }: UpsertStaffInput): Promise<Database> {
    return this.mutate(actorId, 'staff.manage', (db, ctx) => {
      const name = staff.full_name.trim();
      if (!name) throw new AppError('CONFLICT', 'A staff member needs a name.');
      if (!/^\d{4}$/.test(staff.pin)) throw new AppError('CONFLICT', 'PIN must be 4 digits.');

      if (staff.id) {
        const existing = mustFind(db.profiles.find((p) => p.id === staff.id), 'staff member');
        if (existing.role === 'OWNER' && staff.role !== 'OWNER') {
          const owners = db.profiles.filter((p) => p.role === 'OWNER' && p.active);
          if (owners.length <= 1) throw new AppError('CONFLICT', 'The last owner cannot be demoted.');
        }
        const before = { role: existing.role, active: existing.active };
        const roleChanged = existing.role !== staff.role;
        existing.full_name = name;
        existing.role = staff.role;
        existing.pin = staff.pin;
        existing.active = staff.active;
        ctx.audit({
          action: roleChanged ? 'STAFF_ROLE_CHANGED' : 'STAFF_CREATED',
          entity_type: 'profiles',
          entity_id: existing.id,
          summary: roleChanged ? `${name}: ${before.role} to ${staff.role}` : `${name} updated`,
          before,
          after: { role: staff.role, active: staff.active },
        });
        return;
      }

      const created = {
        id: newId('staff'),
        full_name: name,
        role: staff.role,
        pin: staff.pin,
        active: staff.active,
        created_at: ctx.now,
      };
      db.profiles.push(created);
      ctx.audit({
        action: 'STAFF_CREATED',
        entity_type: 'profiles',
        entity_id: created.id,
        summary: `${name} added as ${staff.role}`,
        after: { role: staff.role },
      });
    });
  }

  async updateSettings({
    actorId,
    patch,
  }: {
    actorId: ID;
    patch: Partial<Settings>;
  }): Promise<Database> {
    return this.mutate(actorId, 'settings.manage', (db, ctx) => {
      const before = { ...db.settings };
      db.settings = { ...db.settings, ...patch };
      ctx.audit({
        action: 'PRODUCT_UPDATED',
        entity_type: 'settings',
        entity_id: 'settings',
        summary: 'Settings updated',
        before,
        after: { ...db.settings },
      });
    });
  }
}

// ------------------------------------------------------------------ helpers

function mustFind<T>(row: T | undefined, what: string): T {
  if (!row) throw new AppError('NOT_FOUND', `That ${what} no longer exists.`);
  return row;
}

function assertBillOpen(sale: Sale): void {
  if (sale.status !== 'OPEN') {
    throw new AppError('ALREADY_DONE', `Bill #${sale.number} is already ${sale.status.toLowerCase()}.`);
  }
}

function assertDayOpen(db: Database, day: DayKey, message?: string): void {
  const closing = db.daily_closings.find((c) => c.business_day === day);
  if (closing && closing.status === 'CLOSED') {
    throw new AppError('DAY_CLOSED', message ?? `${day} has been closed. Nothing can be added to it.`);
  }
}

/**
 * How much of a product is spoken for by *other* open bills. Stock is only deducted at
 * checkout, so this keeps two staff from each promising the last packet.
 */
function reservedElsewhere(db: Database, productId: ID, exceptSaleId: ID): number {
  const openSaleIds = new Set(
    db.sales.filter((s) => s.status === 'OPEN' && s.id !== exceptSaleId).map((s) => s.id),
  );
  return db.sale_items
    .filter((i) => i.product_id === productId && openSaleIds.has(i.sale_id))
    .reduce((sum, i) => sum + i.quantity, 0);
}

function assertStock(db: Database, productId: ID, wanted: number, saleId: ID): void {
  const product = mustFind(db.products.find((p) => p.id === productId), 'product');
  if (!product.track_stock) return;
  const available = product.stock - reservedElsewhere(db, productId, saleId);
  if (wanted > available) {
    throw new AppError(
      'OUT_OF_STOCK',
      available <= 0
        ? `${product.name} is out of stock.`
        : `Only ${available} ${product.name} available.`,
    );
  }
}

/**
 * Creates the trading-day record on first touch, carrying the float forward from the
 * last closed day so nobody is blocked at 9am waiting for a manager.
 */
function ensureDay(db: Database, actorId: ID, now: string, day: DayKey) {
  const existing = db.daily_closings.find((c) => c.business_day === day);
  if (existing) return existing;

  const previous = db.daily_closings
    .filter((c) => c.status === 'CLOSED' && c.business_day < day)
    .sort((a, b) => b.business_day.localeCompare(a.business_day))[0];

  const closing = {
    id: newId('day'),
    business_day: day,
    status: 'OPEN' as const,
    opening_cash: previous?.actual_cash ?? 0,
    opened_at: now,
    opened_by: actorId,
    cash_sales: null,
    cash_settlements: null,
    cash_expenses: null,
    expected_cash: null,
    actual_cash: null,
    difference: null,
    upi_sales: null,
    upi_settlements: null,
    new_dues: null,
    revenue: null,
    note: null,
    closed_at: null,
    closed_by: null,
  };
  db.daily_closings.push(closing);
  return closing;
}

function createBill(
  db: Database,
  ctx: TxContext,
  customerId: ID | null,
  label: string | null,
): Sale {
  ensureDay(db, ctx.actor.id, ctx.now, ctx.day);
  db.sale_counter += 1;
  const sale: Sale = {
    id: newId('sale'),
    number: db.sale_counter,
    customer_id: customerId,
    label,
    status: 'OPEN',
    business_day: ctx.day,
    checkout_method: null,
    total: 0,
    opened_at: ctx.now,
    completed_at: null,
    created_by: ctx.actor.id,
    completed_by: null,
    voided_by: null,
    voided_at: null,
    void_reason: null,
    client_op_id: null,
  };
  db.sales.push(sale);
  ctx.audit({
    action: 'SALE_OPENED',
    entity_type: 'sales',
    entity_id: sale.id,
    summary: `Bill #${sale.number} opened`,
  });
  return sale;
}

function recalcBill(db: Database, saleId: ID): void {
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) return;
  sale.total = db.sale_items
    .filter((i) => i.sale_id === saleId)
    .reduce((sum, i) => sum + i.line_total, 0);
}

export { currentBusinessDay };
