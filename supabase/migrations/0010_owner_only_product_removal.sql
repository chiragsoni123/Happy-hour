-- Applied to the live project on 2026-09-15 as migration 0010_owner_only_product_removal.
--
-- Taking a product off the menu (or putting it back) is the owner's call. Managers keep
-- their ability to edit everything else about a product; only the `archived` flag is
-- fenced. The app hides the button for non-owners; this is what actually enforces it.
--
-- A trigger rather than a policy because the update policy already has to allow
-- managers through for every other column, and a WITH CHECK cannot see the old row.
create or replace function guard_product_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archived is distinct from old.archived and not is_owner() then
    raise exception 'FORBIDDEN: only the owner can remove or restore a product';
  end if;
  return new;
end;
$$;

drop trigger if exists products_archive_guard on products;
create trigger products_archive_guard
  before update of archived on products
  for each row execute function guard_product_archive();

revoke execute on function guard_product_archive() from public, anon, authenticated;
