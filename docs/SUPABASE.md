# Supabase

The app is connected. Data lives in Postgres, every phone on the counter sees the same
tables, and the role rules are enforced by the database rather than by the app.

| | |
| --- | --- |
| Account | happy.hour.fnr@gmail.com |
| Organisation | Happy Hour |
| Project | `happy-hour` (`pjmizuqxdwvpkkszxfav`) |
| Region | `ap-south-1` — Mumbai |
| URL | `https://pjmizuqxdwvpkkszxfav.supabase.co` |
| Plan | Free ($0/month) |

Config lives in [`.env`](../.env). Only the publishable key is there; it is designed to
ship inside the app, and **the service-role key must never be added to this project**.
Pointing the app at a different Supabase project is a two-line change in that file.

---

## The one step left

Open the app and **create the owner account**. The first account to sign up becomes the
OWNER — a database trigger decides that, so it cannot be claimed by whoever signs up
second. Everyone after starts as STAFF, and the owner sets their role in **More → Staff**.

If sign-up asks you to confirm an email link, either click it, or turn off
**Authentication → Sign In / Providers → Confirm email** in the dashboard. For a counter
phone shared at shift change, turning it off is usually the practical choice.

## Two dashboard settings the password-reset link needs

"Forgot your password?" emails a link. Supabase verifies it, then redirects into the
app with a one-time code, and the app opens a screen to choose a new password. Two
things have to be true for that redirect to arrive:

**1. The app's addresses must be on the redirect allowlist.** Go to
**Authentication → URL Configuration → Redirect URLs** and add both:

```
exp://**
happyhour://**
```

The first is what Expo Go uses while developing (`exp://<laptop-ip>:8081/--/reset-password`);
the second is the real app. Without these, Supabase silently sends the person to the
Site URL instead, and nothing happens.

**2. Emails only reach team members until custom SMTP is set.** Supabase's built-in
mailer refuses any address that is not a member of the Supabase organisation. That is
fine for the owner's account; a staff member with a personal Gmail will see *"will only
email addresses on the project team"* when they try to reset. The fix is not a paid
plan — it is any SMTP provider with a free tier (Resend and Brevo both have one) entered
under **Project Settings → Authentication → SMTP Settings**. Until then, the owner can
reset a staff member's password from **Authentication → Users** in the dashboard.

The link works once, for an hour, and only on the phone that asked for it — the
exchange is PKCE, so the verifier lives on that device.

---

## How each write reaches the database

Nothing composes two round-trips to make one business action. Each of these is a single
transaction, so a failure part-way leaves nothing behind.

| App action | Database |
| --- | --- |
| Checkout | `complete_sale(sale, method, customer, client_op_id)` |
| Settle a due | `settle_due(customer, amount, method, note, client_op_id)` |
| Start / stop a game | `start_session(...)` / `stop_session(...)` |
| Void a sale | `void_sale(sale, reason)` |
| Add or correct stock | `record_stock_movement(...)` |
| Close / reopen a day | `close_day(...)` / `reopen_day(...)` |
| Open or discard a bill | `open_bill(...)` / `discard_bill(...)` |
| Bill lines, customers, expenses, products, settings | plain inserts and updates, guarded by RLS |

The guarantees that used to live in the local backend now live in SQL: `FOR UPDATE` on
the contended row serialises two staff racing for the last packet or the same PS5, a
partial unique index allows only one `ACTIVE` session per console, and unique indexes on
`sales.client_op_id` and `payments.client_op_id` make a double-tapped checkout replay the
first answer instead of charging twice.

## Security posture

- **No DELETE policy exists** on `sales`, `payments`, `due_transactions`,
  `inventory_transactions`, `gaming_sessions` or `audit_logs`. Financial history cannot be
  removed through the API by anyone; it is corrected with a new row.
- **Staff see only their own collections.** The `payments` and `cash_expenses` read
  policies scope non-managers to `collected_by = auth.uid()`.
- **Anonymous callers can do nothing.** Supabase grants `EXECUTE` to `anon` by default,
  which left every RPC reachable without signing in — and because they run
  `SECURITY DEFINER`, a guard like `if not is_manager()` would have evaluated to null
  rather than true and fallen straight through. That grant is revoked, and so is the
  default for any function added later.
- **Internal helpers are unreachable.** `handle_new_user`, `log_audit` and `ensure_day`
  have no grant to `authenticated`; they are only called from inside a trigger or another
  definer function.

The linter still reports "signed-in users can execute SECURITY DEFINER function" for the
RPCs above. That is intentional — those functions *are* the app's write API, and each one
checks the caller's role itself.

## Staying inside the free tier

The free plan gives 500 MB of database, 5 GB of egress a month, and pauses a project
after 7 days with no activity. A cafe using this daily will not trip the pause.

What was done to keep the other two comfortable for years rather than months:

- **Narrow columns.** Money is `integer` paise (up to ₹21,474,836 a row) instead of
  `bigint`; counts, minutes and thresholds are `smallint`. That roughly halves the width
  of every financial row.
- **A rolling read window.** The app pulls 45 days of transactional history on launch,
  plus anything still open, rather than the whole table. Startup cost and monthly egress
  stay flat as the years accumulate. `HISTORY_DAYS` in
  [`SupabaseBackend.ts`](../src/data/supabase/SupabaseBackend.ts) is the dial.
- **Dues are the deliberate exception.** An outstanding balance is the sum of a
  customer's entire history, so `due_transactions` is always fetched in full. It is a
  small table.
- **Audit pruning.** `audit_logs` grows fastest and ages worst. `prune_audit_logs(months)`
  is owner-only and defaults to keeping 18 months. Run it from the SQL editor once a year:

```sql
select prune_audit_logs(18);
```

Rough shape of the growth: about 1,400 rows a day for a busy venue, well under a
megabyte a day, so 500 MB is measured in years — with audit pruning the dominant lever.

## What is still worth building

- **An offline queue.** The device is no longer the source of truth, so a dropped
  connection now blocks a sale. Every operation already carries a `clientOpId` and the
  database has unique indexes on it, so replaying a queued write after reconnecting
  cannot double-charge anyone. `LocalBackend` stays in the repo as the tested reference
  for those rules and as the basis for that queue.
- **Realtime.** Two phones currently see each other's changes on their next write or
  relaunch, not instantly. Subscribing to `sales` and `gaming_sessions` would make the
  board live, at some egress cost.
- **Narrower refetches.** A write currently refetches the mirror. Refetching only the
  affected tables would cut egress further if it ever matters.
