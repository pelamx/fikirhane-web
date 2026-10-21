# TRANSACTIONS

## Purpose
The money ledger: one row = one real money movement ("when, how much, from which account to which account did money actually move?") - customer POS collection, supplier bank payment, cash expense, refund, bank -> cash transfer, adjustment. NOT stored here: the commercial receivable/payable document (DOCUMENTS), which documents the money settled and how much (TRANSACTION_ALLOCATIONS - no ID_Document on transactions), Financial Center and Financial Category (DOCUMENT_ITEMS), counterparty user/organization (derived Transaction -> Allocation -> Document -> User/Organization), booking link (via allocation/document), and derived amounts (paid_amount, unallocated_amount, account_balance).

## Final fields
Authoritative = section 46 "nihai sade field set" (identical to section 3 table).

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Transaction | uuid | NOT NULL | gen | PK | Unique, immutable (e.g. `trx_10001`) |
| transaction_at | timestamptz | NOT NULL | | | When the money moved |
| transaction_type | enum | NOT NULL | | | collection / expense_payment / transfer / refund / adjustment |
| from_account_id | uuid (FK) | NULL | | ACCOUNTS.ID_Account (restrict) | Account money leaves; rules by type |
| to_account_id | uuid (FK) | NULL | | ACCOUNTS.ID_Account (restrict) | Account money enters; rules by type |
| amount | numeric(14,2) (Decimal) | NOT NULL | | | Always positive (> 0); direction from type + from/to |
| currency_code | text (char(3)) | NOT NULL | | | Single currency; V1 must equal account currency |
| payment_method | enum | NULL | | | cash / credit_card / debit_card / bank_transfer / online_payment / other (not the same as Account) |
| status | enum | NOT NULL | pending? | | pending / posted / failed / cancelled / reversed |
| reference_number | text | NULL | | | Internal/external ref (BANK-REF-12345, POS-2026-8891, CASH-000231) |
| provider_name | text | NULL | | | Payment/POS provider (iyzico, PayTR, Param, Bank POS, Garanti POS); not mandatory |
| provider_transaction_id | text | NULL | | | Provider's transaction ID; idempotency for duplicate callbacks |
| description | text | NULL | | | Free text; must not replace structured fields |
| posted_at | timestamptz | NULL | | | When financially finalized |
| reversed_at | timestamptz | NULL | | | Reversal time |
| reversed_by_user_id | uuid (FK) | NULL | | USERS.ID_User | Who reversed |
| reversal_reason | text | NULL | | | Reason for reversal |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid (FK) | NULL | | USERS.ID_User | e.g. usr_SYSTEM for provider-created |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| counterparty_user_id | uuid (FK) | NULL | | USERS.ID_User | (V2/optional) only if unallocated payments need a counterparty; "V1'de gerekmedikçe eklemem" |
| counterparty_organization_id | uuid (FK) | NULL | | ORGANIZATIONS.ID_Organization | (V2/optional) same as above |

## Enums / allowed values
- transaction_type:
  - `collection` - money into Fikirhane (customer pays booking, corporate client pays invoice, cafeteria POS payment). from = NULL, to = required (Bank/Cash/POS clearing)
  - `expense_payment` - money out to external party (supplier, tutor, electricity bill). from = required, to = NULL
  - `transfer` - between Fikirhane's own accounts (Bank -> Cash, Bank A -> Bank B). from and to required, from != to. Not income/expense
  - `refund` - return of previously received money to customer (booking refund, event cancellation refund). from = required (Bank/POS), to = NULL
  - `adjustment` - controlled correction (cash difference correction, payment reconciliation adjustment). Requires special permission. (ACCOUNTS doc example: adjustment from_account = Cash for a cash shortage)
- payment_method: `cash`, `credit_card`, `debit_card`, `bank_transfer`, `online_payment`, `other`
- status:
  - `pending` - not yet finalized
  - `posted` - real money movement finalized
  - `failed` - payment failed
  - `cancelled` - cancelled before finalization
  - `reversed` - a previously posted transaction was reversed

## Constraints & indexes
- PK ID_Transaction (unique, immutable) (TRX-D01).
- CHECK amount > 0 (TRX-D02).
- currency_code NOT NULL (TRX-D03); app/trigger: = account currency (V1) and = document currency.
- CHECK from_account_id IS DISTINCT FROM to_account_id / from != to (TRX-D04).
- CHECK by type:
  - collection: from_account_id IS NULL AND to_account_id IS NOT NULL (TRX-D05)
  - expense_payment, refund: from_account_id IS NOT NULL AND to_account_id IS NULL (TRX-D06)
  - transfer: both NOT NULL and different (TRX-D07)
  - adjustment: not specified (direction via from or to)
- UNIQUE(provider_name, provider_transaction_id) where provider_transaction_id not null ("provider bazında" unique; idempotency).
- FKs to ACCOUNTS ON DELETE RESTRICT; new transactions cannot use inactive/archived accounts (ACC-D09).
- Index on (from_account_id, status), (to_account_id, status) for balance computation (implied).

