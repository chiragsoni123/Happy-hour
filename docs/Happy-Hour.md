# GameZone / Gaming Cafe Management App — Product Specification & Development Prompt

You are a senior product engineer, UX designer, and software architect.

I want you to help me build a production-ready mobile app for my gaming cafe / gamezone.

The app will be used by multiple staff members to manage:

- PlayStation 5 gaming sessions
- Pool/snooker table sessions
- Food and snack sales
- Cigarette sales
- Inventory
- Cash and UPI payments
- Customer dues
- Partial/full due settlements
- Cash expenses
- Daily cash reconciliation
- Staff accountability
- Reports and analytics

The biggest problem we currently have is that transactions are written manually in a register. Some customers pay cash, some pay through UPI, and some customers take items/game time on credit and pay later. At the end of the day, manually calculated totals frequently don't match the actual cash/register.

The primary goal of this app is:

> Make transaction entry extremely fast while creating a reliable digital source of truth for revenue, cash, UPI, dues, inventory, gaming sessions, and staff accountability.

---

# 1. Technology Stack

Use:

- React Native
- Expo if appropriate
- TypeScript
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Row Level Security (RLS)
- React Navigation or Expo Router
- A modern component/UI system suitable for React Native

The application must support:

- Android
- iOS

The codebase should be shared between both platforms as much as possible.

Use TypeScript strictly.

Do not use `any` unless absolutely unavoidable.

Prefer a clean, modular, scalable architecture.

---

# 2. Product Philosophy

The app should NOT be designed primarily around cash vs UPI vs dues.

Instead:

> Every sale is a transaction, and payment method is an attribute of that transaction.

A transaction should record:

- What was sold
- Quantity/duration
- Amount
- Payment method
- Customer if applicable
- Staff who created/collected it
- Date/time
- Related gaming session if applicable
- Status
- Audit information

Payment methods:

- CASH
- UPI
- DUE

The database must be designed so that daily financial totals can be calculated reliably from the underlying transaction records.

---

# 3. UX PRINCIPLE

The most important UX requirement is:

> A normal transaction should take no more than 2–3 meaningful steps.

Staff members are busy and may not be technically sophisticated.

Avoid unnecessary forms, confirmation screens, navigation, typing, and modal chains.

For example:

Product sale:

1. Tap New Sale
2. Tap product
3. Tap CASH / UPI / DUE

Done.

Gaming:

1. Start session
2. Stop session
3. Tap CASH / UPI / DUE

Done.

Do NOT create complicated POS workflows.

---

# 4. User Roles

Implement role-based access control.

Roles:

## OWNER

Full access.

Can:

- View all reports
- Create/edit/delete/void products
- Manage inventory
- Manage staff
- Manage pricing
- Manage gaming tables/consoles
- View all transactions
- Correct/void transactions
- Manage dues
- Reconcile cash
- View audit logs
- Configure the system

## MANAGER

Can:

- Create sales
- Manage gaming sessions
- Manage dues
- Manage inventory
- Add stock
- View reports
- View transactions
- Perform cash reconciliation

Should NOT be able to:

- Manage owner
- Delete important historical records
- Modify critical system settings without permission

## STAFF

Can:

- Start gaming sessions
- Stop gaming sessions
- Create sales
- Collect cash
- Record UPI payments
- Create customer dues
- Settle customer dues
- View necessary transaction information

Should NOT be able to:

- Delete transactions
- Change historical transactions
- Change product prices
- Manage staff
- Access sensitive owner reports
- Modify accounting records

Use Supabase RLS to enforce authorization at the database level, not only in the frontend.

---

# 5. Main Navigation

For staff:

Bottom navigation:

- Home
- Games
- New Sale
- Dues
- More

Make New Sale visually prominent.

For Owner/Manager, More can contain:

- Reports
- Inventory
- Products
- Staff
- Cash Reconciliation
- Expenses
- Settings
- Audit Log

Do not expose owner-only features to staff.

---

# 6. HOME SCREEN

The Home screen should answer:

