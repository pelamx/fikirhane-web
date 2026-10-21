# ITEMS

## Purpose
Master catalog of products and services that Fikirhane sells, purchases, or tracks in stock (e.g. Filter Coffee, Bottled Water, Ciabatta Sandwich, Coffee Beans, Workspace Session, Meeting Room Rental, Sponsorship Service). One row = one product/service definition. It is NOT a transaction table: actual purchase/sale lines live in DOCUMENT_ITEMS (which snapshots price, tax, description, financial center/category), and actual physical stock movements live in STOCK_MOVEMENTS (the stock source of truth). Persons (tutors, suppliers) are not items (they are USERS / ORGANIZATIONS); sponsorship relationships live in CLUB_SPONSORSHIPS; membership entitlements live in USER_MEMBERSHIPS; actual event/booking prices come from EVENTS.base_price / EVENT_OPTIONS.price_adjustment / membership discounts.

## Final fields
(Source: section 46 "nihai sade field set", types from section 3.)

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Item | uuid (doc examples use readable ids like `item_FILTER_COFFEE`, `item_WATER_500ML`) | NOT NULL | generated | PK | Immutable, unique |
| item_code | text | NOT NULL | — | — | Technical fixed code, UNIQUE (e.g. FILTER_COFFEE, BOTTLED_WATER, COFFEE_BEANS, CIABATTA_SANDWICH, WORKSPACE_SESSION, MEETING_ROOM, SPONSORSHIP, WATER_500ML). Stays fixed; not a barcode |
| item_name | text | NOT NULL | — | — | UI display name; may change (code stays fixed) |
| item_type | enum | NOT NULL | — | — | stock_item / nonstock_item / service — how the system processes it |
| item_category | text/enum (controlled value list) | NULL | — | — | Product/service group (see enums). No ITEM_CATEGORIES table in V1 |
| unit | enum/text | NOT NULL | — | — | Base unit of measure (piece, kg, gram, liter, ml, pack, session, hour, month, year) |
| stock_behavior | enum | NULL | — | — | resale / ingredient / consumable / prepared — physical operational role; may be used only for stock-related items (NULL for services) |
| is_sellable | bool | NOT NULL | — | — | Can be sold to customers |
| is_purchasable | bool | NOT NULL | — | — | Can be bought from a supplier |
| is_stock_tracked | bool | NOT NULL | — | — | Tracked in the stock ledger (STOCK_MOVEMENTS). Very important; item_type alone does not express stock behavior clearly enough |
| default_selling_price | numeric (decimal) | NULL | — | — | Master default sale price; actual price snapshotted on DOCUMENT_ITEMS.unit_price. NULL for event/booking-priced services |
| currency_code | text (e.g. char(3)) | NULL | — | — | Default sale currency (e.g. TRY) |
| default_tax_rate | numeric (decimal, percent e.g. 20, 10, 0) | NULL | — | — | Copied to DOCUMENT_ITEMS.tax_rate on line creation; historical rate lives there |
| default_financial_center_id | uuid | NULL | — | FINANCIAL_CENTERS.ID_FinancialCenter | Default FC (e.g. fc_CAFETERIA). Nullable because Club/Event services must take FC from the event's primary Club |
| default_revenue_category_id | uuid | NULL | — | FINANCIAL_CATEGORIES.ID_FinancialCategory | Default income category when sold (e.g. fcat_CAFETERIA_SALES) |
| default_expense_category_id | uuid | NULL | — | FINANCIAL_CATEGORIES.ID_FinancialCategory | Default expense category when purchased (e.g. fcat_FOOD_PURCHASES) |
| current_stock | numeric (decimal) | NULL | — | — | CACHE only of SUM(STOCK_MOVEMENTS.quantity) |
| reorder_level | numeric (decimal) | NULL | — | — | Below this -> replenishment warning |
| target_stock | numeric (decimal) | NULL | — | — | Level to reach after ordering (suggest order ≈ target − current) |
| storage_area | text | NULL | — | — | Free-text physical storage spot (Upper Cabinet, Kitchen Fridge, Back Storage, Cafeteria Cooler); informational, NOT an inventory location |
| status | enum | NOT NULL | 'active' (implied) | — | active / inactive / archived |
| sort_order | int | NULL | — | — | UI order |
| created_at | timestamptz | NOT NULL | now() | — | |
| created_by_user_id | uuid | NULL | — | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | — | |
| updated_by_user_id | uuid | NULL | — | USERS.ID_User | |
| barcode | text | NULL | — | — | (V2/optional) only if physical products need barcodes; not required in V1 |
| default_purchase_price | numeric | NULL | — | — | (V2/optional) useful only if ordering/forecasting is built; actual cost comes from DOCUMENT_ITEMS.unit_price |