## Relationships
- ACCOUNTS 1 - N TRANSACTIONS (as from_account_id) and 1 - N (as to_account_id).
- TRANSACTIONS 1 - N TRANSACTION_ALLOCATIONS N - 1 DOCUMENTS (many-to-many to documents; zero allocations allowed = unallocated).
- USERS 1 - N TRANSACTIONS (reversed_by / created_by / updated_by).

## Business rules / data rules
1. TRX-D01: ID_Transaction unique and immutable.
2. TRX-D02: amount > 0 (always positive; no negative amounts).
3. TRX-D03: single currency per transaction.
4. TRX-D04: from and to cannot be the same account.
5. TRX-D05: collection requires to_account_id.
6. TRX-D06: expense_payment and refund require from_account_id.
7. TRX-D07: transfer requires both accounts.
8. TRX-D08: transfer transactions are not allocated to documents (no income/expense, no allocation).
9. TRX-D09: only posted transactions affect account balance. pending/failed/cancelled do not; reversed not counted in net effect - preferably handled by counter transaction.
10. TRX-D10: failed/cancelled transactions not included in document payment totals. Pending also does not make a document paid.
11. TRX-D11: critical fields of posted transactions (amount, currency, account, type, transaction_at) cannot be changed by normal edit; correction = reversal + new transaction. Limited edit allowed while pending.
12. TRX-D12: posted transactions never hard deleted (money ledger).
13. TRX-D13: document relationship only via TRANSACTION_ALLOCATIONS (one transaction can close many documents; one document can be paid by many transactions).
14. TRX-D14: Financial Center and Financial Category not stored on transactions (e.g. 20,000 payment = 12,000 English Club + 8,000 AI Club).
15. Balance effect: collection -> to_account + amount; expense_payment -> from_account - amount; transfer -> from - amount, to + amount; refund -> from - amount. Account balance = opening_balance + posted inflows - posted outflows; ACCOUNTS.current_balance only cache.
16. Reversal: preferred ledger model - original stays posted (operationally may be marked status = reversed), and a new opposite transaction is created (e.g. original collection 500 -> reversal refund 500). Simple V1 alternative: mark status = reversed + audit log. Never delete/modify posted transaction.
17. Refund does not delete original transaction.
18. Split payment: 1,000 document paid 400 cash + 600 card -> two collection transactions (to Cash 400, to Bank/POS 600) + two allocations.
19. One payment, multiple documents: corporate transfer 20,000 -> one collection + allocations 12,000 Doc A, 8,000 Doc B.
20. Unallocated transaction allowed (e.g. 10,000 received, posted, no allocation yet); finance user allocates later. Transaction need not be linked to a document.
21. Online payment flow: Booking -> payment initiated -> Transaction pending -> provider callback -> Transaction posted -> Document -> Allocation. Duplicate callbacks: idempotency via provider_transaction_id.
22. Failed transaction: no balance effect, no allocation, does not mark booking paid.
23. POS: card payment may go to POS Clearing account then transfer POS Clearing -> Bank; V1 may write card collections directly to bank.
24. Cash is an Account; every cash in/out is a Transaction; no separate cash transaction table.
25. Future bank feed: import bank movements into TRANSACTIONS, reconcile to documents via TRANSACTION_ALLOCATIONS.
26. No exchange_rate in V1: Document currency = Transaction currency = Account currency. Multi-currency handled later.
27. Audit events required: `transaction.created`, `transaction.posted`, `transaction.failed`, `transaction.reversed`.
28. adjustment type requires special permission; reason + audit mandatory (per ACCOUNTS).

## Superseded / rejected ideas
- TRANSACTIONS.ID_Document - rejected (use allocations).
- ID_Booking, ID_User, ID_Organization on transaction - rejected.
- ID_FinancialCenter, ID_FinancialCategory on transaction - rejected.
- paid_amount, unallocated_amount, account_balance stored fields - rejected (derived).
- Negative amounts - rejected.
- exchange_rate - not in V1.
- Separate cash transaction table - rejected.
- Mandatory counterparty fields - rejected; optional counterparty_user_id/counterparty_organization_id only if unallocated payments need it.
- Reversal by editing/deleting posted transaction - rejected.

## Open questions
- Which reversal model is used in V1 (status-only vs counter transaction); doc prefers counter transaction while keeping `reversed` status as marker. Also counter-transaction type for reversing an expense_payment or transfer not specified (only "collection 500 -> refund 500" example).
- from/to account rules for `adjustment` not defined (can be either direction).
- Default status on insert not stated.
- Whether counterparty fields are needed.
- provider_transaction_id uniqueness scope ("provider bazında düşünülebilir") not final.

## Example row
`trx_10001 | 2026-09-22 18:30 | collection | from NULL | to acc_GARANTI_POS | 425.00 TRY | credit_card | posted | POS-992731 | Garanti POS | GTX-8473921 | "Payment for booking BK-50001" | posted_at 2026-09-22 18:30 | created_at 2026-09-22 18:29 by usr_SYSTEM`
Others: `trx_20001 | 2026-09-22 14:10 | expense_payment | from acc_GARANTI_BANK | 9600.00 TRY | bank_transfer | posted | "Coffee supplier invoice payment"`; transfer `acc_GARANTI_BANK -> acc_CASH 5000 TRY posted` (no allocation).
