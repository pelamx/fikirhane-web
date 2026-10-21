# SEATS

## Purpose
One row = one individual bookable seat/sitting position inside a specific SPACE_SETUP, optionally grouped under a TABLE, with its seat-map position. Every seat belongs to a setup; belonging to a table is optional (U-shape / chairs-only setups have no tables -> ID_Table NULL). NOT stored here: event or location links (via EVENT -> EVENT_OPTION -> SPACE_SETUP -> SEAT and SEAT -> SPACE_SETUP -> LOCATION), price (Event + Location/EventOption + Membership, or future pricing rule), user seat preferences (user preference / booking need side), actual seat usage (BOOKINGS.ID_Seat in EventOption context).

## Final fields
Final "nihai sade field set" (section 26):

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Seat | uuid | NOT NULL | gen | PK | Immutable; e.g. `seat_FIK_V1_T01_S01`, `seat_FIK_V1_F01`. |
| ID_SpaceSetup | uuid | NOT NULL | | -> SPACE_SETUPS.ID_SpaceSetup | Mandatory: setup is the seat's real context. |
| ID_Table | uuid | NULL | | -> TABLES.ID_Table | Table the seat belongs to; NULL in table-less setups. If set, table's ID_SpaceSetup must equal seat's. |
| seat_code | text | NOT NULL | | | Technical/operational code: `T01-S01` style or preferred short `F01` (also used on physical label). Unique per setup. |
| seat_name | text | NOT NULL | | | UI name ("Masa 1 — Koltuk 1", "Seat 07", "Window Seat 2"); may differ from code. |
| seat_type | enum | NULL | | | Optional classification; not required in V1 unless it changes booking behaviour. |
| reservable | bool | NOT NULL | | | Open for booking (false e.g. staff seat, ergonomic issue, temporarily unused). |
| position_x | numeric (0.00–1.00) | NULL | | | Normalized X on whole setup canvas (approach A). |
| position_y | numeric (0.00–1.00) | NULL | | | Normalized Y on whole setup canvas. |
| rotation | numeric | NULL | | | Facing direction in degrees (0/90/180/270...), useful for U-shape / around tables. |
| status | enum | NOT NULL | 'active' (implied) | | |
| sort_order | int | NULL | | | UI order. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |

## Enums / allowed values
- seat_type (optional): `standard`, `accessible`, `high_stool`, `window`.
- status: `active` (normal use), `inactive` (not used in this setup), `blocked` (temporarily not bookable), `archived` (old setup/history).
- reservable vs status: status=active + reservable=false = part of setup and active but not user-bookable (e.g. staff seat); status=inactive = out of normal use.

## Constraints & indexes
- PK ID_Seat (immutable).
- UNIQUE (ID_SpaceSetup, seat_code).
- Integrity: if ID_Table NOT NULL then TABLES.ID_SpaceSetup = SEATS.ID_SpaceSetup (composite FK (ID_Table, ID_SpaceSetup) -> TABLES(ID_Table, ID_SpaceSetup) is one way).
- CHECK position_x, position_y in [0.00, 1.00].
- Booking-side: max one active booking per (ID_EventOption, ID_Seat) — partial unique on BOOKINGS where status in (pending_payment, confirmed, checked_in).
- Validation: COUNT(active seats WHERE ID_Table = X) <= TABLES.seat_capacity (or equality, by design).
- Validation (seat-based setup): COUNT(reservable active seats) >= SPACE_SETUPS.capacity.

## Relationships
- SPACE_SETUPS 1 -> N SEATS (mandatory).
- TABLES 1 -> N SEATS (optional).
- SEATS 1 -> N BOOKINGS (BOOKINGS.ID_Seat, when EventOption.booking_unit = seat).

## Business rules / data rules
1. SEAT-D01: Every seat belongs to a valid SPACE_SETUP.
2. SEAT-D02: If ID_Table is set, the table must belong to the same SpaceSetup.
3. SEAT-D03: seat_code unique within a SpaceSetup.
4. SEAT-D04: Seat must not link directly to Event or Location.
5. SEAT-D05: Seat-based booking only if EVENT_OPTION.booking_unit = seat.
6. SEAT-D06: No duplicate active booking for the same EventOption + Seat (one of the most critical rules).
7. SEAT-D07: Inactive/blocked/non-reservable seats cannot be assigned to new bookings.
8. SEAT-D08: Seat-map coordinate system uses the same standard across all setups.
9. SEAT-D09: For serious layout changes, create a new SpaceSetup version instead of modifying existing seats.
10. SEAT-D10: No price stored on seat.
11. Seat-blocking booking statuses: `pending_payment`, `confirmed`, `checked_in`. Non-blocking: `cancelled`, `expired`, `completed`, `no_show`. Waitlist must not pick a seat (no real capacity allocation yet).
12. Premium seat selection: if MEMBERSHIP_TYPES.seat_selection_enabled = true the user picks from seat map (e.g. F07); Member/Visitor get automatic assignment. Either way booking ends with BOOKINGS.ID_Seat.
13. Auto seat assignment (business logic): (1) find EventOption's Setup; (2) take reservable = true seats; (3) exclude those held by active bookings; (4) assign a suitable seat; (5) write BOOKINGS.ID_Seat.
14. Seat change depends on booking change policy: e.g. Premium user may change before Event start - 24h; within 24h seat change locked; Admin may override with special permission.
15. Seats of a setup used by published/booked EventOption: geometry and identities must not change retroactively. Major change -> SpaceSetup V2 + new seat records (V1 F01–F16 -> V2 F01–F14); old bookings stay on V1 seats.
16. Minor UI positioning correction may edit coordinates in place; changes in seat count, table relation, numbering, or serious layout -> new setup version.
17. EventOption capacity 14 with 16 seats (V1 simple): all 16 seats visible, system closes capacity after 14 bookings (14 people may choose among 16 seats) — acceptable.
18. Same short codes should be used on physical labels.
19. Seat size (width/height) generally not needed (fixed-size icons); could be added for a free canvas editor.

## Superseded / rejected ideas
- SEATS.ID_Event — rejected.
- Direct seat-location link — rejected.
- SEATS.price / seat-tier pricing on seat — rejected (use pricing rule if ever "window seat premium").
- Seat width/height — not needed now.
- EVENT_OPTION_SEATS override table (close specific seats per option) — not in V1.
- Seat preferences on seat master — rejected.
- seat_zone / features — future only, not V1.
- Seat coordinates relative to table — rejected (setup-canvas approach A, per TABLES doc).

## Open questions
- Table seat count validation: <= seat_capacity vs equality.
- Whether seat_type is used in V1.
- Exact seat change policy (24h example) belongs to booking change policy.

## Seed data
- Fikirhane Community Workspace: Table 1 -> F01–F04; Table 2 -> F05–F08; Table 3 -> F09–F12; Table 4 -> F13–F16.
- Atolye: seats A01–A12; tables T01 -> A01–A04, T02 -> A05–A08, T03 -> A09–A12 (note: TABLES doc names Atolye tables A01–A03).

## Example row
ID_Seat=seat_FIK_V1_F01, ID_SpaceSetup=setup_FIKIRHANE_COWORK_V1, ID_Table=table_FIK_V1_T01, seat_code=F01, seat_name="Masa 1 — Koltuk 1", seat_type=standard, reservable=true, position_x=0.18, position_y=0.24, rotation=180, status=active, sort_order=10, created_at=updated_at=2026-09-20 10:20, created_by/updated_by=usr_ADMIN.
