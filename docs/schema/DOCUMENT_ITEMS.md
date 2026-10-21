# DOCUMENT_ITEMS

## Purpose
Individual commercial lines of a DOCUMENT: one row = one sold/purchased line with its item/booking link, Financial Center and Financial Category attribution, quantity, price, discount and tax. It is the main source-of-truth layer for Fikirhane's income/expense analysis (DOCUMENTS is just the header; header totals are aggregates of these lines). NOT stored here: currency (inherited from DOCUMENTS.currency_code), stock movement link (STOCK_MOVEMENTS.ID_DocumentItem points here), ID_Event (reachable via Booking), ID_Club (reachable via Financial Center ↔ Club), the reason behind a discount (MembershipType / pricing rule / Booking snapshot), payments (TRANSACTIONS / TRANSACTION_ALLOCATIONS).

## Final fields
(Source: section 50 "nihai sade field set"; types from section 3.)

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_DocumentItem | uuid (doc example `ditem_10001`) | NOT NULL | generated | PK | Immutable |
| ID_Document | uuid | NOT NULL | — | DOCUMENTS.ID_Document | Parent document |
| line_no | int | NOT NULL | — | — | Line order within document (1, 2, 3); unique per document; used for invoice rendering & integration |
| ID_Item | uuid | NULL | — | ITEMS.ID_Item | Standard product/service master link; NULL for free-text lines (e.g. "September building repair", "Emergency plumbing repair") |
| ID_Booking | uuid | NULL | — | BOOKINGS.ID_Booking | Set if line originates from an Event Booking |
| ID_FinancialCenter | uuid | NOT NULL | — | FINANCIAL_CENTERS.ID_FinancialCenter | Business/performance unit of the line (English Club, Cafeteria, General) — mandatory in V1 |
| ID_FinancialCategory | uuid | NOT NULL | — | FINANCIAL_CATEGORIES.ID_FinancialCategory | Income/expense type (Event Revenue, Sponsorship Revenue, Tutor Expense, Food & Beverage Purchases) — mandatory in V1 |
| description | text | NOT NULL | — | — | Line description snapshot at document time (survives item renames) |
| quantity | numeric (decimal) | NOT NULL | — | — | > 0; decimal for e.g. 2.5 kg |
| unit | text | NULL | — | — | Unit snapshot (piece, kg, liter, session, hour, month, year); copied from ITEMS.unit if present |
| unit_price | numeric (decimal) | NOT NULL | — | — | Unit price snapshot (default from ITEMS.default_selling_price; never changed by master changes) |
| gross_amount | numeric (decimal) | NOT NULL | — | — | quantity × unit_price; computable but physically stored as posted snapshot |
| discount_amount | numeric (decimal) | NOT NULL | 0 (implied) | — | Line discount (source of truth for discounts; header is aggregate) |
| net_amount | numeric (decimal) | NOT NULL | — | — | gross_amount − discount_amount (pre-tax) |
| tax_rate | numeric (decimal, percent: 20 = 20%) | NOT NULL | — | — | Historical tax rate (default from ITEMS.default_tax_rate) |
| tax_amount | numeric (decimal) | NOT NULL | — | — | Line tax (net_amount × tax_rate/100) |
| line_total | numeric (decimal) | NOT NULL | — | — | net_amount + tax_amount |
| notes | text | NULL | — | — | Internal note (e.g. "Member 15% discount") |
| created_at | timestamptz | NOT NULL | now() | — | |
| created_by_user_id | uuid | NULL | — | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | — | |
| updated_by_user_id | uuid | NULL | — | USERS.ID_User | |
| ID_Event | uuid | NULL | — | EVENTS.ID_Event | (V2/optional) only for future event-linked lines without a booking (e.g. event sponsorship); NOT in V1 |

