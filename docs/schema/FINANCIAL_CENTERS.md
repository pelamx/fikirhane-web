# FINANCIAL_CENTERS

## Purpose
Master table of Fikirhane's business units / revenue-expense responsibility centers ("which part of the business does this income or expense belong to?"), e.g. Working Club / Community Workspace, English Club, AI Club, Cafeteria, General. It is NOT an accounting/money account (that is ACCOUNTS - no balance here) and NOT the type of income/expense (that is FINANCIAL_CATEGORIES). Financial attribution is done on DOCUMENT_ITEMS.ID_FinancialCenter (line level), not on DOCUMENTS header and not on TRANSACTIONS. Managers/users go to FINANCIAL_CENTER_USERS; budgets to a future FINANCIAL_BUDGETS table; Club link lives on CLUBS.ID_FinancialCenter.

## Final fields
Authoritative = section 35 "nihai sade field set" (same as section 4 V1 table).

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_FinancialCenter | uuid | NOT NULL | gen | PK | Immutable PK (examples `fc_ENGLISH_CLUB`, `fc_ENGLISH`, `fc_CAFETERIA`, `fc_GENERAL`) |
| center_code | text | NOT NULL | | | Technical fixed code, UNIQUE; stable even when name/branding changes (e.g. WORKING_CLUB, ENGLISH_CLUB, AI_CLUB, CAFETERIA, GENERAL, WORKSPACE) |
| center_name | text | NOT NULL | | | Display name; may change (e.g. Working Club -> Community Workspace) |
| center_type | enum | NOT NULL | | | club / cafeteria / general / other |
| description | text | NULL | | | Description |
| status | enum | NOT NULL | active | | active / inactive / archived |
| sort_order | int (Number) | NULL | | | UI/report order |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |

## Enums / allowed values
- center_type (initial set, extensible if new business units appear): `club` (e.g. English Club), `cafeteria` (Cafeteria), `general` (General), `other`
- status:
  - `active` - usable for new financial transaction/document item attribution
  - `inactive` - not usable in new records but historical data preserved
  - `archived` - no longer a used business unit; no hard delete

## Constraints & indexes
- PK ID_FinancialCenter (unique, immutable) (FC-D01).
- UNIQUE(center_code) (FC-D02).
- On CLUBS: CLUBS.ID_FinancialCenter NOT NULL + UNIQUE (each club exactly one center; a center at most one club) (FC-D03, FC-D04).
- FK from DOCUMENT_ITEMS.ID_FinancialCenter ON DELETE RESTRICT (no hard delete if referenced).
- App check: only active centers selectable for new attribution.

## Relationships
- FINANCIAL_CENTERS 1 - N DOCUMENT_ITEMS (DOCUMENT_ITEMS.ID_FinancialCenter) - the main financial link.
- FINANCIAL_CENTERS 1 - 0..1 CLUBS (via CLUBS.ID_FinancialCenter, unique). Each Club -> exactly 1 center; centers like Cafeteria/General have no Club.
- FINANCIAL_CENTERS 1 - N FINANCIAL_CENTER_USERS (separate table, for manager/viewer/finance_responsible roles with history).
- No relationship to ACCOUNTS, no FK on TRANSACTIONS, no FK on DOCUMENTS header.
- Reporting chain: TRANSACTION -> TRANSACTION_ALLOCATIONS -> DOCUMENT -> DOCUMENT_ITEMS -> FINANCIAL_CENTER.

