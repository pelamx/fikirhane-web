# TRANSACTION_ALLOCATIONS

## Purpose
N:N junction/distribution table: one row = the portion of one real money TRANSACTION applied to one commercial DOCUMENT ("which document was this payment applied to, and how much?"). Lets one payment close many documents and one document be closed by many payments; document payment status, paid_amount and remaining_amount, and transaction unallocated_amount are all derived from these rows. NOT stored here: Financial Center / Financial Category (via Document -> DocumentItems), Account (on TRANSACTIONS from/to), currency (must equal Transaction and Document currency), DocumentItem-level allocation, paid/remaining amounts. It is operational small-business finance, not a double-entry accounting ledger.

## Final fields
Authoritative = section 43 "nihai sade field set".

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_TransactionAllocation | uuid | NOT NULL | gen | PK | Immutable (e.g. `talloc_10001`) |
| ID_Transaction | uuid (FK) | NOT NULL | | TRANSACTIONS.ID_Transaction (restrict) | Money movement being distributed |
| ID_Document | uuid (FK) | NOT NULL | | DOCUMENTS.ID_Document (restrict) | Commercial document the payment is applied to (e.g. Invoice 2026-000123) |
| allocated_amount | numeric(14,2) (Decimal) | NOT NULL | | | Portion of transaction applied; always positive (> 0) |
| allocation_at | timestamptz | NOT NULL | now() | | When applied to document; need not equal Transaction.transaction_at (e.g. received 10 Sep, allocated 12 Sep) |
| status | enum | NOT NULL | active | | active / reversed |
| reversed_at | timestamptz | NULL | | | If allocation was reversed |
| reversed_by_user_id | uuid (FK) | NULL | | USERS.ID_User | Who reversed |
| reversal_reason | text | NULL | | | Why reversed |
| notes | text | NULL | | | Internal note |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid (FK) | NULL | | USERS.ID_User | e.g. usr_SYSTEM |
| updated_at | timestamptz | NULL | | | (V2/optional) "not even required"; add only if a standard audit field set is used across all tables |
| updated_by_user_id | uuid (FK) | NULL | | USERS.ID_User | (V2/optional) same condition (implied by standard audit set) |

## Enums / allowed values
- status:
  - `active` - allocation valid
  - `reversed` - allocation undone; no hard delete
- Reasons for reversal (examples, not an enum): payment linked to wrong invoice, document cancelled, payment chargeback, accounting matching was wrong.
- Derived document payment status (computed, not stored on DOCUMENTS): `unpaid` (allocated 0), `partially_paid` (0 < allocated < grand_total), `paid` (allocated = grand_total), `overpaid` (allocated > grand_total - not allowed in V1 by TALLOC-D04).
- Aging report buckets (derived): Outstanding, Overdue, Partially Paid, Paid.

## Constraints & indexes
- PK ID_TransactionAllocation (immutable).
- ID_Transaction, ID_Document NOT NULL, valid FKs (TALLOC-D01).
- CHECK allocated_amount > 0 (TALLOC-D02).
- Partial UNIQUE(ID_Transaction, ID_Document) WHERE status = 'active' (TALLOC-D05).
- Trigger/app: SUM(active allocations for transaction) <= TRANSACTIONS.amount (TALLOC-D03).
- Trigger/app: SUM(active allocations for document) <= DOCUMENTS.grand_total in V1 (TALLOC-D04).
- Trigger/app: TRANSACTIONS.transaction_type <> 'transfer' (TALLOC-D06).
- Trigger/app: Transaction.currency_code = Document.currency_code (TALLOC-D10).
- Allocation created only when transaction status = posted.
- No hard delete (TALLOC-D09).
- Indexes on ID_Transaction, ID_Document.

## Relationships
- TRANSACTIONS 1 - N TRANSACTION_ALLOCATIONS.
- DOCUMENTS 1 - N TRANSACTION_ALLOCATIONS.
- Net: TRANSACTIONS N:N DOCUMENTS.
- USERS 1 - N (reversed_by_user_id, created_by_user_id).

