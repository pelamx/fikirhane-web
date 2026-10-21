# TABLES

## Purpose
One row = one physical/map table object inside a specific SPACE_SETUP (e.g. Fikirhane Community Workspace Setup -> T01..T04), with its map geometry and whether it can be booked as a whole. It groups seats, draws the table boundary on the seat map and supports "who is at Table 3?" queries. Tables belong to a SETUP, not directly to a LOCATION (layout changes per setup; a U-Shape setup may have 0 tables and 16 seats) and not to an EVENT. NOT stored here: booking IDs (-> BOOKINGS.ID_Table), event IDs (chain BOOKING -> EVENT_OPTION -> SPACE_SETUP -> TABLE), physical cm dimensions (not needed now), temporary operational unavailability long-term (future RESOURCE_BLOCKS).

## Final fields
Final "nihai sade field set" (section 22):

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Table | uuid | NOT NULL | gen | PK | Immutable; e.g. `table_FIK_COWORK_V1_T01`, `table_FIK_V1_T01`. |
| ID_SpaceSetup | uuid | NOT NULL | | -> SPACE_SETUPS.ID_SpaceSetup | Owning setup. |
| table_code | text | NOT NULL | | | Technical code (T01..T04, A01..A03; physical labels like F1..F4 can be same code shown in app). Unique per setup, not globally. |
| table_name | text | NOT NULL | | | UI name ("Masa 1", "Manzara Masasi", "Workshop Table A"). |
| seat_capacity | int | NULL | | | Physical/default seats at table (e.g. 4); validation field — SEATS records are source of truth (COUNT(SEATS WHERE ID_Table = X)). Kept for FileMaker prototype/admin convenience. |
| reservable | bool | NOT NULL | | | Can the whole table be booked. Normal cowork (booking_unit=seat) -> false. |
| position_x | numeric (0.00–1.00) | NULL | | | Normalized X on setup canvas. |
| position_y | numeric (0.00–1.00) | NULL | | | Normalized Y on setup canvas. |
| width | numeric (0.00–1.00) | NULL | | | Normalized width on map (not cm). |
| height | numeric (0.00–1.00) | NULL | | | Normalized height on map (not cm). |
| rotation | numeric | NULL | (0) | | Degrees (0/90/180/270 or any decimal angle). |
| shape | enum | NULL | | | Geometry; useful for programmatic map drawing, not needed with background image. |
| status | enum | NOT NULL | 'active' (implied) | | |
| sort_order | int | NULL | | | UI order. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |

## Enums / allowed values
- shape: `rectangle`, `round`, `oval`, `square`, `custom` (Fikirhane cowork tables likely `rectangle`).
- status: `active` (normal use), `inactive` (exists in setup but not currently used), `blocked` (e.g. physical table temporarily unusable), `archived` (old setup/history). With proper setup versioning, active/inactive usually suffice.

## Constraints & indexes
- PK ID_Table (immutable).
- UNIQUE (ID_SpaceSetup, table_code).
- CHECK position_x, position_y, width, height in [0.00, 1.00] (normalized).
- Validation: seat_capacity >= active/reservable seat count for the table (or exact equality, design-dependent).
- Booking-side: max one active booking per (ID_EventOption, ID_Table) when booking_unit = table (partial unique on BOOKINGS).

## Relationships
- SPACE_SETUPS 1 -> N TABLES.
- TABLES 1 -> N SEATS (SEATS.ID_Table nullable: seats need not have a table).
- TABLES 1 -> N BOOKINGS (BOOKINGS.ID_Table, only when EventOption.booking_unit = table).
- Hierarchy: LOCATIONS 1-N SPACE_SETUPS 1-N TABLES 1-N SEATS.

## Business rules / data rules
1. TABLE-D01: Every table belongs to a valid SpaceSetup.
2. TABLE-D02: table_code unique within a setup.
3. TABLE-D03: Table must not link directly to Location.
4. TABLE-D04: Table must not link directly to Event.
5. TABLE-D05: Table-based booking only when EventOption.booking_unit = table.
6. TABLE-D06: In seat-based EventOptions a table may be used as seat grouping/layout entity but is not a booking unit.
7. TABLE-D07: Use a single, documented coordinate system for map coordinates.
8. TABLE-D08: When a setup's critical geometry is versioned, its tables are created anew under the new setup version (old tables stay on V1, preserving past bookings/seat maps; e.g. Cowork V1 T01–T04 -> V2 T01–T03).
9. TABLE-D09: Archived/inactive tables cannot be selected for new bookings.
10. TABLE-D10: No duplicate active booking for the same EventOption + Table in table-based booking.
11. Coordinates are normalized 0.00–1.00 (not absolute pixels) so the map scales at 400/800/1200px. Must choose and document ONE anchor convention: x/y = object's center point OR x/y = top-left; never mix.
12. Seat coordinates use approach A — relative to the whole setup canvas (not relative to table); ID_Table is only logical grouping. Reasons: simpler, supports table-less seats, chairs-only setups work the same, easier drag/drop editor.
13. Do not mix table and seat booking within the same EventOption in V1.
14. Seat booking does not require table reservable: table reservable=false with reservable seats beneath is the normal cowork model.
15. Temporary breakage via status=blocked acceptable in V1, though operational availability in master data is not ideal; future RESOURCE_BLOCKS.
16. Physical table label (F1..F4) can match app code to ease check-in and wayfinding.

## Superseded / rejected ideas
- TABLES.ID_Location (linking tables directly to location) — rejected.
- TABLES.ID_Event — rejected.
- Booking ID stored on TABLES — rejected (BOOKINGS.ID_Table instead).
- Seat coordinates relative to table (relative_x/relative_y, approach B) — rejected.
- Mixed table+seat booking in one option — rejected for V1.
- physical_width_cm / physical_depth_cm — unnecessary now.
- RESOURCE_BLOCKS — future only, avoid overengineering now.
- Globally unique table_code — rejected.

## Open questions
- Anchor convention for x/y (center vs top-left) not yet chosen — must be decided and documented.
- seat_capacity validation: >= vs exact equality.
- Whether `blocked`/`archived` statuses are needed given setup versioning.

## Seed data
- Fikirhane "Community Workspace — 4 Tables" (capacity 16): T01, T02, T03, T04, each seat_capacity = 4 (16 seats).
- Atolye "Focus Workspace" (capacity 12): A01, A02, A03, each 4 seats (12).

## Example row
ID_Table=table_FIK_V1_T01, ID_SpaceSetup=setup_FIKIRHANE_COWORK_V1, table_code=T01, table_name="Masa 1", seat_capacity=4, reservable=false, position_x=0.25, position_y=0.30, width=0.28, height=0.16, rotation=0, shape=rectangle, status=active, sort_order=10, created_at=updated_at=2026-09-20 10:15, created_by/updated_by=usr_ADMIN.
