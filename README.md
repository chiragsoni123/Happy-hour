# Happy Hour

A point-of-sale and cash-accountability app for a gaming cafe: PS5 and pool sessions on
live timers, food and cigarette sales, customer tabs, cash expenses, and an end-of-day
reconciliation that says exactly what should be in the drawer.

React Native + Expo + TypeScript. Android and iOS from one codebase.

## Run it

```bash
npm install
```

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `a` / `i` for an emulator.

Built on **Expo SDK 54**, which is what current Expo Go supports. Expo Go only ever runs
its own SDK, so the two have to stay in step — see CLAUDE.md before upgrading.

On first launch, create the owner account. The first account to sign up becomes the
OWNER — the database decides that, not the app, so it cannot be claimed by whoever signs
up second. Everyone after starts as staff, and the owner sets their role in
**More → Staff**.

```bash
npm test
```

58 tests over the financial logic: pricing, the due ledger, inventory, voids,
reconciliation, permissions, duplicate submissions and concurrency.

```bash
npm run typecheck
```

## The four flows it is built around

Each is meant to take seconds, not screens.

| Flow | Taps |
| --- | --- |
| **Product sale** | Sale → tap items → CASH |
| **Gaming** | Games → tap a free console → Start … Stop → UPI |
| **Due** | Sale → tap items → DUE → pick customer → confirm |
| **Settlement** | Dues → customer → Settle → amount → CASH |

At any point the owner opens **More → Cash drawer** and sees expected cash, counted cash
and the difference, without adding anything up.

## How the money is kept honest

- **Integer paise everywhere.** No floating-point money.
- **Every figure is derived.** Revenue, cash position and outstanding dues are computed
  from transactions on read. There is no stored total that can drift.
- **Dues are a ledger, not a balance.** `balance = Σ debits − Σ credits`. Voiding a due
  sale appends a reversing credit; the original is never edited.
- **A settlement is not revenue.** It was counted the day the due was created. Cash and
  UPI totals include it; revenue does not.
- **Prices are snapshotted.** Sale lines and gaming sessions store the rate that was
  charged, so changing a price today cannot rewrite yesterday.
- **Nothing is deleted.** A wrong sale is voided, which returns stock, cancels the
  payment and reverses the due — with who, when and why against it.
- **Operations are atomic.** Checkout either creates the sale, the payment, the stock
  movements and the ledger entry, or it changes nothing at all.
- **Double taps are safe.** Every commit carries an idempotency key; a retry replays the
  first answer instead of creating a second sale.

## Where things live

```
app/                     screens (expo-router)
  (tabs)/                home, games, dues, more
  bill/[id].tsx          the open bill — where a sale is built and paid
  customer/[id].tsx      statement and settlement
  more/                  cash drawer, reports, inventory, products, staff, audit
src/
  domain/                pure logic: money, time, pricing, ledger, reporting, permissions
  data/                  the Backend interface, its Supabase and local implementations
  store/                 app state and selectors
  ui/                    design system
  components/            composed pieces shared across screens
supabase/migrations/     notes on the applied schema (see docs/SUPABASE.md)
docs/                    architecture notes, Supabase checklist, original brief
```

## Data

Postgres, on Supabase, in Mumbai. Every phone on the counter sees the same tables, and
the role rules are enforced by row level security rather than by the app — a modified
client cannot get around them. The financial tables have no DELETE policy at all.

Each write is one transaction: `complete_sale`, `settle_due`, `start_session`,
`stop_session`, `void_sale`, `close_day`. The concurrency guarantees moved into SQL along
with them — row locks for the last packet and the same console, a partial unique index
for one live session per table, and unique `client_op_id` indexes so a double-tapped
checkout replays the first answer instead of charging twice.

Config is in [.env](.env), publishable key only. See [docs/SUPABASE.md](docs/SUPABASE.md)
for the project details, the security posture, and what keeps it inside the free tier.

`LocalBackend` stays in the repo as the tested reference implementation of the same rules,
and as the basis for the offline write queue that is the next thing worth building.