## Enums / allowed values
- **item_type**
  - `stock_item` — physical, stock quantity tracked (Bottled Water, Coffee Beans, Tea, Napkin, Cheese)
  - `nonstock_item` — physical and sold, but not stock-tracked at item level (Prepared Sandwich, Croissant Sandwich, Granola Yogurt); no recipe/BOM
  - `service` — not physical stock (Workspace Session, Meeting Room Rental, Event Ticket, Membership Fee, Sponsorship Service, Tutor Service)
- **stock_behavior**
  - `resale` — sold as bought (Bottled Water, Packaged Snack)
  - `ingredient` — raw material used in prepared products (Cheese, Tomato, Salami, Coffee Beans)
  - `consumable` — not sold, consumed internally (Napkin, Cleaning Material, Paper Cup)
  - `prepared` — prepared final product (Sandwich, Croissant Sandwich)
- **unit**: `piece`, `kg`, `gram`, `liter`, `ml`, `pack`, `session`, `hour`, `month`, `year`
- **item_category** (controlled list): `beverage`, `food`, `ingredient`, `consumable`, `workspace_service`, `event_service`, `membership`, `sponsorship`, `administrative`
- **status**
  - `active` — usable in new transactions
  - `inactive` — not used in new transactions; history preserved
  - `archived` — no longer active in catalog

## Constraints & indexes
- PK ID_Item (immutable).
- UNIQUE(item_code).
- item_type NOT NULL and must be a valid enum value.
- CHECK: item_type = 'service' => is_stock_tracked = false (ITEM-D04).
- CHECK: is_stock_tracked = true => unit NOT NULL / valid (ITEM-D05; unit is required anyway).
- stock_behavior intended only for stock-related items (NULL for services) — soft rule.

## Relationships
- ITEMS 1 — N DOCUMENT_ITEMS (line references item; snapshot of description/price/tax/FC/category).
- ITEMS 1 — N STOCK_MOVEMENTS.
- ITEMS N — 1 FINANCIAL_CENTERS (default_financial_center_id, optional).
- ITEMS N — 1 FINANCIAL_CATEGORIES (default_revenue_category_id, optional); N — 1 FINANCIAL_CATEGORIES (default_expense_category_id, optional).
- ITEMS N — 1 USERS (created_by / updated_by).
- No direct link to suppliers (future ITEM_SUPPLIERS junction).

## Business rules / data rules
1. ITEM-D01: ID_Item unique and immutable.
2. ITEM-D02: item_code unique.
3. ITEM-D03: every item carries a valid item_type.
4. ITEM-D04: service items must have is_stock_tracked = false.
5. ITEM-D05: stock-tracked items must have a valid unit.
6. ITEM-D06: item master price must never change historical DocumentItem prices (price snapshot on DOCUMENT_ITEMS.unit_price).
7. ITEM-D07: item default Financial Center/Category values are only used as defaults when creating new DocumentItems; historical attribution snapshotted on DOCUMENT_ITEMS.ID_FinancialCenter / ID_FinancialCategory.
8. ITEM-D08: stock source of truth is STOCK_MOVEMENTS (theoretical stock = SUM(STOCK_MOVEMENTS.quantity)).
9. ITEM-D09: current_stock, if present, is a cache only.
10. ITEM-D10: archived items must not be removed from historical DocumentItems and StockMovements.
11. No hard delete of items; use status inactive/archived.
12. Stock movement insert and current_stock update must happen in the same DB transaction.
13. Renaming an item does not affect past documents (DOCUMENT_ITEMS.description snapshot keeps old name, e.g. "Cold Sandwich" -> "Ciabatta Sandwich").
14. Changing default price / default categories does not affect past records.
15. Default tax rate is copied into DOCUMENT_ITEMS.tax_rate when a line is created.
16. Event/booking service prices are NOT kept here: computed from EVENTS.base_price + EVENT_OPTIONS.price_adjustment + membership discount; default_selling_price may be NULL for such services; Booking DocumentItems can reference the service item (e.g. WORKSPACE_SESSION).
17. Club/Event services: FC comes from the Event's primary Club, so default_financial_center_id should usually be NULL for them (e.g. Event Ticket).
18. Revenue and expense categories are separate fields because the same item can be bought and sold (water: purchase = Food & Beverage Purchases, sale = Cafeteria Sales).
19. V1 has a single stock location (all of Fikirhane); storage_area is informational only.
20. No recipe/BOM in V1: selling a sandwich does not auto-deduct ingredients. Ingredient/consumable stock is managed via purchase movements, periodic stock counts, and waste/adjustment movements (e.g. coffee beans +10 kg on purchase, then periodic count adjustment rather than per-espresso deductions; napkins via periodic count).
21. Resale stock items (water): a sale DocumentItem can automatically create STOCK_MOVEMENT quantity = -1.
22. reorder_level triggers replenishment warning when current stock below it; target_stock used for order suggestion (e.g. reorder 12, target 48, current 8 -> order ≈ 40).
23. A tutor service item is the purchased service type, not the tutor person (tutor = USERS/ORGANIZATIONS).
24. Sponsorship Service item is only for financial line classification; actual sponsor relationship is CLUB_SPONSORSHIPS.
25. Membership Fee item (if paid membership) is distinct from entitlement (USER_MEMBERSHIPS).
26. Apart from current_stock, no quantity movement data stored on ITEMS.

