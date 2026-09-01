# Architecture

Notes on how Happy Hour is put together, what was decided and why, and what was
deliberately left for later. The original brief is in [Happy-Hour.md](Happy-Hour.md).

---

## 1. The problem being solved

Sales are written in a register. Some are cash, some UPI, some on credit. At closing the
totals don't match the drawer, and there is no way to find out where the gap came from.

So the app is not really a POS. It is a **cash-accountability system with a fast POS on
the front**. Every design decision below follows from that: entry has to be fast enough
that staff actually use it, and the record it leaves has to be strong enough to answer
"where did ₹50 go?" a week later.

---

## 2. Layers

```
app/          screens — no business rules, no arithmetic on money
src/store/    state and derived views
src/data/     Backend interface + LocalBackend (atomic operations)
src/domain/   pure functions: pricing, ledger, reporting, permissions, money, time
```

`src/domain` has no React and no I/O, which is why it is the part under test.
`src/data/backend.ts` is the seam: one interface, one method per business action, sized
to match the Postgres functions it will be swapped for.

### Why a local backend first

The cafe's internet is unreliable and the brief says never to show "saved" when nothing
was saved. A local-first store gives that for free — writes are confirmed because they
have already happened — and it let the whole product be built and tested before any
account or credentials existed. The Supabase implementation replaces one line in
`src/data/index.ts`.

---

## 3. Data model

Table names in `src/domain/types.ts` match `supabase/migrations/0001_init.sql` one to one.

| Table | Holds |
| --- | --- |
| `profiles` | staff, role, PIN (Supabase Auth replaces the PIN) |
| `categories`, `products` | catalogue, current price, current stock |
| `game_types`, `game_resources` | PS5 #1, Pool #2 …, and their state |
| `pricing_rules` | per-minute rate, minimum charge, rounding |
| `customers` | name, optional phone, optional note |
| `sales` | **an open bill and a completed sale are the same row** |
| `sale_items` | product lines and gaming lines, with price snapshots |
| `payments` | money that arrived: sale payments and due settlements |
| `due_transactions` | the customer ledger, append-only |
| `inventory_transactions` | every stock movement with the balance after it |
| `gaming_sessions` | timer, rate snapshot, who started and stopped it |
| `cash_expenses` | cash out, never a sale |
| `daily_closings` | opening float, frozen totals, counted cash, difference |
| `audit_logs` | who did what, before and after |

### Three decisions worth calling out

**A bill *is* a sale.** `sales.status` is `OPEN → COMPLETED | VOIDED`. The brief asked
for open bills and for sales as separate ideas; making them one row means a group can
run up game time and snacks together, and the thing that gets paid for is the thing that
was built — no copying between tables at checkout.

**A gaming session is priced onto the bill, not paid separately.** Stopping a session
writes a `GAMING` sale item with the billed minutes and the snapshotted rate. The
session moves `ACTIVE → STOPPED`, and only becomes `BILLED` when the bill is paid — so
gaming revenue appears in reports when the money is real, not when the timer stopped.

**`DUE` is not a payment method.** `payments` only ever holds CASH or UPI. A due sale
writes no payment at all; it writes a `DEBIT` to the ledger. That single choice is what
keeps "revenue" and "money in the drawer" from being confused with each other.

---

## 4. Money

Integer paise. `formatMoney` is the only thing that renders it, with Indian digit
grouping. No rounding happens anywhere except in the pricing engine, once, on purpose.

---

## 5. Pricing engine

`priceMinutes(elapsed, snapshot)` — round elapsed up to the billing increment, apply the
minimum billable minutes, multiply by the rate, then floor at the minimum charge.

The snapshot (`rate_per_minute`, `minimum_charge`, `min_billable_minutes`,
`billing_increment_minutes`) is copied onto the session at start. Changing a rule mid
session, or a week later, cannot alter what was charged.

Peak-hour pricing, packages, memberships and per-player rates are all future variants of
the same function signature. Nothing outside `src/domain/pricing.ts` needs to change.

---

## 6. Due ledger

```
balance = Σ DEBIT − Σ CREDIT
```

| Event | Row |
| --- | --- |
| Sale closed as DUE | `DEBIT · SALE_DUE` |
| Customer pays | `CREDIT · SETTLEMENT` + a `payments` row |
| Due sale voided | `CREDIT · SALE_VOID_REVERSAL` |

Nothing is ever updated or deleted. The customer statement shows a running balance, so
what the customer is told matches what the rows say. Overpayment leaves a credit balance
rather than a negative due, and is excluded from total receivables.

---

## 7. Cash reconciliation

```
expected = opening float + cash sales + cash due settlements − cash expenses
difference = counted − expected
```

Frozen into `daily_closings` at close, along with who counted it. A mismatch is shown in
red and closing is still allowed — hiding a ₹50 gap is what the register already did.

Closing is refused while a bill is open or a game is running, since neither has a final
amount yet.

**The trading day starts at 06:00**, not midnight. A session started at 11:40pm and a
sale rung up at 1:15am belong to the same shift, and to the same drawer count.

