# ACCOUNTS

## Purpose
Master table of Fikirhane's own financial accounts where money is held or passes through ("where is the money?"): bank accounts, cash boxes, POS, and (if needed) clearing accounts. Money movements live in TRANSACTIONS (from_account_id / to_account_id). NOT stored here: business unit (FINANCIAL_CENTERS - lives on DocumentItem/Transaction side), income/expense category (FINANCIAL_CATEGORIES), supplier/customer bank accounts (separate payment-info model if ever needed), document links (chain is ACCOUNT -> TRANSACTION -> TRANSACTION_ALLOCATION -> DOCUMENT), and any derived totals.

## Final fields
Authoritative = section 43 "nihai sade field set".

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Account | uuid | NOT NULL | gen | PK | Immutable PK (example `acc_GARANTI_TRY`) |
| account_code | text | NOT NULL | | | Technical fixed code, UNIQUE, stable (e.g. GARANTI_TRY, CASH_TRY, GARANTI_POS, ONLINE_CLEARING) |
| account_name | text | NOT NULL | | | Display name; may change |
| account_type | enum | NOT NULL | | | bank / cash / pos / clearing / other |
| currency_code | text (char(3)) | NOT NULL | | | Single currency per account (TRY/USD/EUR) |
| opening_balance | numeric(14,2) (Decimal) | NOT NULL | 0? | | Balance at system start, avoids entering all historical transactions |
| opening_balance_date | date | NOT NULL | | | Date the opening balance applies (e.g. 2026-10-01) |
| current_balance | numeric(14,2) (Decimal) | NULL | | | CACHE only; fully optional; can be a calculated field in FileMaker prototype. Not directly editable |
| bank_name | text | NULL | | | If bank account (e.g. Garanti BBVA) |
| account_reference | text | NULL | | | Safe/operational reference: IBAN last 6 digits, POS terminal ID, merchant ID, etc. |
| status | enum | NOT NULL | active | | active / inactive / archived |
| sort_order | int (Number) | NULL | | | UI order |
| notes | text | NULL | | | Internal note |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| iban | text | NULL | | | (V2/optional) Only add if actually used in payment operations; sensitive, requires access control |

## Enums / allowed values
- account_type:
  - `bank` - real bank account (e.g. Garanti Bankası TRY)
  - `cash` - physical cash box (e.g. Fikirhane Kasa)
  - `pos` - if POS collections tracked separately (e.g. Garanti POS)
  - `clearing` - interim account where money waits temporarily (e.g. Online Payment Clearing, POS Clearing)
  - `other` - rare exceptions
- status:
  - `active` - usable in new transactions
  - `inactive` - temporarily not usable in new transactions
  - `archived` - closed old account; no hard delete

## Constraints & indexes
- PK ID_Account (unique, immutable) (ACC-D01).
- UNIQUE(account_code) (ACC-D02).
- currency_code NOT NULL, exactly one currency per account; no "mixed" (ACC-D03).
- FK from TRANSACTIONS.from_account_id / to_account_id: ON DELETE RESTRICT (accounts with history never hard deleted).
- App check: TRANSACTIONS referencing an inactive/archived account cannot be created (ACC-D09).
- App check (V1): transaction currency = account currency (ACC-D10).
- ID_Account and account_code stable (non-updatable); account_name updatable.

## Relationships
- ACCOUNTS 1 - N TRANSACTIONS via from_account_id.
- ACCOUNTS 1 - N TRANSACTIONS via to_account_id (same account can be on both sides).
- No relationship to FINANCIAL_CENTERS, FINANCIAL_CATEGORIES, USERS (as owner), ORGANIZATIONS, DOCUMENTS.