## Business rules / data rules
1. TALLOC-D01: every allocation linked to a valid Transaction and Document.
2. TALLOC-D02: allocated_amount > 0 (positive only; direction comes from TRANSACTIONS.transaction_type and from/to accounts; signed amounts rejected).
3. TALLOC-D03: sum of active allocations of a transaction must not exceed transaction amount (e.g. 10,000 transaction cannot have 7,000 + 5,000).
4. TALLOC-D04: in V1 sum of active allocations to a document must not exceed document grand_total. Overpayment remainder stays unallocated on the transaction (e.g. doc 1,000, payment 1,200 -> allocate 1,000, 200 unallocated; may later go to another document, be refunded, or be modelled as customer credit). Making the document "1,200 paid" is wrong.
5. TALLOC-D05: max one active allocation per Transaction + Document (combine 3,000 + 2,000 into one 5,000).
6. TALLOC-D06: transfer transactions are never allocated (internal transfers have no commercial document). Main use: collection, expense_payment, refund.
7. TALLOC-D07: only financially valid/posted transactions count in payment calculations. Pending/failed transactions must not close a document via allocation (provider pending -> document still unpaid/partially paid).
8. TALLOC-D08: reversed allocations excluded from payment totals.
9. TALLOC-D09: allocation records never hard deleted; reverse by status = reversed + reversed_at + reversal_reason (+ reversed_by_user_id).
10. TALLOC-D10: Transaction and Document currencies must match in V1; multi-currency/FX later.
11. TALLOC-D11: Financial Center, Financial Category, Account not duplicated onto allocation.
12. A transaction need not be fully allocated: unallocated_amount = transaction.amount - SUM(active allocations) (not stored).
13. A document need not be fully paid: paid_amount = SUM(active/valid allocations for document); remaining_amount = grand_total - paid_amount (effective allocation total). Neither stored on DOCUMENTS as source of truth; paid_amount may be cached for performance later but must be reconcilable.
14. Document payment status is derived from allocations, not a stored field.
15. Reversal model V1: simple - set existing allocation status = reversed (stricter immutable + counter-allocation model not needed at Fikirhane scale; lighter than TRANSACTIONS and STOCK_MOVEMENTS ledgers).
16. Transaction cancelled/reversed: linked active allocations are reversed in a controlled way during transaction reversal AND queries count only allocations that are active with Transaction.status = posted (both together).
17. Concurrency: post transaction + create allocation + update any cached balance in the same database transaction where possible (else money received but document appears unpaid).
18. Refund: new TRANSACTIONS row with type = refund; may be allocated to the related document if needed; how a refund affects document balance must be explicitly defined in business logic - allocations are interpreted together with transaction type for payment effect.
19. Allocation at Document level only in V1, not DocumentItem.
20. Aging: Document.due_date + allocation totals -> Outstanding/Overdue/Partially Paid/Paid (e.g. total 10,000, paid 6,000, due date passed -> 4,000 overdue).
21. Supported scenarios: split payment (doc 1,000 = T1 400 cash + T2 600 card -> two allocations); one transfer covering multiple documents (20,000 -> 12,000 Doc A + 8,000 Doc B); batch corporate payment (50,000 -> Doc A 20,000, B 15,000, C 10,000; 5,000 unallocated); booking + cafeteria docs in one 800 card payment (500 + 300); purchase document (9,600 supplier doc, expense_payment 9,600 -> paid); cafeteria POS 620 -> 620.

## Superseded / rejected ideas
- ID_FinancialCenter on allocation - rejected (duplicate).
- ID_FinancialCategory - rejected.
- ID_Account - rejected.
- ID_DocumentItem / item-level allocation - rejected for V1.
- currency_code on allocation - rejected.
- paid_amount, remaining_amount on allocation (or as source of truth on Document) - rejected.
- Signed (negative) allocated_amount - rejected.
- Multiple active allocations per same Transaction+Document - rejected.
- Strict ledger counter-allocation reversal model - not used in V1.
- Allowing document overpayment via allocation - rejected in V1.
- Treating allocations as a full double-entry accounting ledger - rejected (separate accounting ledger if GL integration comes).

## Open questions
- Refund's effect on document balance (how refund allocations reduce paid amount) - doc says must be defined explicitly in business logic.
- Customer credit modelling for unallocated overpayments - future.
- Whether updated_at/updated_by are included (depends on global standard audit field policy).
- Overpayment exception if business model requires it.

## Example row
`talloc_10001 | trx_10001 | doc_10001 | 425.00 | 2026-09-22 18:35 | active | reversed_* NULL | notes NULL | created_at 2026-09-22 18:35 by usr_SYSTEM`
