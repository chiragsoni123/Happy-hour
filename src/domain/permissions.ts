import type { Role } from './types';

/**
 * The single source of truth for what a role may do in the UI. The identical matrix is
 * expressed as RLS policies in `supabase/migrations` — this table hides buttons, the
 * database is what actually enforces it.
 */
export const PERMISSIONS = [
  'sale.create',
  'sale.void',
  'session.start',
  'session.stop',
  'session.void',
  'payment.collect',
  'due.create',
  'due.settle',
  'due.adjust',
  'customer.create',
  'product.read',
  'product.manage',
  'price.manage',
  'inventory.read',
  'inventory.add',
  'inventory.adjust',
  'expense.create',
  'expense.void',
  'day.open',
  'day.close',
  'day.reopen',
  'report.basic',
  'report.full',
  'transaction.search',
  'staff.manage',
  'resource.manage',
  'audit.read',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF: Permission[] = [
  'sale.create',
  'session.start',
  'session.stop',
  'payment.collect',
  'due.create',
  'due.settle',
  'customer.create',
  'product.read',
  'inventory.read',
  'expense.create',
  'report.basic',
];

const MANAGER: Permission[] = [
  ...STAFF,
  'sale.void',
  'session.void',
  'inventory.add',
  'inventory.adjust',
  'expense.void',
  'day.open',
  'day.close',
  'report.full',
  'transaction.search',
  'resource.manage',
  'product.manage',
];

const OWNER: Permission[] = [...PERMISSIONS];

const MATRIX: Record<Role, readonly Permission[]> = {
  STAFF,
  MANAGER,
  OWNER,
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export const ROLE_BLURB: Record<Role, string> = {
  OWNER: 'Everything, including staff, pricing and audit',
  MANAGER: 'Sales, stock, reports and day closing',
  STAFF: 'Sales, games, dues and settlements',
};
