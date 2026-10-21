# STOCK_MOVEMENTS

## Purpose
Immutable stock ledger: one row = one physical increase or decrease of a stock-tracked Item's quantity, recorded as a signed quantity (purchase receipts, sales, waste, consumption, stock-count variances, returns, opening balance). It is the stock source of truth; ITEMS.current_stock is only a cache of it. NOT stored here: financial center / financial category (derived via the linked DOCUMENT_ITEMS row), storage location / from-to warehouse (single stock location; ITEMS.storage_area is informational), booking/seat capacity (EVENT_OPTIONS / BOOKINGS), and "who changed what" (AUDIT_LOG).

## Final fields
(Source: section 47 "nihai sade field set"; types from section 3.)

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_StockMovement | uuid (doc example `smov_10001`) | NOT NULL | generated | PK | Immutable ledger identity |
| ID_Item | uuid | NOT NULL | — | ITEMS.ID_Item | Must be a stock-tracked item (ITEMS.is_stock_tracked = true) |
| movement_at | timestamptz | NOT NULL | — | — | When the movement actually happened stock-wise; may differ from created_at (e.g. yesterday's count entered today) |
| movement_type | enum | NOT NULL | — | — | Reason/kind of movement (see enums) |
| quantity | numeric (decimal, e.g. 10.000 → numeric(?,3)) | NOT NULL | — | — | SIGNED: + = stock increases, − = decreases; != 0 |
| unit_cost | numeric (decimal) | NULL | — | — | Approximate unit cost at time of movement (e.g. 800 TRY/kg); useful for purchase, waste valuation, variance valuation. Implicitly TRY |
| ID_DocumentItem | uuid | NULL | — | DOCUMENT_ITEMS.ID_DocumentItem | Set when movement originates from a purchase/sale document line |
| ID_StockCountItem | uuid | NULL | — | STOCK_COUNT_ITEMS.ID_StockCountItem | Set when movement originates from a posted stock-count variance |
| reason_code | enum/text | NULL | — | — | Adjustment/waste reason (see enums); important for waste and manual_adjustment |
| notes | text | NULL | — | — | Human-readable explanation; complements, never replaces, reason_code |
| reversed_movement_id | uuid | NULL | — | STOCK_MOVEMENTS.ID_StockMovement (self) | Set on a correction movement: which earlier movement this one reverses |
| created_at | timestamptz | NOT NULL | now() | — | |
| created_by_user_id | uuid | NULL | — | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | — | (V2/optional) keep only if the global audit standard requires it; rows should never be updated |
| updated_by_user_id | uuid | NULL | — | USERS.ID_User | (V2/optional) same as updated_at |
| reference_type | enum/text | NULL | — | — | (V2/optional) generic other-source type (e.g. `booking`, `operational_use`); only for exceptions/future integration — don't add until a real need appears |
| reference_id | uuid/text | NULL | — | — (polymorphic) | (V2/optional) id of the generic source record |
| currency_code | text | NULL | — | — | (V2/optional) only if multi-currency purchases appear; V1 assumes all stock in TRY |
| status | enum (active / reversed) | NOT NULL | 'active' | — | (V2/optional / superseded) listed in first draft; final set drops it in favor of reversal movements + reversed_movement_id |

## Enums / allowed values
- **movement_type** (with required sign)
  - `purchase_receive` — stock arrived from supplier; quantity > 0 (e.g. +10)
  - `sale` — item sold directly from stock; quantity < 0 (e.g. water −1)
  - `consumption` — consumed internally; quantity < 0 (Napkin −20, Cleaning liquid −0.5 liter)
  - `waste` — spoilage/loss; quantity < 0 (Yogurt −3, reason expired)
  - `count_adjustment` — difference between system and physical count from a Stock Count; ± (System 10 kg, Counted 8.5 kg → −1.5 kg)
  - `manual_adjustment` — controlled correction outside a count (e.g. data entry error); ±; requires special permission
  - `return_in` — returned to stock from customer/operation; quantity > 0
  - `return_out` — sent back to supplier; quantity < 0
  - `opening_balance` — initial stock load at system setup; quantity > 0 (Water +48); used once
  - (future only: `transfer` — not in V1, single location)
- **reason_code**: `expired`, `damaged`, `spillage`, `staff_use`, `count_variance`, `data_correction`, `theft_loss`, `other`
- **status** (optional/superseded): `active`, `reversed`

## Constraints & indexes
- PK ID_StockMovement.
- FK ID_Item NOT NULL -> ITEMS; item must have is_stock_tracked = true (SMOV-D01; app/trigger-level).
- CHECK quantity <> 0 (SMOV-D02).
- CHECK sign by type (backend validation, SMOV-D03/D04/D05): purchase_receive, return_in, opening_balance > 0; sale, consumption, waste, return_out < 0; count_adjustment, manual_adjustment either sign.
- reversed_movement_id self-FK.
- Suggested indexes: (ID_Item, movement_at), (ID_DocumentItem), (ID_StockCountItem), (reversed_movement_id).
- Negative resulting stock: blocked in normal operation as a business rule (not a DB constraint); admin may override with permission `stock.override_negative`.

## Relationships
- ITEMS 1 — N STOCK_MOVEMENTS.
- DOCUMENT_ITEMS 1 — N STOCK_MOVEMENTS (direction chosen deliberately; one line can produce multiple movements, e.g. purchase 100 received as +60 and +40). No DOCUMENT_ITEMS.ID_StockMovement.
- STOCK_COUNT_ITEMS 1 — N STOCK_MOVEMENTS.
- STOCK_MOVEMENTS 1 — 0..N STOCK_MOVEMENTS via reversed_movement_id (reversal links).
- USERS 1 — N STOCK_MOVEMENTS (created_by).

## Business rules / data rules
1. SMOV-D01: every movement must be linked to a valid, stock-tracked Item.
2. SMOV-D02: quantity != 0.
3. SMOV-D03: quantity sign must match movement_type.
4. SMOV-D04: purchase receipt and return-in positive; sale, waste, consumption and return-out negative (opening_balance also positive).
5. SMOV-D05: count/manual adjustments may be positive or negative.
6. SMOV-D06: movements must not be changed by normal edit or hard delete.
7. SMOV-D07: erroneous movements are corrected via reversal/correction movements.
8. SMOV-D08: a stock-tracked purchase/sale DocumentItem must produce a StockMovement when in the appropriate state.
9. SMOV-D09: posting a Stock Count must produce StockMovements equal to the variance.
10. SMOV-D10: ITEMS.current_stock, if present, is only a cache; the ledger stays the source of truth (must be reconcilable with ledger sum).
11. SMOV-D11: Financial Center and Financial Category must NOT be stored on StockMovement; financial attribution is found via DocumentItem. For manual adjustments needing a center, derive from item default/operation.
12. Current stock = SUM(STOCK_MOVEMENTS.quantity) (section 26 says "active" movements; with the reversal model, all movements are summed). Example: Opening +48, Sale −3, Purchase +24, Waste −2 → 67.
13. Movement + ITEMS.current_stock cache update in the same DB transaction (from ITEMS doc).
14. No draft concept for movements: once written to the ledger it is a real movement. Critical fields (Item, quantity, type, date) are never edited normally.
15. Hard delete is strictly forbidden; even wrong movements remain.
16. Preferred correction: create counter movement. E.g. wrong +10 that should be +8: either a −2 correction, or (preferred for production) Movement A +10, Movement B −10 with reversed_movement_id = A, then new +8.
17. Stock is affected only when the commercial transaction is final: generate sale movements when DOCUMENTS.status = posted. Draft documents (e.g. draft cafeteria tab) create no movements.
18. V1 assumption: posting a purchase of a stock-tracked Item = stock received (purchase_receive with unit_cost = purchase unit price). Future ordered/invoiced/received split would separate purchasing from receiving.
19. Resale item sale (water x2, posted) automatically creates movement_type=sale, quantity=−2, ID_DocumentItem set.
20. Prepared product sales (sandwich) create NO stock movement; no recipe/BOM in V1; ingredient consumption appears through periodic count differences.
21. Consumables (paper cups) are not moved per use: purchase +500, later count 320 → count_adjustment −180.
22. Stock counts (STOCK_COUNTS / STOCK_COUNT_ITEMS) never change stock directly: count records the finding; "Post Count" creates count_adjustment movements with ID_StockCountItem (Count = detection; Movement = ledger effect). E.g. System 40, Counted 37 → variance −3 → movement −3 → new stock 37.
23. Bookings/reservations are not stock movements; workspace seats are not inventory.
24. Movements only for physical goods with ITEMS.is_stock_tracked = true.
25. manual_adjustment requires a special permission.
26. Negative stock: normally disallowed (e.g. stock 0, sale −1); exception allowed with `stock.override_negative`; implemented as business rule rather than DB constraint (count delays happen in café ops).
27. opening_balance used once, at initial system setup.
28. reason_code enables shrinkage/waste analysis (e.g. monthly waste report by item).
29. Prefer real FKs (ID_DocumentItem, ID_StockCountItem) over generic reference_type/reference_id.
30. AUDIT_LOG records who created/changed/reversed a movement; it is not the source of truth of stock quantity.
31. No transfer movements and no from/to location per movement in V1 (single stock location); model extends when a second physical store appears.

## Superseded / rejected ideas
- status lifecycle (active / reversed) — first draft; final set drops it in favor of reversal movements linked by reversed_movement_id.
- Editing/deleting wrong movements — rejected.
- Draft stock movements — rejected.
- DOCUMENT_ITEMS.ID_StockMovement (FK in other direction) — rejected as too restrictive.
- ID_FinancialCenter / ID_FinancialCategory on movements — rejected (SMOV-D11).
- storage_area / from-to warehouse per movement, `transfer` type, STOCK_LOCATIONS / STOCK_TRANSFERS — not in V1.
- Recipe/BOM auto-deduction of ingredients on prepared-product sale — rejected for V1.
- FIFO / weighted-average costing — not in V1.
- Generic reference_type/reference_id as primary linking — rejected (optional only, omit until needed).
- Separate currency_code on movement — omitted while all stock is TRY.
- updated_at/updated_by — not critical for a ledger; optional for audit-standard consistency.

## Open questions
- Keep updated_at/updated_by for global audit-standard consistency or omit.
- Whether reference_type/reference_id will ever be needed.
- Future purchase ordered/invoiced/received split (receiving separated from purchase document).
- Multi-currency unit_cost (currency_code) if multi-currency purchases arise.
- Future multi-location (transfer type, from/to location).
- Exact negative-stock enforcement mechanism (business rule with override permission; not a DB constraint).

## Example row
Purchase: ID_StockMovement=smov_10001, ID_Item=item_COFFEE_BEANS, movement_at=2026-09-22 10:30, movement_type=purchase_receive, quantity=10.000, unit_cost=800.00, ID_DocumentItem=ditem_PURCHASE_001, ID_StockCountItem=NULL, reference_type=NULL, reference_id=NULL, reason_code=NULL, notes="Coffee beans received from supplier.", reversed_movement_id=NULL, status=active, created_at=2026-09-22 10:30, created_by_user_id=usr_KITCHEN.

Water sale: ID_Item=item_WATER_500ML, movement_type=sale, quantity=−2, ID_DocumentItem=ditem_CAFE_5001.
Count adjustment: ID_Item=item_WATER_500ML, movement_type=count_adjustment, quantity=−3, ID_StockCountItem=scitem_1001, reason_code=count_variance.
Waste: ID_Item=Yogurt, movement_type=waste, quantity=−4, reason_code=expired.