## Enums / allowed values
- No enum columns of its own.
- **unit** (snapshot text, mirrors ITEMS.unit): `piece`, `kg`, `liter`, `session`, `hour`, `month` (ITEMS also allows `gram`, `ml`, `pack`, `year`; example uses `year`).
- **tax_rate** typical values: `0`, `10`, `20` (percent).
- Category direction compatibility (via FINANCIAL_CATEGORIES.direction): DOCUMENTS.direction `sale` → category `income`; `purchase` → category `expense`.

## Constraints & indexes
- PK ID_DocumentItem (immutable).
- FK ID_Document NOT NULL -> DOCUMENTS.
- UNIQUE (ID_Document, line_no) (DITEM-D02).
- ID_FinancialCenter NOT NULL; ID_FinancialCategory NOT NULL (exactly one each).
- CHECK quantity > 0 (DITEM-D06) — no negative lines for refunds.
- CHECK gross_amount = quantity × unit_price (DITEM-D07).
- CHECK net_amount = gross_amount − discount_amount (DITEM-D08).
- CHECK line_total = net_amount + tax_amount (DITEM-D09).
- Document-level: a Document cannot be posted with zero DocumentItems; SUM(line_total) = DOCUMENTS.grand_total.
- Business rule (V1 normal behavior): category direction must match document direction (sale→income, purchase→expense) (DITEM-D05).
- Suggested indexes: ID_Document, ID_Booking, ID_Item, ID_FinancialCenter, ID_FinancialCategory.

## Relationships
- DOCUMENTS 1 — N DOCUMENT_ITEMS.
- ITEMS 1 — N DOCUMENT_ITEMS (optional).
- BOOKINGS 1 — N DOCUMENT_ITEMS (optional; normally one line per booking, but several allowed, e.g. Workspace Fee + Equipment Fee + Extra Service). Chain: Booking → Document Item → Document → Payment.
- FINANCIAL_CENTERS 1 — N DOCUMENT_ITEMS (required).
- FINANCIAL_CATEGORIES 1 — N DOCUMENT_ITEMS (required).
- DOCUMENT_ITEMS 1 — N STOCK_MOVEMENTS (STOCK_MOVEMENTS.ID_DocumentItem).
- Event reachable via Booking; Club via FinancialCenter ↔ Club.

## Business rules / data rules
1. DITEM-D01: every DocumentItem linked to a valid Document.
2. DITEM-D02: line_no unique within a Document.
3. DITEM-D03: every DocumentItem has exactly one Financial Center.
4. DITEM-D04: every DocumentItem has exactly one Financial Category.
5. DITEM-D05: sale document lines normally use income categories; purchase document lines use expense categories.
6. DITEM-D06: quantity > 0.
7. DITEM-D07: gross_amount = quantity × unit_price.
8. DITEM-D08: net_amount = gross_amount − discount_amount.
9. DITEM-D09: line_total = net_amount + tax_amount.
10. DITEM-D10: lines of a posted Document cannot be changed by normal edit (locked: quantity, unit_price, discount, tax, center, category, item); corrections via controlled reversal/correction flow.
11. DITEM-D11: Item master changes must not alter past description/unit/price snapshots.
12. DITEM-D12: a line carries a single Financial Center and single Financial Category.
13. DITEM-D13: costs to be split across centers/categories use separate lines (e.g. 10,000 service 60% English Club / 40% AI Club → Line 1 6,000 English Club, Line 2 4,000 AI Club).
14. DITEM-D14: posted DocumentItems are never hard deleted.
15. Draft-document lines can be added, deleted, modified (required by cafeteria open-tab model).
16. A Document must not be posted without at least one DocumentItem.
17. Financial Center/Category are line-level, never on the header (one document can mix e.g. 12,000 English Club Sponsorship, 5,000 AI Workshop, 3,000 Meeting Room).
18. FC default source: Booking → Event → Primary Club → Club Financial Center; or for cafeteria items ITEMS.default_financial_center_id. Actual value snapshotted at line creation.
19. Category default source: ITEMS.default_revenue_category_id for sale, ITEMS.default_expense_category_id for purchase; the line's ID_FinancialCategory is the source of truth.
20. description is always stored even with ID_Item (item rename e.g. Cold Sandwich → Ciabatta Sandwich must not change history).
21. unit copied from ITEMS.unit as snapshot.
22. Discounts kept line-level as the source; DOCUMENTS.discount_amount is aggregate. Membership discount: the applied financial effect is stored in discount_amount; the reason (e.g. 15%) lives in MembershipType / pricing rule / Booking snapshot.
23. Freepass: gross_amount = 500, discount_amount = 500, net_amount = 0, tax_amount = 0, line_total = 0 — preserves the economic value of free service for freepass analytics.
24. Tax is line-level (different rates in same document, e.g. 10% and 20%); header tax_amount is just the total.
25. Refunds: past DocumentItems are not deleted; money refund via TRANSACTIONS (type refund); to reverse the commercial document use credit_note or cancellation/reversal Document. Do not use negative line items haphazardly.
26. Booking price should normally match: BOOKINGS.final_price = DOCUMENT_ITEMS.line_total (e.g. 425); compare gross/net carefully depending on tax-inclusive design — a separate price calculation specification is needed.
27. Stock: a posted purchase line for a stock-tracked item can create STOCK_MOVEMENTS (purchase_receive, +qty); a sale line of a resale stock item creates a negative movement (e.g. water −1). Prepared items (sandwich) get no automatic ingredient deduction (no recipe/BOM).
28. Lines inherit the parent document's currency; no currency field on the line.
29. Item is not mandatory, but frequently recurring products/services should use ID_Item.
30. Most critical core fields: ID_Document, ID_Item, ID_Booking, ID_FinancialCenter, ID_FinancialCategory, quantity, unit_price, discount_amount, tax_amount, line_total.

