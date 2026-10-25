# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npx expo start            # dev server; a / i / w for Android, iOS, web
npm test                  # 71 tests over the financial logic
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

To exercise the screens against the on-device backend — PIN sign-in, seeded catalogue,
nothing written to the venue's real database and no accounts created — add a
`.env.local` that blanks both `EXPO_PUBLIC_SUPABASE_*` values, restart Metro, and delete
it afterwards. This is how the UI was verified; there are no component tests.

Regenerate the app icons after replacing `assets/app-logo.jpg`:

```bash
node scripts/build-icons.js
```

**Running on the phone.** The cafe's test setup is a laptop tethered to the phone's own
hotspot. Android routes app traffic over cellular rather than to its own hotspot clients,
so Expo Go reports `java.io.IOException` even though Metro is reachable on the LAN. Use
`npx expo start --tunnel` in that setup (Expo offers to install `@expo/ngrok` on first
use), or put both devices on an ordinary router.

**The Expo SDK tracks whatever Expo Go on the test phone runs — currently 57.** Expo Go
only ever supports its own SDK, and the Play Store updates it without asking, so the
project has already been moved 57 → 54 → 57 to keep up. When it drifts again, the fix is
two commands: `npm install expo@^<n>.0.0`, then `npx expo install --fix` so every package
moves together, then typecheck, tests and an Android `expo export`. Update `AGENTS.md` to
the matching versioned docs. The durable way out of this churn is a development build
(`npx expo run:android` or EAS), which pins the native side and stops Expo Go updates
from breaking testing — worth doing before the app goes on the counter for real.

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
deliberate — screens stay ignorant of the backend — but it shapes `SupabaseBackend`:

- **Every write names the tables it can have touched** and `refresh(tables)` refetches
  only those, patching the in-memory mirror. Refetching all seventeen after each tap was
  the main cause of sluggishness. A new write method must pass its table list (or
  `SALE_TABLES` for anything that moves money, stock and dues together).
- `HISTORY_DAYS` scopes the read window on launch; `due_transactions` is the one table
  always fetched whole, because a balance is the sum of a customer's entire history.
- `hydrate()` paints the last cached snapshot before the network answers, then `load()`
  replaces it. The store does this on boot.

### Theming is a live object, not a context

`colors` in `src/theme/colors.ts` is a mutable object that `applyTheme()` rewrites in
place when the person changes mode or accent. Two rules make that work:

- **Never snapshot a colour at module scope.** Stylesheets that mention `colors` use
  `themed(() => ({...}))` instead of `StyleSheet.create`; it rebuilds the sheet after a
  theme change. Lookup tables (button tones, payment keys) are functions called at
  render. A plain `const X = { bg: colors.bg }` at the top of a file stays dark forever.
- **`useDb()` subscribes to the theme version**, so every screen re-renders on a change
  without touching it. The two screens without `useDb` — sign-in and the tab bar — call
  `useTheme()` themselves.

Appearance is per phone (AsyncStorage), never in the database. The payment keys are
deliberately excluded from the accent: cash is always lime, UPI always orange, due
always chalk-on-ink, so no accent choice can make two payment methods look alike.

Light mode has its own contrast rules. Bright accents (lime, orange) fail as text on
white, so **the accent is never written as text or an icon directly**: use
`colors.accentText` (and `cashText` / `upiText` for amounts), which are the same hue
on dark and a deeper shade on light. `colors.accent` is for fills only. Cards carry a
1px `colors.border` and `elevation('card' | 'float')` from `src/theme/colors.ts` — a
function, not a constant, because the shadow is heavier on dark than on light.

### Every history screen filters by business day the same way

`src/domain/reporting.ts` takes a `DayRange | null` (`null` = everything loaded), and
`inRange()` is the one comparison. `useDateRange()` + `<DateRangeFilter>` in
`src/components/DateRangeFilter.tsx` give Reports, Transactions and Audit the same
Today / Yesterday / All / Custom control; a new list screen should reuse it rather than
grow its own day picker. The cash drawer (`cashPosition`) stays single-day on purpose —
an opening float only means something for one day.

