# MEMBERSHIP_TYPES

## Purpose
MEMBERSHIP_TYPES is the master list of Fikirhane's commercial membership packages (V1: Member, Premium) and their DEFAULT entitlements (discount rate, reservation window, max active bookings, booking priority, seat selection, priority booking). One row = one package definition. It does NOT store which user holds which package or dates (that is USER_MEMBERSHIPS — the doc calls it "MEMBERSHIPS"), event-specific prices (computed as Event Base Price + Location Adjustment − Membership Discount), event/location price exceptions (PRICING_RULES), system permissions (ROLES), or club roles. "Visitor" is NOT a membership type: it is the derived state of a user with no active membership.

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_MembershipType | uuid | NOT NULL | gen uuid | PK | Immutable PK. Example `mtype_001` / `mtype_MEMBER`. Referenced by USER_MEMBERSHIPS, MEMBERSHIP_APPLICATIONS, PRICING_RULES. |
| membership_type_code | text | NOT NULL | – | – | Stable technical code (`MEMBER`, `PREMIUM`). UNIQUE; should stay fixed even if UI name changes. |
| membership_type_name | text | NOT NULL | – | – | Display name (e.g. "Member", "Premium Member"); may change with branding. |
| description | text | NULL | – | – | What the package offers. |
| discount_rate | numeric(5,2) | NOT NULL | – | – | Default price discount, stored as percentage number: `15.00` = 15%. Pricing Rules override per event/location. |
| reservation_window_days | int | NOT NULL | – | – | How many days ahead the user may book. |
| max_active_bookings | int | NOT NULL | – | – | Max simultaneous active bookings (existing model rule: 2). |
| booking_priority | int | NOT NULL | – | – | Numeric booking priority; higher = higher priority. Only meaningful if waitlist/priority allocation is used; may be removed in V1 if not. |
| seat_selection_enabled | bool | NOT NULL | false | – | Whether this type may choose seats. |
| priority_booking_enabled | bool | NOT NULL | false | – | Priority/early booking access. |
| status | enum | NOT NULL | `active` | – | active / inactive / archived. |
| sort_order | int | NULL | – | – | UI ordering. |
| created_at | timestamptz | NOT NULL | now() | – | Creation time. |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Creator. |
| updated_at | timestamptz | NOT NULL | now() | – | Last change. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifier. |
| priority_booking_hours | int | NULL | – | – | (V2/optional) Time-based priority access (e.g. Premium 24 hours early) instead of/in addition to the boolean. Boolean is enough for now. |
| default_duration_days / default_duration_months | int | NULL | – | – | (V2/optional) Standard package duration; not required because duration is on each membership record (start_date/end_date). |
| membership_fee, billing_period | numeric / text | NULL | – | – | (V2/optional) Only if membership itself becomes a paid product; author advises against turning this into a price list — membership sales should go through DOCUMENTS / DOCUMENT_ITEMS. |

## Enums / allowed values
- **status**
  - `active` – may be used to create new memberships.
  - `inactive` – no new memberships granted; existing memberships kept historically.
  - `archived` – no longer used.
- **membership_type_code**: `MEMBER`, `PREMIUM` (no `VISITOR`).

## Constraints & indexes
- PK: ID_MembershipType (immutable).
- UNIQUE(membership_type_code).
- CHECK status IN ('active','inactive','archived').
- CHECK discount_rate between 0 and 100 (implied by percentage convention).
- CHECK membership_type_code <> 'VISITOR' (MTYPE-D03, implied).
- No hard delete.

## Relationships
- MEMBERSHIP_TYPES 1 — N USER_MEMBERSHIPS (doc text: "MEMBERSHIPS.ID_MembershipType").
- MEMBERSHIP_TYPES 1 — N MEMBERSHIP_APPLICATIONS.
- MEMBERSHIP_TYPES 1 — N PRICING_RULES (PRICING_RULES.ID_MembershipType nullable).
- Independent of ROLES / USER_ROLES and club roles (a user can be Premium + club_lead in AI Club + member in English Club).

## Business rules / data rules
1. MTYPE-D01: ID_MembershipType unique and immutable.
2. MTYPE-D02: membership_type_code unique.
3. MTYPE-D03: Visitor must not be defined as a Membership Type (Visitor = User + no active membership; derived state).
4. MTYPE-D04: Membership Type must not be used as a global system Role (it grants commercial/reservation rights like 20% discount, seat selection, priority booking — not permissions like event.edit, stock.adjust, user.suspend).
5. MTYPE-D05: No event-specific price stored here (e.g. "Member price = 425" is wrong).
6. MTYPE-D06: Default membership discounts and rights may be stored here.
7. MTYPE-D07: Event/Location-based price exceptions are managed via PRICING_RULES.
8. MTYPE-D08: Inactive/archived types cannot be used to create new memberships.
9. MTYPE-D09: Past Booking/Document prices are not affected by membership type changes (prices snapshotted on DOCUMENT_ITEM.unit_price).
10. Pricing design decision = Option A: discount_rate on MEMBERSHIP_TYPES is the default; PRICING_RULES only hold exceptions that override (e.g. Member default 15%, special event Member = 10%).
11. Price formula: Event Base Price + Location Adjustment − Membership Discount. Example: 500 base, −50 location -> 450; Member 15% -> 382.50.
12. Changing a type's rights (e.g. Member discount 15% -> 10%) applies live to future calculations for all current holders; no per-membership entitlement snapshot in V1 (would be needed only for contract-fixed rights).
13. Hard delete forbidden; use inactive/archived.
14. Reservation rights for a user are read via USER_MEMBERSHIPS -> MEMBERSHIP_TYPES (reservation_window_days, max_active_bookings, seat_selection_enabled, priority_booking_enabled).

## Superseded / rejected ideas
- Option B (no discount_rate here; all pricing in PRICING_RULES) — rejected in favor of Option A.
- VISITOR row in MEMBERSHIP_TYPES — rejected.
- Event-specific price column (e.g. member price) — rejected.
- Turning membership types into a commercial price list (membership_fee/billing_period) — not now.
- default_duration on the type — not required.
- Entitlement snapshot per membership — not in V1.

## Open questions
- Final Premium reservation rights: seed table says window "7 or more" and active bookings "2 or more" — to be finalized by business rule (examples elsewhere: Premium window 14, max bookings 4; example row uses 7 and 2).
- Whether booking_priority stays in V1 (only if waitlist/priority allocation exists).
- Boolean priority_booking_enabled vs priority_booking_hours.
- Whether memberships will ever be sold (fee/billing period).

## Seed data
| membership_type_code | membership_type_name | description | discount_rate | reservation_window_days | max_active_bookings | booking_priority | seat_selection_enabled | priority_booking_enabled | status | sort_order |
|---|---|---|---|---|---|---|---|---|---|---|
| MEMBER (ID `mtype_MEMBER`) | Member | Fikirhane standart üyelik paketi. | 15.00 | 7 | 2 | 10 | false | false | active | 10 |
| PREMIUM (ID `mtype_PREMIUM`) | Premium Member | Fikirhane'nin gelişmiş rezervasyon ve fiyat avantajları sunan üyelik paketi. | 20.00 | 7 (seed table: "7 or more") | 2 (seed table: "2 or more") | 20 | true | true | active | 20 |

## Example row
See seed data (Member row).
