import type { Paise } from './money';

export type ID = string;
export type ISODate = string;
export type DayKey = string;

export type Role = 'OWNER' | 'MANAGER' | 'STAFF';

export type PaymentMethod = 'CASH' | 'UPI';
/** What a staff member taps at checkout. DUE is settled later, so it is not a payment. */
export type CheckoutMethod = PaymentMethod | 'DUE';

export type SaleStatus = 'OPEN' | 'COMPLETED' | 'VOIDED';
export type PaymentStatus = 'COMPLETED' | 'VOIDED';
export type SessionStatus = 'ACTIVE' | 'STOPPED' | 'BILLED' | 'VOIDED';
export type ResourceStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'DISABLED';

export interface Profile {
  id: ID;
  full_name: string;
  role: Role;
  /** Local-auth only. Absent once Supabase Auth is in play. */
  pin?: string;
  active: boolean;
  created_at: ISODate;
}

export interface Category {
  id: ID;
  name: string;
  sort_order: number;
  /** Short glyph shown on the fast-tap grid. */
  glyph: string;
  archived: boolean;
}

export interface Product {
  id: ID;
  category_id: ID;
  name: string;
  /** Current selling price. Historical sales keep their own snapshot. */
  price: Paise;
  /** Derived from inventory_transactions; kept denormalised for fast reads. */
  stock: number;
  low_stock_threshold: number;
  /** Items that are not stock-tracked can opt out. */
  track_stock: boolean;
  archived: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface GameType {
  id: ID;
  name: string;
  glyph: string;
  sort_order: number;
}

export interface GameResource {
  id: ID;
  game_type_id: ID;
  label: string;
  status: ResourceStatus;
  sort_order: number;
}

export type PricingModel = 'PER_MINUTE';

export interface PricingRule {
  id: ID;
  game_type_id: ID;
  /** Optional override for one specific console/table. */
  resource_id: ID | null;
  name: string;
  model: PricingModel;
  rate_per_minute: Paise;
  minimum_charge: Paise;
  /** Charge at least this many minutes once a session starts. */
  min_billable_minutes: number;
  /** Round billable minutes up to this step (1 = exact minutes). */
  billing_increment_minutes: number;
  active: boolean;
  created_at: ISODate;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string | null;
  notes: string | null;
  archived: boolean;
  created_at: ISODate;
  created_by: ID;
}

/** An open bill and a completed sale are the same row at different points in its life. */
export interface Sale {
  id: ID;
  /** Human-facing short number, e.g. 1021. */
  number: number;
  customer_id: ID | null;
  /** Free label for a walk-in group with no customer record. */
  label: string | null;
  status: SaleStatus;
  business_day: DayKey;
  /** Set only when status = COMPLETED. */
  checkout_method: CheckoutMethod | null;
  total: Paise;
  opened_at: ISODate;
  completed_at: ISODate | null;
  created_by: ID;
  completed_by: ID | null;
  voided_by: ID | null;
  voided_at: ISODate | null;
  void_reason: string | null;
  /** Client-generated key that makes checkout idempotent across retries and double taps. */
  client_op_id: string | null;
}

export type SaleItemKind = 'PRODUCT' | 'GAMING';

export interface SaleItem {
  id: ID;
  sale_id: ID;
  kind: SaleItemKind;
  product_id: ID | null;
  session_id: ID | null;
  /** Snapshot of the name at the time of sale. */
  name: string;
  /** Products: units. Gaming: billable minutes. */
  quantity: number;
  /** Snapshot: price per unit / per minute when the line was created. Never re-read. */
  unit_price: Paise;
  line_total: Paise;
  created_at: ISODate;
  created_by: ID;
}

export type PaymentKind = 'SALE' | 'DUE_SETTLEMENT';

export interface Payment {
  id: ID;
  kind: PaymentKind;
  /** SALE payments reference the sale; settlements reference the customer. */
  sale_id: ID | null;
  customer_id: ID | null;
  method: PaymentMethod;
  amount: Paise;
  status: PaymentStatus;
  business_day: DayKey;
  collected_by: ID;
  collected_at: ISODate;
  voided_by: ID | null;
  voided_at: ISODate | null;
  void_reason: string | null;
  client_op_id: string | null;
}

/** DEBIT increases what the customer owes, CREDIT reduces it. Rows are never mutated. */
export type LedgerDirection = 'DEBIT' | 'CREDIT';
export type LedgerReason = 'SALE_DUE' | 'SETTLEMENT' | 'SALE_VOID_REVERSAL' | 'ADJUSTMENT';

export interface DueTransaction {
  id: ID;
  customer_id: ID;
  direction: LedgerDirection;
  reason: LedgerReason;
  amount: Paise;
  sale_id: ID | null;
  payment_id: ID | null;
  note: string | null;
  business_day: DayKey;
  created_at: ISODate;
  created_by: ID;
}

export type InventoryMovement =
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT'
  | 'DAMAGED'
  | 'RETURN'
  | 'OPENING';

export interface InventoryTransaction {
  id: ID;
  product_id: ID;
  movement: InventoryMovement;
  /** Signed: +50 purchase, -2 sale. */
  quantity_change: number;
  /** Stock after applying this movement, which makes discrepancies traceable. */
  balance_after: number;
  sale_id: ID | null;
  note: string | null;
  business_day: DayKey;
  created_at: ISODate;
  created_by: ID;
}

export interface GamingSession {
  id: ID;
  resource_id: ID;
  game_type_id: ID;
  sale_id: ID;
  customer_id: ID | null;
  pricing_rule_id: ID;
  /** Snapshot of the rule at start. A mid-session price change must not alter this bill. */
  rate_per_minute: Paise;
  minimum_charge: Paise;
  min_billable_minutes: number;
  billing_increment_minutes: number;
  status: SessionStatus;
  started_at: ISODate;
  ended_at: ISODate | null;
  billed_minutes: number | null;
  amount: Paise | null;
  business_day: DayKey;
  started_by: ID;
  ended_by: ID | null;
  note: string | null;
}

export type ExpenseCategory =
  | 'SUPPLIES'
  | 'FOOD'
  | 'MAINTENANCE'
  | 'SALARY'
  | 'UTILITIES'
  | 'OTHER';

export interface CashExpense {
  id: ID;
  amount: Paise;
  category: ExpenseCategory;
  reason: string;
  status: 'COMPLETED' | 'VOIDED';
  business_day: DayKey;
  created_at: ISODate;
  created_by: ID;
  voided_by: ID | null;
  voided_at: ISODate | null;
  void_reason: string | null;
}

export type DayStatus = 'OPEN' | 'CLOSED';

export interface DailyClosing {
  id: ID;
  business_day: DayKey;
  status: DayStatus;
  opening_cash: Paise;
  opened_at: ISODate;
  opened_by: ID;
  /** All figures below are frozen at close time. */
  cash_sales: Paise | null;
  cash_settlements: Paise | null;
  cash_expenses: Paise | null;
  expected_cash: Paise | null;
  actual_cash: Paise | null;
  difference: Paise | null;
  upi_sales: Paise | null;
  upi_settlements: Paise | null;
  new_dues: Paise | null;
  revenue: Paise | null;
  note: string | null;
  closed_at: ISODate | null;
  closed_by: ID | null;
}

export type AuditAction =
  | 'DAY_OPENED'
  | 'DAY_CLOSED'
  | 'SALE_OPENED'
  | 'SALE_ITEM_ADDED'
  | 'SALE_ITEM_REMOVED'
  | 'SALE_COMPLETED'
  | 'SALE_VOIDED'
  | 'PAYMENT_CREATED'
  | 'PAYMENT_VOIDED'
  | 'DUE_CREATED'
  | 'DUE_SETTLED'
  | 'SESSION_STARTED'
  | 'SESSION_STOPPED'
  | 'SESSION_VOIDED'
  | 'INVENTORY_ADDED'
  | 'INVENTORY_ADJUSTED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRICE_CHANGED'
  | 'PRICING_RULE_UPDATED'
  | 'RESOURCE_STATUS_CHANGED'
  | 'CASH_EXPENSE_CREATED'
  | 'CASH_EXPENSE_VOIDED'
  | 'CUSTOMER_CREATED'
  | 'STAFF_CREATED'
  | 'STAFF_ROLE_CHANGED'
  | 'STAFF_DEACTIVATED';

export interface AuditLog {
  id: ID;
  action: AuditAction;
  entity_type: string;
  entity_id: ID;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  business_day: DayKey;
  created_at: ISODate;
  actor_id: ID;
}

export interface Settings {
  venue_name: string;
  upi_vpa: string | null;
  upi_payee_name: string | null;
  business_day_start_hour: number;
  low_stock_banner: boolean;
}

/** The whole persisted database. Table names match the Postgres schema 1:1. */
export interface Database {
  schema_version: number;
  profiles: Profile[];
  categories: Category[];
  products: Product[];
  game_types: GameType[];
  game_resources: GameResource[];
  pricing_rules: PricingRule[];
  customers: Customer[];
  sales: Sale[];
  sale_items: SaleItem[];
  payments: Payment[];
  due_transactions: DueTransaction[];
  inventory_transactions: InventoryTransaction[];
  gaming_sessions: GamingSession[];
  cash_expenses: CashExpense[];
  daily_closings: DailyClosing[];
  audit_logs: AuditLog[];
  settings: Settings;
  /** Monotonic counter behind `Sale.number`. */
  sale_counter: number;
}