## Business rules / data rules
1. FC-D01: ID_FinancialCenter unique and immutable.
2. FC-D02: center_code unique.
3. FC-D03: every Club linked to exactly one Financial Center.
4. FC-D04: a Club's Financial Center must not be shared by another Club.
5. FC-D05: non-club Financial Centers must be possible (e.g. Cafeteria, General).
6. FC-D06: Financial Center is not a money account; no balance stored. Center performance = revenue - expense via reports.
7. FC-D07: Financial Center and Financial Category are separate dimensions (e.g. English Club + Sponsorship Revenue; AI Club + Tutor Expense).
8. FC-D08: real financial attribution is at DOCUMENT_ITEMS level (a document can be mixed, e.g. Item 1 -> Cafeteria, Item 2 -> English Club).
9. FC-D09: Financial Center not stored directly on TRANSACTIONS (one transaction can settle multiple documents, e.g. 10,000 corporate payment = 6,000 English Club + 4,000 AI Club).
10. FC-D10: archived centers are not removed from historical financial records.
11. Shared overhead (accountant, internet, electricity, general cleaning, software subscription, office supplies) goes to General in V1; no forced overhead allocation to clubs. Club performance = direct revenue - direct expense = club contribution.
12. Cafeteria must be its own center (sales, stock consumption, purchases, own gross margin).
13. Working Club / Community Workspace is a center (booking revenue, freepass value, direct operating expenses). If Working Club is the Community Workspace service itself, do not open two centers.
14. Default center derivation (the real value is still written as snapshot to DOCUMENT_ITEMS.ID_FinancialCenter): Club event -> Event -> primary Club (CLUB_EVENTS.is_primary = true) -> Club.ID_FinancialCenter; cafeteria sale -> Cafeteria; general expense -> General. Manual override allowed at Document Item level if commercial agreement differs (e.g. AI Club organizer/primary, English Club co-organizer -> default AI Club FC).
15. Club revenue example: English Meetup Booking -> Document Item ID_FinancialCenter=English Club, ID_FinancialCategory=Event Revenue. Sponsorship: ABC Ltd sponsors English Club -> FC English Club + Category Sponsorship Revenue.
16. Auto-create: Create Club -> Create Financial Center -> CLUBS.ID_FinancialCenter = new center (admin doesn't have to set up center separately).
17. Club closed (e.g. Spanish Club status=archived) -> its center status=archived; old DOCUMENT_ITEMS stay linked.
18. Renames keep ID and code stable; treat code as technical identity, not branding.
19. No hard delete when DOCUMENT_ITEMS reference it; use status = archived generally.
20. Center-scoped KPIs (via FINANCIAL_CENTER_USERS scope): Revenue, Direct Expense, Contribution, Paid attendance, Freepass attendance, Membership conversion, Sponsor revenue.

## Seed data
Initial records:
- Community Workspace (center_code example WORKSPACE / WORKING_CLUB; type club? - doc lists Working Club as center; see open questions)
- Cafeteria: `fc_CAFETERIA`, code CAFETERIA, name Cafeteria, type cafeteria, description "Cafeteria sales and direct operating expenses.", status active, sort_order 80
- General: `fc_GENERAL`, code GENERAL, name General, type general, description "Shared Fikirhane overhead and expenses not directly attributable to another financial center.", status active, sort_order 100

Then one per active Club as clubs open, e.g.:
- English Club: `fc_ENGLISH`, code ENGLISH_CLUB, name English Club, type club, description "Financial performance center for English Club activities.", status active, sort_order 20, created_at 2026-09-20 10:00, created_by_user_id usr_ADMIN
- Spanish Club, AI Club (code AI_CLUB), ...

Code examples listed: WORKING_CLUB, ENGLISH_CLUB, AI_CLUB, CAFETERIA, GENERAL, WORKSPACE.

## Superseded / rejected ideas
- FINANCIAL_CENTERS.ID_Club - rejected (use CLUBS.ID_FinancialCenter).
- Using ID_Club directly in finance tables instead of a center dimension - rejected.
- Financial Center on DOCUMENTS header - rejected (line-level only).
- Financial Center on TRANSACTIONS - rejected.
- manager_user_id - rejected (use FINANCIAL_CENTER_USERS).
- parent_financial_center_id / hierarchy - not in V1 (maybe for multi-branch later).
- monthly_budget / annual_budget - rejected (future FINANCIAL_BUDGETS).
- balance / current_balance, price, revenue, expense fields - rejected.
- Overhead allocation by percentage (e.g. electricity 30% Working Club...) - rejected for V1.
- Two separate centers for Working Club and Community Workspace if they are the same service - rejected.

## Open questions
- Whether Working Club and Community Workspace are the same center (doc says don't create two if same); its code (WORKING_CLUB vs WORKSPACE) and center_type (club vs other) not fixed.
- FINANCIAL_CENTER_USERS table structure not defined here (roles mentioned: manager, viewer, finance_responsible).
- center_type list may expand.
- Example IDs inconsistent: `fc_ENGLISH_CLUB` vs `fc_ENGLISH`.

## Example row
`fc_ENGLISH | ENGLISH_CLUB | English Club | club | "Financial performance center for English Club activities." | active | 20 | 2026-09-20 10:00 usr_ADMIN`
