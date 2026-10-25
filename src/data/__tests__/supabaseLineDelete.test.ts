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
function fakeClient(rowsDeleted: { id: string }[]): SupabaseClient {
  return {
    from: () => {
      let deleting = false;
      const chain = {
        delete: () => {
          deleting = true;
          return chain;
        },
        eq: () => chain,
        gte: () => Promise.resolve({ data: [], error: null }),
        select: () =>
          deleting ? Promise.resolve({ data: rowsDeleted, error: null }) : chain,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

async function backendWithLine(rowsDeleted: { id: string }[]): Promise<SupabaseBackend> {
  const seed = await new LocalBackend().resetToSeed();
  const db = {
    ...seed,
    sales: [{ id: 'sale1', status: 'OPEN', number: 1001 }],
    sale_items: [
      { id: 'item1', sale_id: 'sale1', kind: 'PRODUCT', product_id: 'p1', quantity: 1, unit_price: 2000 },
    ],
  } as unknown as Database;
  const backend = new SupabaseBackend(fakeClient(rowsDeleted));
  (backend as unknown as { db: Database }).db = db;
  return backend;
}

describe('removing a product line on a bill', () => {
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
});
