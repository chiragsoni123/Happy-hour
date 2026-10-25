jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() },
}));
jest.mock('../supabase/client', () => ({
  getSupabase: () => {
    throw new Error('the fake client is passed in');
  },
}));

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/domain/types';

import { AppError } from '../errors';
import { LocalBackend } from '../local/LocalBackend';
import { SupabaseBackend } from '../supabase/SupabaseBackend';

/**
 * Row level security answers a delete it does not allow with success and zero rows, not
 * with an error. This fake behaves that way: `rowsDeleted` is what the delete reports back.
 */
let deleteCalls = 0;

function fakeClient(
  rowsDeleted: { id: string }[],
  deleteError: { message: string; code: string } | null = null,
): SupabaseClient {
  return {
    from: () => {
      let deleting = false;
      const chain = {
        delete: () => {
          deleting = true;
          deleteCalls += 1;
          return chain;
        },
        update: () => {
          deleting = true;
          return chain;
        },
        eq: () => chain,
        gte: () => Promise.resolve({ data: [], error: null }),
        select: () =>
          deleting
            ? Promise.resolve({ data: deleteError ? null : rowsDeleted, error: deleteError })
            : chain,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

async function backendWithLine(
  rowsDeleted: { id: string }[],
  opts: { kind?: 'PRODUCT' | 'GAMING'; deleteError?: { message: string; code: string } } = {},
): Promise<SupabaseBackend> {
  const seed = await new LocalBackend().resetToSeed();
  const db = {
    ...seed,
    sales: [{ id: 'sale1', status: 'OPEN', number: 1001 }],
    sale_items: [
      { id: 'item1', sale_id: 'sale1', kind: opts.kind ?? 'PRODUCT', product_id: 'p1', quantity: 1, unit_price: 2000 },
    ],
  } as unknown as Database;
  const backend = new SupabaseBackend(fakeClient(rowsDeleted, opts.deleteError ?? null));
  (backend as unknown as { db: Database }).db = db;
  return backend;
}

beforeEach(() => {
  deleteCalls = 0;
});

describe('changing or removing a product line on a bill', () => {
  it('reports an error when the database deletes nothing', async () => {
    const backend = await backendWithLine([]);
    await expect(
      backend.changeBillItemQuantity({ actorId: 'a', itemId: 'item1', quantity: 0 }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(backend.removeBillItem({ actorId: 'a', itemId: 'item1' })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('succeeds when the database deletes the row', async () => {
    const backend = await backendWithLine([{ id: 'item1' }]);
    await expect(
      backend.changeBillItemQuantity({ actorId: 'a', itemId: 'item1', quantity: 0 }),
    ).resolves.toBeDefined();
  });

  it('shows the database error when the delete itself fails', async () => {
    const backend = await backendWithLine([], {
      deleteError: { message: 'permission denied', code: '42501' },
    });
    await expect(
      backend.changeBillItemQuantity({ actorId: 'a', itemId: 'item1', quantity: 0 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('never tries to delete a game line', async () => {
    const backend = await backendWithLine([{ id: 'item1' }], { kind: 'GAMING' });
    await expect(
      backend.changeBillItemQuantity({ actorId: 'a', itemId: 'item1', quantity: 0 }),
    ).rejects.toBeInstanceOf(AppError);
    expect(deleteCalls).toBe(0);
  });

  it('reports an error when a quantity change updates no row', async () => {
    const backend = await backendWithLine([]);
    await expect(
      backend.changeBillItemQuantity({ actorId: 'a', itemId: 'item1', quantity: 2 }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('applies a quantity change when the database updates the row', async () => {
    const backend = await backendWithLine([{ id: 'item1' }]);
    await expect(
      backend.changeBillItemQuantity({ actorId: 'a', itemId: 'item1', quantity: 2 }),
    ).resolves.toBeDefined();
  });
});
