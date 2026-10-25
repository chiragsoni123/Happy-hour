-- NOT YET APPLIED. Run this once in the Supabase SQL editor (Dashboard -> SQL Editor).
--
-- Without a DELETE policy on sale_items, row level security makes every delete succeed
-- with zero rows, so a product line on a bill can be reduced to 1 but never removed.
--
-- Only product lines on a bill that is still OPEN may be deleted. Game lines are
-- excluded because a game charge is corrected through set_gaming_amount, and nothing on
-- a completed or voided bill can be touched.
drop policy if exists sale_items_delete_open_product_lines on public.sale_items;

create policy sale_items_delete_open_product_lines
  on public.sale_items
  for delete
  to authenticated
  using (
    kind = 'PRODUCT'
    and exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id and s.status = 'OPEN'
    )
  );

-- Only if removing a line then fails with "permission denied" (not just "could not be
-- removed"), the table is also missing the privilege:
-- grant delete on public.sale_items to authenticated;