## Superseded / rejected ideas
- ID_StockMovement on DOCUMENT_ITEMS — rejected (one line may produce many movements; use STOCK_MOVEMENTS.ID_DocumentItem).
- ID_Event on line — not in V1 (optional future for booking-less event lines like sponsorship; description + Club FC suffices).
- ID_Club on line — rejected (FC represents club attribution).
- currency_code on line — rejected (inherit from document).
- Splitting one line across multiple centers/categories (percent allocation) — rejected; use separate lines.
- Header-level discount as source — rejected; line-level is the source.
- Negative line items for refunds — discouraged/rejected.

## Open questions
- Tax-inclusive vs tax-exclusive pricing: how Booking.final_price is compared with gross/net/line_total — needs a separate price calculation specification.
- Whether optional ID_Event will be added for booking-less event lines.
- Category direction rule is "normal V1 behavior" — exceptions not defined.
- Exact credit_note / reversal document flow for commercial reversals.

## Example row
ID_DocumentItem=ditem_10001, ID_Document=doc_10001, line_no=1, ID_Item=item_WORKSPACE_SESSION, ID_Booking=booking_50001, ID_FinancialCenter=fc_COMMUNITY_WORKSPACE, ID_FinancialCategory=fcat_WORKSPACE_REVENUE, description="Working Club — Afternoon Session", quantity=1, unit=session, unit_price=500.00, gross_amount=500.00, discount_amount=75.00, net_amount=425.00, tax_rate=0, tax_amount=0.00, line_total=425.00, notes="Member 15% discount", created_at=2026-09-22 10:42, created_by_user_id=usr_SYSTEM, updated_at=2026-09-22 10:42, updated_by_user_id=usr_SYSTEM.

Other examples: Sponsorship — item Sponsorship Service, FC English Club, category Sponsorship Revenue, "2027 English Club Main Sponsorship", qty 1, unit year, unit_price 150000, line_total 150000, ID_Booking NULL. Cafeteria — Ciabatta Sandwich, FC Cafeteria, Cafeteria Sales, qty 2, piece, 180, line_total 360. Purchase — Coffee Beans, FC Cafeteria, Food & Beverage Purchases, qty 10, kg, 800, line_total 8000.