> What is happening right now?

Example:

GOOD MORNING 👋

Today's Sales
₹8,450

ACTIVE GAMES

PS5 #1
Rahul
32 min
₹320

PS5 #2
18 min
₹180

Pool #1
45 min
₹450

QUICK ACTIONS

[ New Sale ]

[ Start Game ]

TODAY'S COLLECTION

Cash ₹3,200
UPI ₹4,750
New Dues ₹500

Keep this screen simple.

---

# 7. GAMING SESSION SYSTEM

Gaming sessions must use timers.

Do NOT require staff to manually calculate minutes.

Supported gaming types initially:

- PS5
- Pool/Snooker

Each gaming resource should have an identifier, for example:

- PS5 #1
- PS5 #2
- PS5 #3
- Pool #1
- Pool #2

Gaming session flow:

START SESSION

Select:

- Gaming resource
- Customer (optional)
- Pricing rule

Then:

[ START SESSION ]

The system records the exact start timestamp.

During the session, show:

- Resource
- Customer
- Duration
- Current calculated amount
- Start time

Example:

PS5 #1
Rahul
Started 7:32 PM
32 min
Current amount ₹320

When the customer finishes:

[ STOP SESSION ]

The system calculates:

- End time
- Duration
- Amount

Then open checkout.

---

# 8. GAMING PRICING

Do not hard-code prices into the frontend.

Pricing must come from the database.

Support pricing rules that can evolve later.

At minimum support:

- Per minute
- Minimum charge if needed
- Different rates for different gaming types/resources

Example:

PS5:
₹10/min

Pool:
₹8/min

The pricing engine should be isolated into its own service/function so that pricing logic can later support:

- Peak hours
- Discounts
- Packages
- Membership rates
- Per-player pricing
- Hourly pricing

Do not over-engineer these features now, but design so they can be added later.

---

# 9. OPEN BILL / CURRENT SESSION

The system should support an open bill for an ongoing customer/group.

Example:

RAHUL

PS5 ₹300
Coke ₹40
Chips ₹30

TOTAL ₹370

The customer may continue playing and buying products.

The staff should be able to add:

- Gaming time
- Food
- Drinks
- Snacks
- Other products

to the same open bill.

At checkout:

[ CASH ] [ UPI ] [ DUE ]

The system should create the appropriate financial transaction.

Do not force every individual item to become a separate payment.

---

# 10. PRODUCT SALES

Product categories may include:

- Cigarettes
- Snacks
- Chips
- Kurkure
- Maggie
- Popcorn
- Mouth Freshener
- Cold Drinks
- Other

The exact product list must be configurable.

Product sale flow:

1. Tap New Sale
2. Tap products / quantities
3. Select payment method

Example:

Coke × 1 ₹40
Chips × 1 ₹30
Maggie × 1 ₹50

TOTAL ₹120

[ CASH ]
[ UPI ]
[ DUE ]

Keep this extremely fast.

---

# 11. CUSTOMER SYSTEM

Customer information should be optional for normal sales.

DO NOT force staff to create a customer for a normal cash/UPI purchase.

Customer is required when:

Payment method = DUE

Customer fields initially:

- Name
- Phone number (optional)
- Notes (optional)

Do not collect unnecessary personal information.

---

# 12. DUE SYSTEM

Dues are extremely important.

When a sale is marked as DUE:

Show:

Select Customer

Search existing customer

or

[ + New Customer ]

Then save the due.

Example:

Rahul Sharma

Previous due: ₹350

New sale: ₹450

New balance: ₹800

The due must be linked to the original sale.

Do not simply modify a single balance number without maintaining a transaction history.

---

# 13. DUE HISTORY

Customer detail page:

Rahul Sharma

Outstanding:
₹800

Transaction history:

Aug 31
PS5 ₹300
Cigarette + Snacks ₹200
Pool ₹300

Outstanding ₹800

Button:

[ SETTLE PAYMENT ]

---

# 14. PARTIAL/FULL DUE SETTLEMENT

Settlement flow:

Outstanding: ₹800

Amount:
[ ₹500 ]

Payment:

[ CASH ] [ UPI ]

[ CONFIRM PAYMENT ]

After settlement:

Previous due: ₹800
Paid: ₹500
Remaining: ₹300

Allow:

- Partial settlement
- Full settlement

A settlement must be recorded as its own payment/ledger transaction.

Never delete or overwrite the original due transaction.

---

# 15. IMPORTANT ACCOUNTING PRINCIPLE

Do not implement dues as simply:

customer.balance += amount

Instead maintain a proper ledger.

Example:

Due created:
+₹500

Partial payment:
-₹200

Remaining:
₹300

Every change should be auditable.

The system should always be able to reconstruct the customer's outstanding balance from the ledger.

---

# 16. PAYMENT MODEL

Payment methods:

- CASH
- UPI
- DUE

For normal completed sales:

CASH:
Revenue + amount
Cash + amount

UPI:
Revenue + amount
UPI + amount

DUE:
Revenue + amount
Outstanding customer due + amount

For due settlement:

CASH:
Cash + settlement amount
Customer due - settlement amount

UPI:
UPI + settlement amount
Customer due - settlement amount

Do not count due settlements as new revenue.

This distinction is critical.

---

# 17. UPI

For V1, UPI can be manually confirmed.

Flow:

Payment:
₹500

[ CASH ]
[ UPI ]
[ DUE ]

If UPI selected:

Show amount.

Optionally show a QR code.

Staff confirms that payment was received.

Important:

Displaying a QR code does NOT mean payment succeeded.

The payment should only be marked successful after staff confirmation or a future payment-provider integration.

Design the payment layer so actual UPI integration can be added later.

---

# 18. INVENTORY

Inventory must automatically connect to sales.

If:

Coke stock = 30

Sale:
Coke × 2

Then:

Coke stock = 28

Do not make staff manually decrease inventory after every sale.

Inventory should update automatically when the sale is successfully completed.

---

# 19. INVENTORY TRANSACTIONS

Do not only store the current stock number.

Maintain an inventory movement history.

Examples:

PURCHASE:
+50

SALE:
-2

ADJUSTMENT:
-1

DAMAGED:
-2

This makes stock discrepancies traceable.

Current stock can be derived/maintained from these movements.

---

# 20. INVENTORY SCREEN

Example:

INVENTORY

Cigarette
42 units

Kurkure
17 units
⚠ Low Stock

Maggie
23 units

Popcorn
8 units
⚠ Low Stock

Each product should show:

- Current stock
- Selling price
- Low stock threshold

Owner/Manager can:

[ ADD STOCK ]

Example:

Product:
Kurkure

Current:
17

Add:
50

[ ADD STOCK ]

---

# 21. CASH MANAGEMENT

This is one of the most important modules.

At the beginning of the day, record:

OPENING CASH

Example:

₹2,000

During the day:

Cash sales:
+₹11,200

Cash due settlements:
+₹1,000

Cash expenses:
-₹500

Expected closing cash:

₹13,700

The system must calculate this automatically.

---

# 22. CASH EXPENSES

Add a cash expense feature.

Example:

Milk purchased:
₹200

The system records:

Cash out:
₹200

Reason:
Milk / Supplies

Staff:
Amit

Timestamp:
automatic

Do NOT make expenses appear as sales.

They are cash movements.

---

# 23. END-OF-DAY RECONCILIATION

This is the key feature solving the original problem.

At closing:

OPENING CASH
₹2,000

CASH SALES
₹11,200

CASH DUE SETTLEMENTS
₹1,000

CASH EXPENSES
₹500

EXPECTED CASH
₹13,700

Staff enters:

ACTUAL CASH
₹13,650

Difference:
-₹50

Show:

⚠ ₹50 mismatch

Then provide:

[ REVIEW CASH TRANSACTIONS ]

[ REVIEW EXPENSES ]

[ CLOSE DAY ]

Never silently hide discrepancies.

---

# 24. DAILY CLOSING

