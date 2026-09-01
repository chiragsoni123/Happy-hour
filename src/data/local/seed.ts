import { rupeesToPaise } from '@/domain/money';
import { currentBusinessDay, nowIso } from '@/domain/time';
import type { Database, Product } from '@/domain/types';

export const SCHEMA_VERSION = 1;

let counter = 0;
/** Deterministic-enough ids without pulling in a uuid dependency. */
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

const now = () => nowIso();

/**
 * First-run contents. A real venue edits all of this from Settings; it exists so the app
 * is usable the second it opens rather than presenting empty screens.
 */
export function buildSeed(): Database {
  const created = now();
  const day = currentBusinessDay();

  const owner = {
    id: 'staff_owner',
    full_name: 'Owner',
    role: 'OWNER' as const,
    pin: '1234',
    active: true,
    created_at: created,
  };
  const manager = {
    id: 'staff_manager',
    full_name: 'Amit',
    role: 'MANAGER' as const,
    pin: '2222',
    active: true,
    created_at: created,
  };
  const staff = {
    id: 'staff_floor',
    full_name: 'Ravi',
    role: 'STAFF' as const,
    pin: '1111',
    active: true,
    created_at: created,
  };

  const categories = [
    { id: 'cat_drinks', name: 'Cold Drinks', glyph: 'cup', sort_order: 1, archived: false },
    { id: 'cat_snacks', name: 'Snacks', glyph: 'snack', sort_order: 2, archived: false },
    { id: 'cat_food', name: 'Food', glyph: 'bowl', sort_order: 3, archived: false },
    { id: 'cat_smokes', name: 'Cigarettes', glyph: 'smoke', sort_order: 4, archived: false },
    { id: 'cat_other', name: 'Other', glyph: 'dot', sort_order: 5, archived: false },
  ];

  const p = (
    id: string,
    category_id: string,
    name: string,
    rupees: number,
    stock: number,
    low = 10,
  ): Product => ({
    id,
    category_id,
    name,
    price: rupeesToPaise(rupees),
    stock,
    low_stock_threshold: low,
    track_stock: true,
    archived: false,
    created_at: created,
    updated_at: created,
  });

  const products: Product[] = [
    p('prod_coke', 'cat_drinks', 'Coke', 40, 30),
    p('prod_pepsi', 'cat_drinks', 'Pepsi', 40, 24),
    p('prod_sting', 'cat_drinks', 'Sting', 20, 40),
    p('prod_water', 'cat_drinks', 'Water', 20, 48),
    p('prod_chips', 'cat_snacks', 'Chips', 30, 26),
    p('prod_kurkure', 'cat_snacks', 'Kurkure', 20, 8),
    p('prod_popcorn', 'cat_snacks', 'Popcorn', 30, 6),
    p('prod_peanuts', 'cat_snacks', 'Peanuts', 20, 18),
    p('prod_maggie', 'cat_food', 'Maggie', 50, 23),
    p('prod_sandwich', 'cat_food', 'Sandwich', 60, 9),
    p('prod_omlette', 'cat_food', 'Omelette', 40, 15),
    p('prod_cig_single', 'cat_smokes', 'Cigarette (single)', 20, 42),
    p('prod_cig_pack', 'cat_smokes', 'Cigarette (pack)', 350, 12, 4),
    p('prod_freshener', 'cat_other', 'Mouth Freshener', 10, 30),
    p('prod_lighter', 'cat_other', 'Lighter', 20, 14),
  ];

  const gameTypes = [
    { id: 'gt_ps5', name: 'PS5', glyph: 'gamepad', sort_order: 1 },
    { id: 'gt_pool', name: 'Pool', glyph: 'pool', sort_order: 2 },
  ];

  const resources = [
    { id: 'res_ps5_1', game_type_id: 'gt_ps5', label: 'PS5 #1', status: 'AVAILABLE' as const, sort_order: 1 },
    { id: 'res_ps5_2', game_type_id: 'gt_ps5', label: 'PS5 #2', status: 'AVAILABLE' as const, sort_order: 2 },
    { id: 'res_ps5_3', game_type_id: 'gt_ps5', label: 'PS5 #3', status: 'AVAILABLE' as const, sort_order: 3 },
    { id: 'res_pool_1', game_type_id: 'gt_pool', label: 'Pool #1', status: 'AVAILABLE' as const, sort_order: 4 },
    { id: 'res_pool_2', game_type_id: 'gt_pool', label: 'Pool #2', status: 'AVAILABLE' as const, sort_order: 5 },
  ];

  const pricingRules = [
    {
      id: 'rule_ps5',
      game_type_id: 'gt_ps5',
      resource_id: null,
      name: 'PS5 standard',
      model: 'PER_MINUTE' as const,
      rate_per_minute: rupeesToPaise(10),
      minimum_charge: rupeesToPaise(50),
      min_billable_minutes: 5,
      billing_increment_minutes: 1,
      active: true,
      created_at: created,
    },
    {
      id: 'rule_pool',
      game_type_id: 'gt_pool',
      resource_id: null,
      name: 'Pool standard',
      model: 'PER_MINUTE' as const,
      rate_per_minute: rupeesToPaise(8),
      minimum_charge: rupeesToPaise(40),
      min_billable_minutes: 5,
      billing_increment_minutes: 1,
      active: true,
      created_at: created,
    },
  ];

  const inventoryOpening = products.map((product) => ({
    id: newId('inv'),
    product_id: product.id,
    movement: 'OPENING' as const,
    quantity_change: product.stock,
    balance_after: product.stock,
    sale_id: null,
    note: 'Opening stock',
    business_day: day,
    created_at: created,
    created_by: owner.id,
  }));

  return {
    schema_version: SCHEMA_VERSION,
    profiles: [owner, manager, staff],
    categories,
    products,
    game_types: gameTypes,
    game_resources: resources,
    pricing_rules: pricingRules,
    customers: [],
    sales: [],
    sale_items: [],
    payments: [],
    due_transactions: [],
    inventory_transactions: inventoryOpening,
    gaming_sessions: [],
    cash_expenses: [],
    daily_closings: [],
    audit_logs: [],
    settings: {
      venue_name: 'Happy Hour',
      upi_vpa: null,
      upi_payee_name: null,
      business_day_start_hour: 6,
      low_stock_banner: true,
    },
    sale_counter: 1000,
  };
}
