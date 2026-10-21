# FINANCIAL_CATEGORIES

## Purpose
Master table classifying the economic nature of Fikirhane's income and expenses ("what was this income/expense for?"), e.g. Event Revenue, Sponsorship Revenue, Cafeteria Sales, Tutor Expense, Utilities. One row = one income or expense category. NOT stored here: business unit (FINANCIAL_CENTERS - separate dimension, no FK between them), where money moved (ACCOUNTS), money-movement kind such as refund/transfer/payment method (TRANSACTIONS.type / payment_method), tax and discount (DOCUMENT_ITEMS tax_rate/tax_amount/discount_amount), freepass attribution (Campaign/Freepass tables), revenue/expense totals (computed from DOCUMENT_ITEMS). Actual classification is stored on DOCUMENT_ITEMS.ID_FinancialCategory (line level); ITEMS only hold defaults.

## Final fields
Authoritative = section 35 "nihai sade field set" (same as section 4 V1 table).

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_FinancialCategory | uuid | NOT NULL | gen | PK | Immutable PK (e.g. `fcat_EVENT_REVENUE`) |
| category_code | text | NOT NULL | | | Technical fixed code, UNIQUE, kept stable (e.g. EVENT_REVENUE, SPONSORSHIP_REVENUE, CAFETERIA_SALES, TUTOR_EXPENSE, MARKETING_EXPENSE, UTILITIES, SOFTWARE_EXPENSE) |
| category_name | text | NOT NULL | | | Display name; may change; may be shown in Turkish UI (Etkinlik Geliri, Sponsorluk Geliri, Kafeterya Satışı, Tutor Gideri, Pazarlama Gideri) |
| direction | enum | NOT NULL | | | income / expense only |
| category_group | enum (Enum/Text, controlled value list) | NOT NULL | | | Higher-level reporting group (see enums) |
| description | text | NULL | | | |
| status | enum | NOT NULL | active | | active / inactive / archived |
| sort_order | int (Number) | NULL | | | UI/report order |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |

## Enums / allowed values
- direction: `income`, `expense` (no third `refund` direction; no transfer category)
- category_group:
  - income side: `operating_revenue`, `sponsorship`, `membership`, `cafeteria`, `other_income`
  - expense side: `people`, `marketing`, `facilities`, `technology`, `cafeteria_cost`, `administrative`, `other_expense`
- status: `active`, `inactive`, `archived` (inactive/archived not usable for new DocumentItems; historical lines stay linked)

## Constraints & indexes
- PK ID_FinancialCategory (unique, immutable) (FCAT-D01).
- UNIQUE(category_code) (FCAT-D02).
- CHECK direction IN ('income','expense') (FCAT-D03).
- Suggested CHECK: category_group consistent with direction (income groups vs expense groups) - implied by the split lists, not explicitly stated.
- FK DOCUMENT_ITEMS.ID_FinancialCategory -> this table, NOT NULL on financial document items, ON DELETE RESTRICT.
- App check: only active categories selectable for new DocumentItems.

## Relationships
- FINANCIAL_CATEGORIES 1 - N DOCUMENT_ITEMS (DOCUMENT_ITEMS.ID_FinancialCategory) - main link.
- FINANCIAL_CATEGORIES 1 - N ITEMS via ITEMS.default_revenue_category_id and ITEMS.default_expense_category_id (defaults copied to DocumentItem at creation).
- No FK to FINANCIAL_CENTERS, ACCOUNTS, TRANSACTIONS, DOCUMENTS header.

## Business rules / data rules
1. FCAT-D01: ID_FinancialCategory unique and immutable.
2. FCAT-D02: category_code unique.
3. FCAT-D03: direction only income or expense.
4. FCAT-D04: category not linked directly to Financial Center (same category used across many centers, e.g. Event Revenue in English/AI/Spanish/Working Club; Marketing Expense in English Club and General).
5. FCAT-D05: category not linked directly to Account (Marketing Expense may be paid from Garanti or cash).
6. FCAT-D06: real category attribution at DOCUMENT_ITEMS level (not header: one supplier invoice can contain Office Supplies, Cleaning Expense, Food & Beverage Purchases lines).
7. FCAT-D07: each financial DocumentItem has exactly one category in V1; to split, create two DocumentItems (e.g. 6,000 Marketing + 4,000 Event Expense lines) - no allocation engine.
8. FCAT-D08: transfer, refund, payment method are not modelled as categories. Refund = TRANSACTIONS.type = refund with category still e.g. Event Revenue; transfer = TRANSACTIONS.type = transfer.
9. FCAT-D09: archived categories not removed from historical financial lines.
10. FCAT-D10: revenue/expense totals not stored on category table; computed from DocumentItems.
11. Category not stored on TRANSACTIONS (one 10,000 payment may cover Document A Event Revenue 6,000 + Document B Sponsorship Revenue 4,000).
12. DOCUMENT_ITEMS.ID_FinancialCategory should be NOT NULL on financial items; ID_FinancialCenter likewise required on most commercial lines - the two core analytics dimensions.
13. ITEMS default category is copied to DocumentItem; DocumentItem holds the actual historical classification (item defaults may change later without altering past sales).
14. Keep categories high-level (no Tomato/Cheese/Coffee Bean/Tea/Napkin Expense); item-level detail via ITEMS/purchase detail. Start with ~15-20 categories, not hundreds.
15. "Other" categories allowed but limited; prevent users choosing Other for everything; growing Other in reports signals need for new category.
16. Tax (VAT) is not a category: tax_rate/tax_amount on DocumentItem; don't confuse a "VAT Expense" category with sales VAT.
17. Discount is not a category: discount_amount on DocumentItem; category stays e.g. Event Revenue.
18. Freepass is not a category: price_list 500, discount 500, final 0, category still Workspace Revenue or Event Revenue; freepass attribution tracked by Campaign/Freepass.
19. Sponsorship Revenue must be a separate category (e.g. English Club: Event Revenue 80,000 / Sponsorship Revenue 50,000).
20. Membership Revenue only if membership becomes paid; free/community membership creates no transaction.
21. V1: any active category may be combined with any active financial center (no validation rules).
22. Rename allowed for display name (e.g. Event Revenue -> Event & Workshop Revenue); category_code stays stable.
23. Expense doc example: electricity bill DOCUMENT direction=purchase; DocumentItem description "September electricity bill", ID_FinancialCenter=General, ID_FinancialCategory=Electricity.