Once a day is closed:

Store:

- Opening cash
- Cash sales
- Cash settlements
- Cash expenses
- Expected cash
- Actual cash
- Difference
- Closed by
- Closed at

Historical days should remain available.

Do not allow normal staff to modify closed-day transactions.

If corrections are necessary, require appropriate permissions and create an audit record.

---

# 25. TRANSACTION STATUS

Transactions should have states such as:

- COMPLETED
- VOIDED
- REFUNDED if refunds are later implemented

Do not physically delete financial transactions.

If a transaction is wrong:

Mark it VOIDED.

Store:

- Who voided it
- When
- Reason

Example:

Transaction #10231

₹200 Cash

Status:
VOIDED

Voided by:
Manager

Reason:
Wrong amount

---

# 26. AUDIT LOG

Every important action must be auditable.

Automatically record:

- User
- Timestamp
- Action
- Entity type
- Entity ID
- Previous value if applicable
- New value if applicable

Examples:

SALE_CREATED
SALE_VOIDED
PAYMENT_CREATED
DUE_CREATED
DUE_SETTLED
INVENTORY_ADDED
INVENTORY_ADJUSTED
PRICE_CHANGED
PRODUCT_CREATED
PRODUCT_UPDATED
CASH_EXPENSE_CREATED
DAY_OPENED
DAY_CLOSED
STAFF_CREATED
STAFF_ROLE_CHANGED

Staff should never manually enter their username.

The authenticated user should automatically be associated with the action.

---

# 27. STAFF ACCOUNTABILITY

Every transaction must have:

created_by
created_at

Payments should have:

collected_by
collected_at

Important modifications should have:

updated_by
updated_at

Voids should have:

voided_by
voided_at
void_reason

This allows the owner to answer:

Who collected this money?
When?
What was sold?
Was it cash or UPI?
Was it later modified?
Who modified it?

---

# 28. REPORTS

Initial reports:

## Daily Summary

Revenue
₹25,400

Gaming
₹17,200

Products
₹8,200

Cash sales
₹11,200

UPI sales
₹13,500

New dues
₹700

Due settlements
₹1,200

Outstanding dues
₹8,450

## Gaming Report

PS5 sessions
28

PS5 revenue
₹9,420

Pool sessions
18

Pool revenue
₹7,780

## Product Report

Top-selling products.

## Staff Report

For each staff member:

- Number of transactions
- Cash collected
- UPI collected
- Dues created
- Due settlements
- Voids

## Inventory Report

- Current stock
- Low stock
- Stock movement

---

# 29. TRANSACTION SEARCH

Owner/Manager should be able to search transactions.

Filters:

- Date
- Staff
- Payment method
- Category
- Customer
- Product
- Gaming type
- Status

Example:

Search Rahul:

Today:

PS5 ₹450 UPI
Snacks ₹200 Cash
Pool ₹500 Due

---

# 30. DATABASE DESIGN

Use PostgreSQL/Supabase.

Suggested entities:

users/profiles
roles
customers
products
categories
game_types
gaming_resources
pricing_rules
gaming_sessions
sales
sale_items
payments
due_accounts or customer ledger
due_transactions
inventory_transactions
cash_transactions
daily_closings
audit_logs

Important:

Do not create a poorly normalized schema just to make frontend development easier.

Financial data must remain traceable.

Use foreign keys.

Use timestamps.

Use database constraints where appropriate.

Use database transactions/RPCs for operations that must happen atomically.

For example, completing a sale may need to:

1. Create sale
2. Create sale items
3. Create payment
4. Update inventory
5. Update customer due if applicable
6. Create audit records

These operations should not partially succeed.

---

# 31. ATOMIC CHECKOUT

Design checkout as an atomic backend operation where practical.

Example:

complete_sale(...)

The operation should ensure that:

- Sale is created
- Payment is recorded
- Inventory is updated
- Due ledger is updated when necessary

If one critical operation fails, the entire operation should roll back.

Do not rely entirely on frontend state.

---

