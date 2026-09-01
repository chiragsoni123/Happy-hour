import type { Paise } from '@/domain/money';
import type {
  CheckoutMethod,
  Database,
  DayKey,
  ExpenseCategory,
  ID,
  InventoryMovement,
  PaymentMethod,
  ResourceStatus,
  Role,
  Sale,
  Settings,
} from '@/domain/types';

/**
 * Everything that writes goes through this interface, and every method is one atomic
 * operation — the same granularity as the Postgres functions it will be swapped for.
 * No screen ever composes two writes to make one business action, so there is no state
 * in which a sale exists without its payment.
 *
 * `LocalBackend` is the current implementation (device-local, offline-first).
 * `SupabaseBackend` will implement the same methods as `rpc()` calls.
 */
export interface Backend {
  readonly kind: 'local' | 'supabase';

  load(): Promise<Database>;

  // ---- trading day -------------------------------------------------------
  setOpeningCash(input: OpeningCashInput): Promise<Database>;
  closeDay(input: CloseDayInput): Promise<Database>;
  reopenDay(input: { actorId: ID; day: DayKey; reason: string }): Promise<Database>;

  // ---- bills and sales ---------------------------------------------------
  openBill(input: OpenBillInput): Promise<{ db: Database; sale: Sale }>;
  addProductToBill(input: AddProductInput): Promise<Database>;
  changeBillItemQuantity(input: ChangeQuantityInput): Promise<Database>;
  removeBillItem(input: { actorId: ID; itemId: ID }): Promise<Database>;
  setBillCustomer(input: { actorId: ID; saleId: ID; customerId: ID | null }): Promise<Database>;
  discardBill(input: { actorId: ID; saleId: ID }): Promise<Database>;
  completeSale(input: CompleteSaleInput): Promise<{ db: Database; saleId: ID }>;
  voidSale(input: { actorId: ID; saleId: ID; reason: string }): Promise<Database>;

  // ---- gaming ------------------------------------------------------------
  startSession(input: StartSessionInput): Promise<{ db: Database; sessionId: ID; saleId: ID }>;
  stopSession(input: StopSessionInput): Promise<{ db: Database; saleId: ID }>;
  setResourceStatus(input: {
    actorId: ID;
    resourceId: ID;
    status: ResourceStatus;
  }): Promise<Database>;

  // ---- customers and dues ------------------------------------------------
  createCustomer(input: CreateCustomerInput): Promise<{ db: Database; customerId: ID }>;
  settleDue(input: SettleDueInput): Promise<Database>;

  // ---- inventory ---------------------------------------------------------
  recordStockMovement(input: StockMovementInput): Promise<Database>;

  // ---- catalogue ---------------------------------------------------------
  upsertProduct(input: UpsertProductInput): Promise<Database>;
  archiveProduct(input: { actorId: ID; productId: ID }): Promise<Database>;
  updatePricingRule(input: UpdatePricingRuleInput): Promise<Database>;

  // ---- cash --------------------------------------------------------------
  createExpense(input: CreateExpenseInput): Promise<Database>;
  voidExpense(input: { actorId: ID; expenseId: ID; reason: string }): Promise<Database>;

  // ---- staff and settings ------------------------------------------------
  upsertStaff(input: UpsertStaffInput): Promise<Database>;
  updateSettings(input: { actorId: ID; patch: Partial<Settings> }): Promise<Database>;

  /** Development helper; not exposed to any role in production. */
  resetToSeed(): Promise<Database>;
}

export interface OpeningCashInput {
  actorId: ID;
  day: DayKey;
  amount: Paise;
}

export interface CloseDayInput {
  actorId: ID;
  day: DayKey;
  actualCash: Paise;
  note?: string;
}

export interface OpenBillInput {
  actorId: ID;
  customerId?: ID | null;
  label?: string | null;
}

export interface AddProductInput {
  actorId: ID;
  saleId: ID;
  productId: ID;
  quantity: number;
}

export interface ChangeQuantityInput {
  actorId: ID;
  itemId: ID;
  quantity: number;
}

export interface CompleteSaleInput {
  actorId: ID;
  saleId: ID;
  method: CheckoutMethod;
  customerId?: ID | null;
  /** Makes the call idempotent: a retry with the same id returns the first result. */
  clientOpId: string;
}

export interface StartSessionInput {
  actorId: ID;
  resourceId: ID;
  customerId?: ID | null;
  /** Attach the game to an existing open bill instead of opening a new one. */
  saleId?: ID | null;
  note?: string | null;
}

export interface StopSessionInput {
  actorId: ID;
  sessionId: ID;
}

export interface CreateCustomerInput {
  actorId: ID;
  name: string;
  phone?: string | null;
  notes?: string | null;
}

export interface SettleDueInput {
  actorId: ID;
  customerId: ID;
  amount: Paise;
  method: PaymentMethod;
  note?: string | null;
  clientOpId: string;
}

export interface StockMovementInput {
  actorId: ID;
  productId: ID;
  movement: Exclude<InventoryMovement, 'SALE'>;
  /** Signed change: +50 for a purchase, -2 for damage. */
  quantityChange: number;
  note?: string | null;
}

export interface UpsertProductInput {
  actorId: ID;
  product: {
    id?: ID;
    category_id: ID;
    name: string;
    price: Paise;
    low_stock_threshold: number;
    track_stock: boolean;
  };
}

export interface UpdatePricingRuleInput {
  actorId: ID;
  ruleId: ID;
  patch: {
    rate_per_minute?: Paise;
    minimum_charge?: Paise;
    min_billable_minutes?: number;
    billing_increment_minutes?: number;
  };
}

export interface CreateExpenseInput {
  actorId: ID;
  amount: Paise;
  category: ExpenseCategory;
  reason: string;
}

export interface UpsertStaffInput {
  actorId: ID;
  staff: {
    id?: ID;
    full_name: string;
    role: Role;
    pin: string;
    active: boolean;
  };
}