### One bill per table, counter sales apart

A bill is either a table's or the counter's. Table bills are created from the Games tab
(`start_session` opens one); counter sales from the Sale button (`/bill/new`). The bill
screen names itself accordingly and only offers "add another table" on a table bill.
This is a UI convention, not a schema constraint — products *can* go on a table bill,
which is the point (snacks for the people playing) — but keep the two starting points
distinct or the counter gets confused about whose tab a packet went on.

### Auth is separate on purpose

`src/data/auth.ts`, not the `Backend` interface, because the two backends answer a
different question: a staff PIN locally, a real Supabase account in production, where
`auth.uid()` stamps every row and every RLS policy is judged against it. `authMode()`
decides which half of `app/sign-in.tsx` renders.

### Where the rules actually live

`src/domain/permissions.ts` is one matrix used to hide UI. **The same matrix is RLS
policies in the database** — that is what enforces it. If you change one, change the
other, or the app and the database will disagree.

`product.remove` is owner-only in the matrix. In the database it is a BEFORE UPDATE
trigger on `products.archived` rather than a policy, because the update policy has to
let managers through for every other column and a WITH CHECK cannot see the old row.

Likewise the pricing arithmetic exists twice: `priceMinutes()` in
`src/domain/pricing.ts` and inside the `stop_session` SQL function. They must stay
identical.

Day and night are separate `pricing_rules` rows, chosen by the staff member at start and
snapshotted onto the session. The switch is deliberately **not** driven by the clock —
the venue decides when the night rate begins, and that boundary moves. `useTariff()`
remembers the last choice per device so a night shift flips it once.

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
- **Game time is negotiable, and the negotiation is recorded.** The meter pre-fills the
  charge but staff can change it. `gaming_sessions.metered_amount` keeps what the clock
  said next to `amount`, and `amount_source` marks the override, so a discount is
  visible rather than invisible. Never drop the metered figure.
- **Nothing financial is deleted.** Void instead, recording who, when and why. The
  database has no DELETE policy on the financial tables at all.
- **Every commit carries a `clientOpId`.** `sales.client_op_id` and
  `payments.client_op_id` are uniquely indexed so a double tap replays the first answer.
- **The trading day starts at 06:00 IST**, not midnight — a 1am sale belongs to the night
  before, or the drawer can never balance. `businessDayOf()` and the SQL
  `business_day_of()` both encode this.

## Things that already cost an afternoon

- **`Sheet` returns `null` when closed** rather than passing `visible={false}` to
  `Modal`. On react-native-web a hidden Modal stays mounted and visible, so a committed
  action looked like it had not happened. Keep that early return.
- **`TabList` must be a direct child of `Tabs`** (`expo-router/ui`). Its trigger parser
  only descends through fragments and `TabList`, so wrapping the bar in a `View` yields
  "Couldn't find any screens for the navigator". The bar styling lives on `TabList`.
- **The `.lottie` in `assets/` is a dotLottie zip**, which `lottie-react-native` cannot
  read. `assets/ps5-loader.json` is the animation extracted from it; that is what the
  `Loader` plays. Web needs `@lottiefiles/dotlottie-react` alongside; native does not.
- **Large heredocs fail in this environment's Git Bash.** For anything beyond a few
  lines of TypeScript, write the file with the Write tool, or write a patch script to
  the scratchpad and run it with `node` — piping source through `bash -c` mangles
  quotes and backticks unpredictably.
- **`app.json` `extra` is not the config path.** `Constants.expoConfig.extra` was empty
  in the web bundle, so config is `.env` only (`EXPO_PUBLIC_*`, inlined by Metro).

## Database changes

The schema lives in the live Supabase project, applied as ten migrations; `supabase/migrations/`
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