# 32. CONCURRENCY

Multiple staff members may use the app at the same time.

Design for:

- Multiple simultaneous sales
- Multiple gaming sessions
- Multiple inventory updates
- Multiple staff members accessing the same customer
- Multiple staff settling dues

Avoid race conditions.

For inventory, make sure two staff members selling the last available item cannot incorrectly produce negative/inconsistent stock.

For gaming resources, prevent two staff members from starting the same PS5/table simultaneously.

Use database constraints/transactions where appropriate.

---

# 33. GAMING RESOURCE STATES

Gaming resources should have states such as:

AVAILABLE
IN_USE
MAINTENANCE
DISABLED

Example:

PS5 #1 — AVAILABLE
PS5 #2 — IN USE
PS5 #3 — MAINTENANCE

The UI should make this immediately visible.

---

# 34. OPEN BILLS

Support open bills for active customers/groups.

An open bill can contain:

- Gaming sessions
- Products
- Other billable items

Example:

Bill #1021

Rahul

PS5
₹300

Coke
₹40

Chips
₹30

Total
₹370

The bill remains open until checkout.

---

# 35. OFFLINE / POOR INTERNET CONSIDERATION

This is a physical cafe.

Internet may occasionally be unreliable.

Do not assume perfect connectivity.

At minimum, architect the application so network failures do not silently lose transactions.

If implementing offline support in V1 is too complex, clearly separate it as a future feature.

But:

- Never show "successful" when the server has not confirmed the transaction.
- Clearly show sync/network status.
- Avoid duplicate submissions when a user taps a button twice.

If implementing offline mode, use a proper local queue and idempotency strategy rather than simply caching screens.

---

# 36. UI DESIGN

The design should feel like a modern, fast POS application rather than a generic admin dashboard.

Prioritize:

- Large touch targets
- Large buttons
- Minimal typing
- Fast product selection
- Clear totals
- High readability
- Clear payment buttons
- Minimal navigation
- Immediate feedback

Use a dark gaming-inspired aesthetic if appropriate, but do not sacrifice readability.

Avoid excessive animations.

The app will be used for long periods by staff.

---

# 37. ERROR PREVENTION

The UI should prevent common mistakes.

Examples:

If staff chooses DUE:

Require customer.

If customer has existing due:

Clearly show:

Existing due: ₹800

New due: ₹300

New total: ₹1,100

If staff attempts to stop an already stopped session:

Prevent duplicate action.

If product is out of stock:

Do not silently allow sale.

If UPI payment hasn't been confirmed:

Do not mark it as completed.

If a transaction is being submitted twice:

Prevent duplicate transactions.

---

# 38. RECEIPTS

Design the data model so receipts can be added.

Receipt should eventually contain:

GameZone name
Date/time
Items
Gaming duration
Subtotal
Discount if applicable
Total
Payment method

For due:

Amount added to outstanding balance.

Receipt generation/printing can be implemented after the core system works.

---

# 39. SECURITY

Use Supabase Auth.

Use RLS extensively.

Never trust the frontend for authorization.

Examples:

Staff cannot directly update another user's transactions.

Staff cannot modify product prices.

Staff cannot close/reopen days unless permitted.

Staff cannot access owner-only reports.

Users should only be able to perform operations allowed by their role.

Do not expose Supabase service-role credentials in the mobile app.

---

# 40. DEVELOPMENT APPROACH

Do NOT immediately generate the entire application.

First:

## PHASE 0 — Planning

Before writing substantial code:

1. Analyze the requirements.
2. Identify ambiguities.
3. Propose the final architecture.
4. Propose database schema.
5. Propose navigation.
6. Propose screen wireframes.
7. Propose transaction state machine.
8. Identify accounting edge cases.
9. Identify security/RLS rules.
10. Identify potential race conditions.
11. Identify what belongs in MVP vs later.

Then wait for my approval.

Do not make large assumptions silently.

---

# 41. AFTER APPROVAL

Build incrementally.

Recommended implementation order:

### Phase 1