---

## 8. Roles

`src/domain/permissions.ts` is one matrix, used to hide UI. The same matrix is expressed
as RLS policies — the database is what enforces it.

| | Staff | Manager | Owner |
| --- | --- | --- | --- |
| Sell, take payment, start/stop games | ✓ | ✓ | ✓ |
| Create and settle dues | ✓ | ✓ | ✓ |
| Record a cash expense | ✓ | ✓ | ✓ |
| Void a sale, add stock, close the day | | ✓ | ✓ |
| Full reports, transaction search | | ✓ | ✓ |
| Change prices, manage staff, audit log | | | ✓ |

Staff can see their own collections but not everyone's, which is what the RLS policy on
`payments` enforces.

---

## 9. Concurrency

- **Operations are serialised.** `LocalBackend.tx` runs one operation at a time against a
  deep clone, committing only on success. In Postgres the same operations are single
  functions with `SELECT … FOR UPDATE` on the contended row.
- **Last item.** Stock comes off at checkout, not when an item is tapped. Adding to a
  bill also checks what other open bills have reserved, so two staff cannot both promise
  the last packet — and if it happens anyway, the second checkout fails cleanly and
  writes nothing.
- **Same console.** `startSession` locks the resource row and refuses anything not
  `AVAILABLE`. Postgres adds a partial unique index: at most one `ACTIVE` session per
  resource, enforced by the database rather than by timing.
- **Double taps.** Every commit carries a `clientOpId`. `sales.client_op_id` and
  `payments.client_op_id` are uniquely indexed; a repeat returns the original row. The UI
  also blocks a second tap while a write is in flight.

---

## 10. Edge cases from the brief

| # | Case | Behaviour |
| --- | --- | --- |
| 1 | Existing due, another due purchase | Confirmation shows previous, this bill, new balance |
| 2–3 | Partial / over payment | Partial allowed; overpayment warned and held as credit |
| 4–6 | Void of a due / cash / UPI sale | Stock returned, payment voided, due reversed by credit |
| 7–8 | Last item, two staff | Reservation check on add; hard check at checkout, rolls back |
| 9 | Two staff, same PS5 | Refused — `RESOURCE_BUSY` |
| 10 | Session crosses midnight | Business day starts at 06:00, so it stays in one shift |
| 11–12 | Forgotten session, app killed | Elapsed time is recomputed from `started_at`; nothing is held in memory |
| 13 | Connection drops at checkout | Writes are local; nothing is lost and nothing shows as saved unless it is |
| 14 | Checkout tapped twice | Idempotency key returns the first sale |
| 15 | Price changed after an old sale | Old lines keep their snapshot |
| 16 | Editing a closed day | Refused — `DAY_CLOSED`, reopen needs owner rights and is audited |
| 17–18 | Cash expense, wrong opening float | Both editable while the day is open, both audited |
| 19 | UPI not actually received | Sale is only recorded after a person confirms the credit |
| 20 | Many due transactions | Statement with running balance |
| 21 | Staff changes mid-session | `started_by` and `ended_by` are recorded separately |
| 22 | Rate changes mid-session | Session keeps its snapshot |

---

## 11. Changes made to the original brief

Each of these was a deliberate departure, and each is visible in the code:

1. **Open bills merged into sales.** One row, three states, instead of two parallel
   concepts to keep in step.
2. **The trading day starts at 06:00.** A calendar-day boundary makes late-night cash
   impossible to reconcile.
3. **The day opens itself.** The brief has staff record opening cash before trading. In
   practice that blocks the first sale of the morning. The day is created on first touch,
   carrying the float forward from the last close; opening cash stays editable (and
   audited) until the day is closed.
4. **New Sale is a button, not a tab.** It opens a bill; a tab implies a place.
5. **Bills are created lazily.** Backing out of the sale screen leaves nothing behind.
6. **PIN sign-in on a shared device.** Faster than email and password at shift change,
   and it still stamps every row with a real identity. Supabase Auth replaces it.
7. **Cash is the only one-tap payment.** UPI needs a human confirmation, DUE needs a
   customer. Both are deliberate friction where money can actually go missing.
8. **Staff may record cash expenses.** They are the ones sent out for milk. Managers can
   void them.

---

## 12. MVP vs later

**Built:** auth and roles, catalogue, inventory with movement history, product sales,
gaming sessions with live timers and snapshot pricing, open bills, customers, the due
ledger with partial settlement, cash expenses, opening float, reconciliation and daily
closing, reports (daily, gaming, product, staff), transaction search and void, audit log,
settings.

**Deliberately not built yet:**

- **Supabase sync.** The schema, policies and RPCs are written and waiting.
- **Receipts.** The data model carries everything a receipt needs; rendering and printing
  are additive.
- **A real UPI integration.** The payment layer is shaped so a provider callback replaces
  the manual confirmation without touching the sale logic.
- **An offline write queue.** Not needed while the device is the source of truth; it
  becomes the first thing to build the day Supabase is connected.
- **Peak-hour and package pricing.** One function, already isolated.