## Seed data
Authoritative starting set (section 34, ~15-20 categories):
- INCOME: Workspace Revenue, Event Revenue, Meeting Room Revenue, Virtual Office Revenue, Membership Revenue, Sponsorship Revenue, Cafeteria Sales, Other Income
- EXPENSE: Tutor Expense, Speaker/Event Expense, Marketing Expense, Food & Beverage Purchases, Cleaning Expense, Utilities, Rent, Software & IT, Accounting & Legal, Office Supplies, Maintenance, Other Expense

Fully specified example rows:
- `fcat_EVENT_REVENUE` | EVENT_REVENUE | Event Revenue | income | operating_revenue | "Revenue generated from paid events, meetups, workshops and classes." | active | 10
- `fcat_SPONSORSHIP` | SPONSORSHIP_REVENUE | Sponsorship Revenue | income | sponsorship | active | 20
- `fcat_TUTOR_EXPENSE` | TUTOR_EXPENSE | Tutor Expense | expense | people | "Tutor and instructor costs directly related to events and clubs." | active | 110

Earlier, more granular core set (sections 8-9), grouped:
- Operating Revenue: Workspace Revenue, Event Revenue, Class Revenue, Meeting Room Revenue, Virtual Office Revenue
- Membership (if paid): Membership Revenue
- Sponsorship: Sponsorship Revenue
- Cafeteria: Cafeteria Sales
- Other: Other Operating Income
- People / Event Delivery: Tutor Expense, Speaker Expense, Event Staff Expense
- Marketing: Advertising Expense, Social Media Expense, Campaign Expense, Printing & Promotion
- Cafeteria: Food & Beverage Purchases, Cafeteria Consumables
- Facilities: Rent, Electricity, Water, Internet, Cleaning, Maintenance
- Technology: Software Subscriptions, IT Equipment, IT Services
- Administrative: Accounting, Legal, Office Supplies, Bank Fees
- Other: Other Operating Expense

Other names mentioned in examples: Food & Beverage Sales, Marketing Expense, Utilities, Software Expense, Electricity, Cleaning Expense, Event Expense, Other Income/Other Expense.

## Superseded / rejected ideas
- Third direction `refund` - rejected.
- `Transfer` category - rejected.
- Separate FINANCIAL_CATEGORY_GROUPS table - not in V1 (controlled value list instead; may become table later for hierarchy/custom reporting/localization/accounting mapping).
- FINANCIAL_CATEGORIES.ID_FinancialCenter - rejected.
- Category on Account - rejected.
- Category on TRANSACTIONS - rejected.
- Category on DOCUMENTS header - rejected.
- Multiple categories per DocumentItem / allocation engine - rejected for V1.
- FINANCIAL_CENTER_CATEGORY_RULES validation table - not now (future if wrong combos become a problem).
- Very granular item-level categories - rejected.
- Tax, discount, freepass, payment method as categories - rejected.
- Revenue/expense totals on category - rejected.

## Open questions
- Which seed list is final: section 34 (~20, e.g. "Utilities", "Software & IT", "Accounting & Legal") vs sections 8-9 (more granular: Electricity, Water, Internet, Software Subscriptions, Accounting, Legal, Bank Fees...). Section 34 is later; category_code and category_group for each seed not specified except the 3 examples.
- Naming drift: "Other Income" vs "Other Operating Income"; "Other Expense" vs "Other Operating Expense"; "Cleaning" vs "Cleaning Expense"; "Speaker/Event Expense" vs "Speaker Expense"/"Event Staff Expense".
- Whether Membership Revenue is seeded (only if membership becomes paid).
- category_group/direction consistency enforcement not explicitly stated.

## Example row
`fcat_EVENT_REVENUE | EVENT_REVENUE | Event Revenue | income | operating_revenue | Revenue generated from paid events, meetups, workshops and classes. | active | 10`