- Project setup
- Authentication
- User roles
- Supabase configuration
- Database schema
- RLS

### Phase 2

- Products
- Categories
- Inventory
- Basic product sales
- Cash/UPI/Due checkout

### Phase 3

- Customers
- Due ledger
- Partial/full settlement

### Phase 4

- Gaming resources
- Gaming sessions
- Timer
- Pricing engine
- Open bills

### Phase 5

- Cash expenses
- Opening cash
- Daily reconciliation
- Daily closing

### Phase 6

- Reports
- Transaction search
- Staff reports
- Inventory reports

### Phase 7

- Audit logs
- Error handling
- Performance
- Offline/network improvements
- Testing
- Production readiness

---

# 42. TESTING

Write tests for critical financial logic.

Especially:

- Sale creation
- Cash payment
- UPI payment
- Due creation
- Partial due settlement
- Full due settlement
- Inventory deduction
- Inventory restoration if a sale is voided
- Gaming duration calculation
- Gaming pricing
- Cash reconciliation
- Daily closing
- Role permissions
- Concurrent sales
- Duplicate submission prevention

Financial calculations should have automated tests.

---

# 43. EDGE CASES TO HANDLE

Think through these before implementation:

1. Customer has an existing due and makes another due purchase.
2. Customer partially settles a due.
3. Customer pays more than the outstanding due.
4. A due transaction is voided.
5. A cash sale is voided.
6. A UPI sale is voided.
7. A product sale reduces stock to zero.
8. Two staff sell the last product simultaneously.
9. Two staff try to start the same PS5.
10. Gaming session crosses midnight.
11. Staff forgets to stop a session.
12. App closes while a gaming session is active.
13. Internet disconnects during checkout.
14. Staff taps checkout twice.
15. Product price changes after an old sale.
16. A day is closed and someone attempts to modify an old transaction.
17. Cash expense is entered.
18. Opening cash is wrong.
19. UPI payment was not actually received.
20. Customer has multiple due transactions.
21. Staff changes during an active gaming session.
22. Gaming price changes while a session is active.

Prices for completed sales/sessions must be snapshotted so historical transactions do not change when the current product price changes.

---

# 44. IMPORTANT FINANCIAL RULE

Historical transactions must remain historically accurate.

If:

PS5 price today = ₹10/min

and tomorrow price changes to:

₹12/min

Yesterday's transaction must still show the original rate.

Store the applied price/rate on the sale/session item.

Never calculate old sales using the current product price.

---

# 45. MVP SUCCESS CRITERIA

The MVP is successful if a staff member can do this in seconds:

### Product

New Sale
→ Kurkure
→ Cash

### Gaming

Start PS5
→ Play
→ Stop
→ UPI

### Due

New Sale
→ Items
→ Due
→ Select Customer

### Settlement

Dues
→ Customer
→ Settle
→ UPI

And the owner can open the app at the end of the day and immediately see:

Expected cash
Actual cash
Difference

without manually calculating anything.

---

# 46. YOUR FIRST TASK

Do NOT start coding yet.

First give me:

1. Your understanding of the product.
2. Proposed architecture.
3. Proposed database schema with tables, columns, relationships and important constraints.
4. Proposed RLS/permission model.
5. Complete navigation structure.
6. Screen-by-screen UX flow.
7. Transaction lifecycle/state machine.
8. Gaming session lifecycle.
9. Due ledger design.
10. Inventory design.
11. Cash reconciliation design.
12. Important accounting invariants.
13. Potential edge cases.
14. MVP vs future features.
15. Recommended folder/project structure.
16. Recommended Supabase architecture.
17. Any changes you recommend to my product idea.

Do not write the full application yet.

Challenge my assumptions where necessary.

The priority order is:

1. Financial correctness
2. Fast staff workflow
3. Data integrity
4. Auditability
5. Security
6. Good UX
7. Scalability
8. Visual polish

Do not optimize for a pretty UI at the expense of accounting correctness.

After presenting the architecture, wait for my approval before implementing Phase 1.