## Superseded / rejected ideas
- Separate ITEM_CATEGORIES table — not in V1 (controlled list instead; may become master table later).
- WAREHOUSES / STOCK_LOCATIONS / STOCK_TRANSFERS tables — rejected for V1 (single stock location).
- Recipe/BOM auto-deduction — not in V1.
- Supplier FK on item — rejected for V1 (same item from multiple suppliers; future ITEM_SUPPLIERS junction; supplier visible on purchase Document).
- Average cost / weighted average / FIFO costing field on item — not in V1 (STOCK_MOVEMENTS.unit_cost suffices).
- Single financial category field — rejected (need separate revenue & expense).
- Storing event/booking service prices on items — rejected.
- barcode, default_purchase_price — optional/deferred, not in final set.

## Open questions
- Whether stock_behavior should be restricted to stock-related items only (doc keeps it, says it "can" be limited).
- Exact type of item_category (text vs enum) and unit (enum vs text) left as "Text/Enum".
- Whether default_purchase_price is added later (depends on ordering/forecasting).
- Future inventory valuation approach.

## Example row
Bottled Water: ID_Item=item_WATER_500ML, item_code=WATER_500ML, item_name="Bottled Water 500 ml", item_type=stock_item, item_category=beverage, unit=piece, stock_behavior=resale, is_sellable=true, is_purchasable=true, is_stock_tracked=true, default_selling_price=40.00, currency_code=TRY, default_tax_rate=10, default_financial_center_id=fc_CAFETERIA, default_revenue_category_id=fcat_CAFETERIA_SALES, default_expense_category_id=fcat_FOOD_PURCHASES, current_stock=36, reorder_level=12, target_stock=48, storage_area="Cafeteria Cooler", status=active.

Other examples: COFFEE_BEANS "Filter Coffee Beans" stock_item/ingredient/kg, sellable=false, purchasable=true, tracked=true, FC fc_CAFETERIA, expense fcat_FOOD_PURCHASES, reorder 2, target 8. WORKSPACE_SESSION "Community Workspace Session" service/workspace_service/session, stock_behavior NULL, sellable=true, purchasable=false, tracked=false, price NULL, FC NULL, revenue fcat_WORKSPACE_REVENUE, active.

## Seed data
Illustrative items named in the doc (not an authoritative seed list): Filter Coffee, Bottled Water (500 ml), Ciabatta Sandwich, Coffee Beans / Filter Coffee Beans, Workspace Session / Community Workspace Session, Meeting Room Rental, Sponsorship Service, Napkin, Prepared Sandwich, Croissant Sandwich, Granola Yogurt, Tea, Cheese, Tomato, Salami, Packaged Snack, Cleaning Material, Paper Cup, Milk, Event Ticket, Membership Fee, Tutor Service.
Codes named: FILTER_COFFEE, BOTTLED_WATER, COFFEE_BEANS, CIABATTA_SANDWICH, WORKSPACE_SESSION, MEETING_ROOM, SPONSORSHIP, WATER_500ML.
Category references used in examples: Cafeteria Sales (fcat_CAFETERIA_SALES), Meeting Room Revenue, Sponsorship Revenue, Food & Beverage Purchases (fcat_FOOD_PURCHASES), Cafeteria Consumables, Workspace Revenue (fcat_WORKSPACE_REVENUE), Tutor Expense; FC Cafeteria (fc_CAFETERIA).
