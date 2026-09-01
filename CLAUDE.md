# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npx expo start            # dev server; a / i / w for Android, iOS, web
npm test                  # 58 tests over the financial logic
npm run typecheck         # tsc --noEmit, strict + noUncheckedIndexedAccess
```

Run one test file or one case:

```bash
npx jest src/domain/__tests__/pricing.test.ts
```

```bash
npx jest -t "reverses a due with a balancing credit"
```

Jest uses `ts-jest` on Node, not `jest-expo`: it only covers `src/**/__tests__`, which is
pure TypeScript with no React Native runtime. There are no component tests. `@/*` maps to
`src/*` in both `tsconfig.json` and `jest.config.js` — add path aliases to both.

To check a change really bundles (Metro catches things `tsc` does not):

```bash
npx expo export --platform android --output-dir /tmp/export-check
```

There is no linter configured. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`
is what has been used to catch dead imports.

**The project is pinned to Expo SDK 54 on purpose.** Expo Go only ever supports its own
SDK, and the cafe's test device runs Expo Go 54. Upgrading the SDK means the app can no
longer be opened in Expo Go until a matching version ships — so don't bump `expo` unless
that is the explicit request, and if you do, use `npx expo install --fix` so every
package moves together. `AGENTS.md` points at the matching versioned docs.

## What this app is

A POS for a gaming cafe, but the real product is **cash accountability**: the owner must
be able to open it at closing and see expected cash, counted cash and the difference
without adding anything up. When a change trades away speed of entry, say so; when it
trades away financial correctness, don't make it.

The full brief is `docs/Happy-Hour.md`; the design decisions and their reasons are in
`docs/ARCHITECTURE.md`; the live backend is described in `docs/SUPABASE.md`.

## Architecture

```
app/        screens (expo-router). No arithmetic on money, no business rules.
src/domain/ pure functions: money, time, pricing, ledger, reporting, permissions
src/data/   the Backend interface + Supabase and local implementations
src/store/  zustand store and derived selectors
src/ui/     design system
```

### The `Backend` seam

`src/data/backend.ts` defines one interface where **every method is one complete business
action**. No screen ever composes two writes to make one, so there is no state in which a
sale exists without its payment.

Two implementations:

- `SupabaseBackend` — what runs. Each write is one RPC or one RLS-guarded statement.
- `LocalBackend` — device-local, and what the tests exercise. It is the reference
  implementation of the same rules and the intended basis for an offline write queue.

`getBackend()` in `src/data/index.ts` picks between them: Supabase when
`EXPO_PUBLIC_SUPABASE_URL` is set in `.env`, otherwise local. **Adding a capability means
adding it to the interface and both implementations**, plus a migration if it needs a new
RPC.

Both return a whole `Database` snapshot from every write; the store swaps it in. This is
deliberate — screens stay ignorant of the backend — but it is why `SupabaseBackend`
refetches after a write, and why `HISTORY_DAYS` scopes the read window.

### Auth is separate on purpose

`src/data/auth.ts`, not the `Backend` interface, because the two backends answer a
different question: a staff PIN locally, a real Supabase account in production, where
`auth.uid()` stamps every row and every RLS policy is judged against it. `authMode()`
decides which half of `app/sign-in.tsx` renders.

### Where the rules actually live

`src/domain/permissions.ts` is one matrix used to hide UI. **The same matrix is RLS
policies in the database** — that is what enforces it. If you change one, change the
other, or the app and the database will disagree.

Likewise the pricing arithmetic exists twice: `priceMinutes()` in
`src/domain/pricing.ts` and inside the `stop_session` SQL function. They must stay
identical.

## Invariants that must not be broken

These are the reasons the app exists. Tests cover each one.

- **Money is integer paise.** Never a float. `formatMoney` is the only thing that renders it.
- **Every figure is derived** from transactions on read (`src/domain/reporting.ts`).
  There is no stored total anywhere that could drift.
- **Dues are a ledger**: `balance = Σ DEBIT − Σ CREDIT`. Never mutate a balance field —
  none exists. Voiding a due sale appends a reversing CREDIT; the original DEBIT stays.
- **A settlement is not revenue.** It was counted as revenue the day the due was created.
  Cash and UPI totals include settlements; `revenue` must not.
- **Prices are snapshotted** onto `sale_items` and `gaming_sessions` at the moment of
  sale. Never recompute a historical line from `products.price` or a current rule.
- **Nothing financial is deleted.** Void instead, recording who, when and why. The
  database has no DELETE policy on the financial tables at all.
- **Every commit carries a `clientOpId`.** `sales.client_op_id` and
  `payments.client_op_id` are uniquely indexed so a double tap replays the first answer.
- **The trading day starts at 06:00 IST**, not midnight — a 1am sale belongs to the night
  before, or the drawer can never balance. `businessDayOf()` and the SQL
  `business_day_of()` both encode this.

## Database changes

The schema lives in the live Supabase project, applied as eight migrations; `supabase/migrations/`
holds only a README, because the earlier hand-written SQL file drifted from what was
applied and a stale file that looks authoritative is worse than none. Run
`npx supabase db pull` (needs the dashboard database password) before editing schema, so
the folder is the source of truth again.

Free tier, so keep it compact: money columns are `integer` paise, counts and minutes are
`smallint`, and new indexes need to earn their storage. `prune_audit_logs(months)` exists
because `audit_logs` grows fastest and ages worst.

After any DDL, run the Supabase advisors. Two real holes were found that way: functions
with a mutable `search_path`, and `SECURITY DEFINER` RPCs left executable by `anon`
(where `if not is_manager()` evaluates to null, not true, and falls through).