## Business rules / data rules
1. ACC-D01: ID_Account unique and immutable.
2. ACC-D02: account_code unique.
3. ACC-D03: each account uses exactly one currency (Garanti TRY and Garanti USD are two accounts).
4. ACC-D04: balance source of truth = opening_balance + posted transactions: balance = opening_balance + SUM(posted where to_account = account) - SUM(posted where from_account = account). Example: 100,000 + 20,000 collection - 8,000 expense - 5,000 transfer out = 107,000.
5. ACC-D05: current_balance, if stored, is only a cache and must always be reconcilable with the transaction ledger.
6. ACC-D06: users cannot edit current_balance directly; corrections via adjustment Transaction or (during initial setup) opening balance correction.
7. ACC-D07: Financial Center and Financial Category are not stored on Account (one account receives revenue of many centers and pays many categories).
8. ACC-D08: account with transaction history must not be hard deleted.
9. ACC-D09: inactive/archived accounts cannot be used for new transactions.
10. ACC-D10: in V1 transaction currency must equal account currency.
11. Only `posted` transactions affect balance; `pending`, `failed`, `cancelled` do not.
12. Reversal: prefer original transaction + counter transaction over just changing status (preserves financial history).
13. Closed bank account -> status = archived; old transactions stay linked; reports unaffected.
14. Cash count difference: controlled adjustment transaction (e.g. type=adjustment, from_account=Cash, amount=150 when system 10,000 vs physical 9,850); reason and audit mandatory.
15. Cash is an Account (account_type=cash); no separate cash transaction table. Multiple cash boxes (Reception Cash, Cafeteria Cash) only if truly separate money pools; V1 single Cash.
16. POS as separate account optional - only if reconciliation needed (e.g. two POS: Garanti POS, İş Bankası POS). Simple V1: card payment goes directly to bank account (collection, to_account=Garanti Bank, payment_method=credit_card). Settlement model: card payment -> POS Clearing -> transfer POS Clearing -> Bank.
17. Clearing account: online payment lands in clearing (+500), settlement 2 days later is a transfer (Clearing -500, Bank +500), so provider pending balance is visible.
18. Provider commission (future): Collection -> Clearing 500; expense document/fee 15; transfer Clearing -> Bank 485. V1 may defer POS fee detail.
19. No available/blocked balance split in V1; current_balance sufficient.
20. Only Fikirhane's own/operationally controlled accounts are stored; not users'/organizations' accounts.
21. Cafeteria example: Document Cafeteria Sale 320 -> Transaction collection to_account Bank/POS 320 -> Allocation 320 to the document; Financial Center (Cafeteria) stays on DocumentItem.

## Seed data
V1 starting set (minimal):
- Garanti Bankası TRY (`acc_GARANTI_TRY`, code `GARANTI_TRY`, type bank, TRY, opening_balance 250000.00, opening_balance_date 2026-10-01, bank_name Garanti BBVA, account_reference "Main Operating Account", status active, sort_order 10)
- Nakit Kasa (`acc_CASH_TRY`, code `CASH_TRY`, name "Fikirhane Cash", type cash, TRY, opening_balance 5000.00, opening_balance_date 2026-10-01, status active)

Added only if online/POS settlement tracking is really needed:
- POS Clearing (`acc_POS_CLEARING`, code `POS_CLEARING`, type clearing, TRY, opening_balance 0, opening_balance_date 2026-10-01, status active)
- Online Payment Clearing (code example `ONLINE_CLEARING`)

Other example codes mentioned: GARANTI_POS (Garanti POS). Doc explicitly: do not create 7-8 virtual accounts on day one.

## Superseded / rejected ideas
- ACCOUNTS.ID_FinancialCenter - rejected.
- ACCOUNTS.ID_FinancialCategory - rejected.
- ACCOUNTS.ID_User / ID_Organization - rejected.
- total_income, total_expense, total_transfers, transaction_count - rejected (derived).
- paid_amount, receivable_amount, payable_amount - rejected.
- available_balance / blocked balance / ledger balance split - not in V1.
- currency = mixed - rejected.
- Directly editable current_balance - rejected.
- Reversal by status change only - rejected in favor of counter transaction.
- Broad banking schema - unnecessary without full bank integration.

## Open questions
- Whether to store current_balance at all or calculate it (fully optional).
- Whether to add `iban` (only if used for payment operations).
- Whether POS/clearing accounts are needed (depends on reconciliation need).
- POS/provider fee modelling deferred.

## Example row
`acc_GARANTI_TRY | GARANTI_TRY | Garanti Bankası TRY | bank | TRY | 250000.00 | 2026-10-01 | current_balance NULL/cached | Garanti BBVA | Main Operating Account | active | sort_order 10`
