# SPACE_SETUPS

## Purpose
One row = one physical seating/table layout (and version) of a LOCATION (e.g. Fikirhane: 4 Tables x 4 Chairs, U-Shape, Chairs Only, Networking/Standing). It is master data holding the setup's capacity, seat map and version. LOCATION = where? SPACE_SETUP = how arranged? EVENT_OPTION = which Location + Setup + capacity for a specific event. NOT stored here: which event uses it / schedule (-> EVENTS + EVENT_OPTIONS), real booking capacity and authoritative booking_unit (-> EVENT_OPTIONS), pricing (-> EVENT / EVENT_OPTION / PRICING_RULES / MEMBERSHIP), event type. Tables and seats are children (TABLES / SEATS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_SpaceSetup | uuid | NOT NULL | gen | PK | Immutable; e.g. `setup_FIKIRHANE_4X4_V1`, `setup_FIKIRHANE_COWORK_V1`. |
| ID_Location | uuid | NOT NULL | | -> LOCATIONS.ID_Location | Parent physical area. |
| setup_code | text | NOT NULL | | | Fixed technical code, UNIQUE system-wide; e.g. `FIKIRHANE_COWORK_4X4`, `FIKIRHANE_USHAPE`, `ATOLYE_3X4`, `ATOLYE_CLASSROOM`, `FIKIRHANE_COWORK_V1`. |
| setup_name | text | NOT NULL | | | UI/admin name ("Community Workspace — 4 Tables", "U-Shape — 16 Chairs", "Workshop — 3 Tables"). |
| setup_type | enum | NULL | | | Layout type; optional but useful for filtering/selection. |
| description | text | NULL | | | e.g. "4 tables with 4 chairs each." |
| capacity | int | NOT NULL | | | Max usable capacity of this layout; > 0; <= LOCATIONS.max_capacity. |
| default_booking_unit | enum | NULL | | | Default suggestion only (seat/table/location); EVENT_OPTIONS.booking_unit snapshots/overrides it. |
| map_image | text (file ref/URL) | NULL | | | Background plan for seat/table map (airline-style seat selection). Prefer SVG / responsive vector; PNG/JPG ok for prototype. e.g. `fikirhane_cowork_v1.svg`. |
| map_aspect_ratio | numeric(6,2) or text (doc: Decimal/Text) | NULL | | | e.g. `1.60` or `16:10`; keeps coordinates stable on mobile/web. |
| version_no | int | NOT NULL | 1 | | Setup version; major geometry change -> new setup record with incremented version. |
| status | enum | NOT NULL | 'draft' (implied) | | |
| sort_order | int | NULL | | | UI ordering. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |

## Enums / allowed values
- setup_type (controlled enum example): `cowork`, `classroom`, `u_shape`, `boardroom`, `chairs_only`, `standing`, `custom`.
- default_booking_unit: `seat`, `table`, `location` (e.g. Cowork Setup -> seat; Private Meeting Setup -> location).
- status: `draft` (being prepared), `active` (usable for new EventOption), `inactive` (not used for new events but past records remain), `archived` (old version).

## Constraints & indexes
- PK ID_SpaceSetup (immutable).
- UNIQUE setup_code.
- CHECK capacity > 0.
- Validation: capacity <= LOCATIONS.max_capacity (of ID_Location).
- Validation: EVENT_OPTIONS.capacity <= SPACE_SETUPS.capacity; EVENT_OPTIONS.ID_Location must equal SPACE_SETUPS.ID_Location.
- Validation for seat-booking setups: reservable seat count >= capacity (e.g. 16 physical, 14 reservable, option 12 OK; capacity 16 with 12 reservable seats = problem).

## Relationships
- LOCATIONS 1 -> N SPACE_SETUPS.
- SPACE_SETUPS 1 -> N EVENT_OPTIONS.
- SPACE_SETUPS 1 -> N TABLES (TABLES.ID_SpaceSetup); 1 -> N SEATS (seat ID meaningful only in setup context).
- A setup need not have tables/seats (standing setup), may have seats without tables (chairs-only: TABLES none, SEATS 20).

## Business rules / data rules
1. SETUP-D01: Every SpaceSetup belongs to a valid Location.
2. SETUP-D02: setup_code unique.
3. SETUP-D03: capacity > 0.
4. SETUP-D04: Setup capacity must not exceed Location max capacity.
5. SETUP-D05: Inactive/archived setups cannot be used in new EventOptions.
6. SETUP-D06: Tables and Seats belong to a Setup.
7. SETUP-D07: EventOption capacity must not exceed Setup capacity.
8. SETUP-D08: Critical geometry of a setup used by published/booked events must not be changed retroactively.
9. SETUP-D09: Major physical layout changes create a new Setup version.
10. SETUP-D10: Setup carries no pricing or event schedule info.
11. Capacity hierarchy: LOCATION.max_capacity >= SPACE_SETUP.capacity >= EVENT_OPTION.capacity. Different setups of same location have different capacities (Cowork 16, U-Shape 14, Standing 25 with location max 25).
12. Versioning: small description edits allowed in place; serious geometry change -> new setup record/version (e.g. Fikirhane Cowork V1 16 seats -> V2 14 seats + wider aisles). Old events stay on V1, new events use V2. Past published events' seat maps must not change.
13. Active setup used by published or booked EventOption: geometry/capacity must not be directly changed; open a new version.
14. Map: map_image is background only; actual reservable objects come from TABLES and SEATS, each with its own normalized coordinates.
15. Admin UI should offer "Duplicate Setup" (e.g. Cowork V1 -> duplicate -> Cowork V2 -> move 2 seats -> publish).
16. Standing setup example: setup_type=standing, capacity=25, default_booking_unit=location, no seat records required.
17. U-Shape being more expensive must be handled via pricing rules, not on setup.
18. Setup has no ID_EventType (one setup used by many event types: U-Shape -> meetup, workshop, class).

## Superseded / rejected ideas
- Pricing on setup — rejected.
- ID_EventType on setup — rejected.
- Schedule on setup — rejected.
- TABLES.ID_Location alone (instead of ID_SpaceSetup) — insufficient/rejected.
- Editing geometry of in-use setup in place — rejected in favour of new version.
- Treating default_booking_unit as authoritative — rejected (EVENT_OPTIONS.booking_unit governs).

## Open questions
- map_aspect_ratio type: decimal vs text ratio.
- Whether version_no links versions of the same setup (no parent/lineage field defined).

## Seed data
Example setups for Fikirhane: "Fikirhane — Community Workspace" (16 seats, 4 tables x 4); "Fikirhane — U-Shape" (14–16 chairs); "Fikirhane — Chairs Only" (event seating). Atolye: "Atolye — Focus Workspace" (12 seats, 3 tables x 4); "Atolye — Workshop" (12 seats, whiteboard + TV). Codes referenced elsewhere: setup_FIKIRHANE_COWORK_V1, setup_ATOLYE_COWORK_V1.

## Example row
ID_SpaceSetup=setup_FIKIRHANE_COWORK_V1, ID_Location=loc_FIKIRHANE, setup_code=FIKIRHANE_COWORK_V1, setup_name="Community Workspace — 4 Tables", setup_type=cowork, description="4 tables with 4 chairs each.", capacity=16, default_booking_unit=seat, map_image=fikirhane_cowork_v1.svg, map_aspect_ratio=1.60, version_no=1, status=active, sort_order=10, created_at=updated_at=2026-09-20 10:00, created_by/updated_by=usr_ADMIN.
