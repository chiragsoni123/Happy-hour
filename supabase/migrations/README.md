# Migrations

The schema now lives in the **live project**, not in this folder. It was applied as seven
migrations, in this order:

| Version | Name | What it does |
| --- | --- | --- |
| 20260831110603 | `0001_core_schema` | Types, tables, indexes, `business_day_of`, audit pruning |
| 20260831110634 | `0002_rls` | Row level security on every table |
| 20260831110747 | `0003_atomic_operations` | `complete_sale`, `settle_due`, `start_session`, `stop_session`, `void_sale`, `record_stock_movement`, `close_day`, `reopen_day` |
| 20260831110824 | `0004_auth_bootstrap_and_seed` | New-user trigger, starting catalogue, tables and rates |
| 20260831110915 | `0005_harden_function_grants` | Pinned `search_path`, explicit execute grants |
| 20260831110945 | `0006_revoke_anon_execute` | Removed the anonymous execute grant Supabase adds by default |
| 20260831111151 | `0007_discard_bill` | Guarded discard of an unpaid bill |

## Getting the SQL into this folder

The earlier hand-written `0001_init.sql` was deleted rather than left behind, because the
applied schema diverged from it — money columns were narrowed to `integer` paise, counts
to `smallint`, and the grants and `discard_bill` were added afterwards. A stale file that
looks authoritative is worse than no file.

To pull the real thing down (needs the database password from the dashboard):

```bash
npx supabase link --project-ref pjmizuqxdwvpkkszxfav
```

```bash
npx supabase db pull
```

That writes the applied migrations here, after which this folder is the source of truth
again and further changes go through `supabase db push`.
