# DOCUMENTS

## Purpose
Header record of a commercial document (sale or purchase) in Fikirhane: one row = one document with its direction, counterparty, date, currency, totals, billing snapshot and lifecycle. It is a single unified table for sales, purchases, expenses, orders and invoices (no separate SALES/PURCHASES/EXPENSES/ORDERS/INVOICES/CUSTOMERS/SUPPLIERS tables). NOT stored here: line detail, Financial Center, Financial Category, Booking link and Item (all on DOCUMENT_ITEMS); actual money movements (TRANSACTIONS); which payment settled how much of which document (TRANSACTION_ALLOCATIONS); payment status / balance (derived from allocations).

## Final fields
(Source: section 49 "nihai sade field set"; types from section 4.)

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Document | uuid (doc example `doc_10001`) | NOT NULL | generated | PK | Unique, immutable |
| direction | enum | NOT NULL | — | — | `sale` / `purchase` — economic direction |
| document_type | enum | NOT NULL | — | — | V1 set: invoice / receipt / internal |
| document_number | text | NULL | — | — | Real document/invoice number (internal e.g. SALE-2026-001001, FIK-2026-000123, or supplier's e.g. ABC20260078, SUP-INV-4581). NULL allowed in draft; can be required when posted |
| document_date | date | NOT NULL | — | — | Commercial document date; not the same as created_at |
| ID_User | uuid | NULL | — | USERS.ID_User | Counterparty if individual |
| ID_Organization | uuid | NULL | — | ORGANIZATIONS.ID_Organization | Counterparty if organization (customer or supplier) |
| currency_code | text (char(3)) | NOT NULL | — | — | TRY / USD / EUR; one currency per document |
| subtotal_amount | numeric (decimal) | NOT NULL | 0 (implied) | — | Total of lines before discount/tax (cached/validated aggregate) |
| discount_amount | numeric (decimal) | NOT NULL | 0 (implied) | — | Document-level total discount; preferably sum/snapshot of line-level discounts |
| tax_amount | numeric (decimal) | NOT NULL | 0 (implied) | — | Total tax (sum of line tax_amount) |
| grand_total | numeric (decimal) | NOT NULL | 0 (implied) | — | Final total = subtotal − discount + tax; must equal SUM(DOCUMENT_ITEMS.line_total) |
| due_date | date | NULL | — | — | Payment due date if on terms (e.g. sponsorship invoice); NULL for cafeteria cash sale |
| status | enum | NOT NULL | 'draft' (implied) | — | Document lifecycle: draft / posted / cancelled |
| reference_number | text | NULL | — | — | External reference (payment provider order no, supplier invoice no, POS ref, external reservation no). Provider-specific IDs belong on TRANSACTIONS |
| description | text | NULL | — | — | Document description |
| billing_name | text | NULL | — | — | Snapshot of name on document |
| billing_tax_number | text | NULL | — | — | Snapshot of tax number |
| billing_tax_office | text | NULL | — | — | Snapshot of tax office |
| billing_address | text | NULL | — | — | Snapshot of billing address |
| posted_at | timestamptz | NULL | — | — | When financially finalized |
| posted_by_user_id | uuid | NULL | — | USERS.ID_User | Who posted (cashier, admin); NULL when system (actor type then recorded in AUDIT_LOG) |
| cancelled_at | timestamptz | NULL | — | — | Cancel time |
| cancelled_by_user_id | uuid | NULL | — | USERS.ID_User | Who cancelled |
| cancellation_reason | text | NULL | — | — | Why cancelled |
| created_at | timestamptz | NOT NULL | now() | — | |
| created_by_user_id | uuid | NULL | — | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | — | |
| updated_by_user_id | uuid | NULL | — | USERS.ID_User | |

## Enums / allowed values
- **direction**
  - `sale` — Fikirhane sells to counterparty (Booking, Cafeteria sale, Sponsorship, Meeting room rental)
  - `purchase` — Fikirhane buys a product/service (Coffee purchase, Tutor invoice, Electricity bill, Software subscription)
- **document_type** — V1 set: `invoice`, `receipt`, `internal`. Broader set considered for later (when e-Fatura/e-Arşiv integration starts): `invoice`, `receipt`, `order`, `expense`, `credit_note`, `debit_note`, `proforma`.
- **status** (document lifecycle): `draft`, `posted`, `cancelled`.
- **payment status (derived, NOT stored)**: `unpaid`, `partially_paid`, `paid`, `overpaid` — computed from SUM(TRANSACTION_ALLOCATIONS) vs grand_total (e.g. total 1,000: 0 → unpaid, 500 → partially_paid, 1,000 → paid, 1,100 → overpaid).

## Constraints & indexes
- PK ID_Document (immutable).
- CHECK direction IN ('sale','purchase') (DOC-D02).
- CHECK NOT (ID_User IS NOT NULL AND ID_Organization IS NOT NULL) — at most one counterparty. Both NULL allowed in limited cases (anonymous cafeteria sale); important sales should have a counterparty.
- document_number: NULL allowed in draft; may be required (CHECK status <> 'posted' OR document_number IS NOT NULL) once posted. Likely unique per numbering series for internal numbers (doc implies sequential series SALE-YYYY-NNNNNN / PUR-YYYY-NNNNNN; uniqueness not explicitly stated).
- Header totals must be consistent with DOCUMENT_ITEMS (DOC-D04): grand_total = SUM(DOCUMENT_ITEMS.line_total); grand_total = subtotal_amount − discount_amount + tax_amount.
- All DOCUMENT_ITEMS must use the document's currency (DOC-D03).
- Some direction × document_type combinations may be restricted by business rule (sale+invoice, sale+receipt, purchase+invoice, purchase+receipt all possible).
- When status = cancelled: cancelled_at / cancelled_by_user_id / cancellation_reason filled. When posted: posted_at filled.

## Relationships
- USERS 1 — N DOCUMENTS (ID_User, optional); ORGANIZATIONS 1 — N DOCUMENTS (ID_Organization, optional; suppliers are ORGANIZATIONS with ORGANIZATION_ROLES.role_type = supplier).
- DOCUMENTS 1 — N DOCUMENT_ITEMS.
- DOCUMENTS N — N TRANSACTIONS via TRANSACTION_ALLOCATIONS (one document paid by several transactions, e.g. 3,000 cash + 7,000 bank; one transaction settles several documents, e.g. 20,000 transfer → Doc A 12,000 + Doc B 8,000).
- BOOKINGS link through DOCUMENT_ITEMS.ID_Booking (not on header); one document may contain several booking lines.
- USERS for posted_by / cancelled_by / created_by / updated_by.

## Business rules / data rules
1. DOC-D01: ID_Document unique and immutable.
2. DOC-D02: direction only sale or purchase.
3. DOC-D03: each document uses a single currency; all its items in that currency.
4. DOC-D04: header totals must be consistent with DocumentItems totals; DOCUMENT_ITEMS are the commercial source of truth; header totals are cached/validated aggregates.
5. DOC-D05: Financial Center and Financial Category are kept at DocumentItem level, not on the header (one document may mix centers, e.g. English Club Sponsorship → English Club and Meeting Room Rental → General/Meeting Room FC).
6. DOC-D06: critical fields of a posted document (customer/counterparty, items, amounts, taxes, currency) cannot be changed by normal edit; fix via cancel + new document or credit note/reversal.
7. DOC-D07: posted/cancelled documents must not be hard deleted.
8. DOC-D08: cancelling a document does not delete existing Transactions; refunds are a separate process (new refund Transaction); old Transaction kept.
9. DOC-D09: payment status computed from Transaction Allocations (no persistent payment_status).
10. DOC-D10: billing/legal information snapshotted at document creation (copied from User contact/Organization master data).
11. DOC-D11: a document may contain multiple Financial Centers/Categories.
12. DOC-D12: User/Organization master data changes must not change past document snapshots.
13. Draft documents are editable (lines can be added/removed, e.g. open cafeteria tab); locked once posted.
14. Posted = commercial record finalized.
15. Cancel: set status = cancelled + cancelled_at + cancelled_by_user_id + cancellation_reason; if allocations/payments exist, separate refund/reversal is needed.
16. Cafeteria open-tab model: a draft sale document per user (e.g. customer Ahmet), lines added during the day (Coffee, Sandwich, Croissant); at payment: document posted → Transaction created → Allocation created.
17. Never reopen a previously paid/posted Booking document to add cafeteria lines; each sale moment has its own document flow; paid documents are immutable.
18. Document lifecycle and payment status are separate concerns (same logic as Booking model).
19. Expenses are purchase documents (e.g. electricity bill: direction=purchase, item FC=General, category=Electricity); no EXPENSES table.
20. Suppliers are ORGANIZATIONS (role supplier); customers are USERS or ORGANIZATIONS.
21. Posted documents may get system-generated sequence numbers (SALE-2026-000001, PUR-2026-000001); official e-Fatura numbering may be handled by the integration system; internal numbering suffices for V1.
22. Audit (mandatory): document.created, document.posted, document.cancelled; especially total changes, counterparty change, item changes, post/cancel actions.
23. Stock effects (from STOCK_MOVEMENTS doc): stock movements are generated only when status = posted; posted purchase of stock-tracked item = received stock in V1.

## Superseded / rejected ideas
- Separate SALES / PURCHASES / EXPENSES / ORDERS / INVOICES tables — rejected (unified with direction).
- Separate CUSTOMERS / SUPPLIERS tables — rejected.
- Status set draft / issued / posted / partially_paid / paid / cancelled — rejected (mixes payment with lifecycle).
- Persistent payment_status field — rejected (derived).
- current_balance field — rejected.
- ID_FinancialCenter, ID_FinancialCategory on header — rejected.
- ID_Booking on header — rejected (on DOCUMENT_ITEMS).
- Wide document_type set (order, expense, credit_note, debit_note, proforma) — deferred until e-Fatura/e-Arşiv integration.
- Adding later cafeteria lines to an already paid/posted booking document — rejected.

## Open questions
- Operational order vs official invoice split when legal e-Fatura integration arrives (document_type split or separate fiscal document layer).
- Separate ORDERS table if e-commerce fulfillment workflow (accepted, picking, shipping, delivery) emerges.
- Which direction × document_type combinations are disallowed.
- Whether document_number becomes mandatory on post (stated "can be made required").
- How credit notes/reversals are modeled in V1 (credit_note type not in V1 set).
- Representation of "System" as poster (nullable posted_by + AuditLog actor_type suggested, but example uses usr_SYSTEM).

## Example row
Booking sale: ID_Document=doc_10001, direction=sale, document_type=receipt, document_number=SALE-2026-001001, document_date=2026-09-22, ID_User=usr_AHMET, ID_Organization=NULL, status=posted, currency_code=TRY, subtotal_amount=500.00, discount_amount=75.00, tax_amount=0.00, grand_total=425.00, due_date=2026-09-22, billing_name="Ahmet Yılmaz", posted_at=2026-09-22 10:42, posted_by_user_id=usr_SYSTEM. Child line: Booking 5001 / English Club / Event Revenue / 425 TRY.

Supplier purchase: ID_Document=doc_20001, direction=purchase, document_type=invoice, document_number=SUP-INV-4581, document_date=2026-09-21, ID_User=NULL, ID_Organization=org_COFFEE_SUPPLIER, status=posted, currency_code=TRY, subtotal_amount=8,000.00, tax_amount=1,600.00, grand_total=9,600.00, due_date=2026-10-05, billing_name="Coffee Supplier AŞ". Lines: Coffee Beans → Cafeteria → Food & Beverage Purchases; Tea → Cafeteria → Food & Beverage Purchases.

## Seed data
No seed rows. Enumerated document_type V1 values: invoice, receipt, internal. Numbering pattern examples: SALE-2026-000001, PUR-2026-000001, FIK-2026-000123.
