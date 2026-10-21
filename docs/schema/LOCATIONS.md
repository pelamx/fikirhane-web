# LOCATIONS

## Purpose
One row = one permanent physical space / bookable area of Fikirhane (e.g. Fikirhane, Atolye, Toplanti Odasi/Meeting Room, Teras/Terrace) — the permanent identity of a physical area and its safe physical maximum capacity ("Where does the Event/EventOption physically happen?"). NOT stored here: physical layouts (-> SPACE_SETUPS; e.g. "Fikirhane - U Shape" is a setup, not a location), tables/seats (-> TABLES/SEATS via SPACE_SETUPS), event-specific capacity and booking option (-> EVENT_OPTIONS), booking_unit (-> EVENT_OPTIONS), seat map (-> SPACE_SETUPS.map_image), availability/occupancy (computed from Event/EventOption scheduling), any Event ID. Location = where? Setup = how arranged? EventOption = which Location + Setup + capacity for this Event.

## Final fields
Final "nihai sade field set" (section 22):

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Location | uuid | NOT NULL | gen | PK | Immutable; e.g. `loc_FIKIRHANE`. |
| location_code | text | NOT NULL | | | Fixed technical code, UNIQUE; e.g. `FIKIRHANE`, `ATOLYE`, `MEETING_ROOM`, `TERRACE`. |
| location_name | text | NOT NULL | | | UI name (Fikirhane, Atolye, Toplanti Odasi, Teras). |
| location_type | enum/text | NULL | | | Classification; optional in V1 if no filtering need. |
| description | text | NULL | | | Short description. |
| max_capacity | int | NOT NULL | | | Physical safe upper limit (Fikirhane 16, Atolye 12, Meeting Room 8). > 0. NOT the event capacity. |
| floor | text (doc: Text/Number) | NULL | | | e.g. "Ground Floor", "1st Floor", "Terrace". |
| indoor_outdoor | enum | NULL | | | indoor/outdoor/semi_outdoor. |
| reservable | bool | NOT NULL | | | Can be used for EventOption/booking (Kitchen/Storage = false; Fikirhane/Atolye = true). |
| default_price_adjustment | numeric(12,2) | NULL | | | Optional default commercial setting; suggested/copied into EVENT_OPTIONS.price_adjustment on creation (Fikirhane 0, Atolye -50). Default only. |
| currency_code | text (ISO) | NULL | | | Currency of the adjustment (TRY). |
| status | enum | NOT NULL | 'active' (implied) | | |
| sort_order | int | NULL | | | UI order (10, 20). |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| cover_image | text (file ref/URL) | NULL | | | (V2/optional) General photo of the location, mentioned as allowed but not in final set. |

## Enums / allowed values
- location_type (controlled enum for start): `workspace`, `meeting_room`, `event_space`, `cafeteria`, `terrace`, `support_area`.
- indoor_outdoor: `indoor`, `outdoor`, `semi_outdoor` (useful for terrace: weather, event suitability, seasonal use).
- status: `active` (normally usable), `inactive` (no new EventOption may be opened), `maintenance` (temporarily unusable), `archived` (space no longer exists).

## Constraints & indexes
- PK ID_Location (unique, immutable).
- UNIQUE location_code.
- CHECK max_capacity > 0.
- Capacity hierarchy: LOCATION.max_capacity >= SPACE_SETUP.capacity >= EVENT_OPTION.capacity (e.g. 16 >= 14 >= 12 valid; option 18 invalid).

## Relationships
- LOCATIONS 1 -> N SPACE_SETUPS.
- LOCATIONS 1 -> N EVENT_OPTIONS.
- TABLES/SEATS are NOT linked directly to LOCATIONS; hierarchy LOCATION -> SPACE_SETUP -> TABLES / SEATS.
- Physical hierarchy: BUILDING -> LOCATION -> SPACE_SETUP -> TABLE/SEAT (no BUILDINGS table in V1; VENUES/BRANCHES parent could be added if a second branch opens).

## Business rules / data rules
1. LOC-D01: ID_Location unique and immutable.
2. LOC-D02: location_code unique.
3. LOC-D03: max_capacity > 0.
4. LOC-D04: Inactive/maintenance locations cannot be used for new EventOptions.
5. LOC-D05: EventOption capacity must not exceed Location max capacity.
6. LOC-D06: A location's physical layouts are managed via SPACE_SETUPS.
7. LOC-D07: Table and Seat link to Setup, not directly to Location.
8. LOC-D08: Setup's seat map, not Location's, is the source of truth.
9. LOC-D09: Location price adjustment is only a default; must not change past Booking prices (nor retroactively change published Event prices).
10. LOC-D10: Conflicting event usage of the same physical location is prevented by scheduling rule.
11. Conflict check on new EventOption: same Location + overlapping event time + active/published relevant EventOption -> conflict. This is a scheduling rule, not a field. Different setups of the same physical location still cannot host two events at once; divisible-space scenario would need a future zone/sub-location model.
12. Fikirhane and Atolye are definitely separate locations (different capacity, physical area, setup, price adjustment, booking option).
13. Individual tables (Table 1..3) and seats (F01, F02) are not locations (-> TABLES / SEATS).
14. Location cannot hold an event ID (one location used by many events).

## Superseded / rejected ideas
- Setups (e.g. "Fikirhane - 4 Masa Duzeni") as separate locations — rejected.
- LOCATIONS.ID_Event — rejected.
- booking_unit on LOCATIONS — rejected (same location uses seat/table/location in different setups; lives on EVENT_OPTIONS).
- Seat map on LOCATIONS — rejected (SPACE_SETUPS.map_image).
- Tables/seats linked directly to location — rejected.
- Each table as a location — rejected.
- Availability stored on location — rejected.
- BUILDINGS table — not needed in V1.

## Open questions
- Terrace: separate reservable location or `reservable=false` social/support seating — depends on usage model. Cafeteria may exist as non-reservable location.
- Future zone/sub-location model for divisible spaces; VENUES/BRANCHES for multi-branch.

## Seed data
Core initial reservable locations: Fikirhane (`FIKIRHANE`), Atolye (`ATOLYE`), Meeting Room (`MEETING_ROOM`). Optional: Terrace (`TERRACE`, possibly reservable=false), Cafeteria (reservable=false). Kitchen, Storage = reservable false (examples).
- loc_FIKIRHANE: FIKIRHANE / Fikirhane / workspace / "Front community workspace area." / max 16 / Ground Floor / indoor / reservable true / adj 0.00 TRY / active / sort 10.
- loc_ATOLYE: ATOLYE / Atolye / workspace / "Back focus/workshop area with whiteboard and large display." / max 12 / Ground Floor / indoor / reservable true / adj -50.00 TRY / active / sort 20.
- Meeting Room max_capacity 8 (example).

## Example row
ID_Location=loc_FIKIRHANE, location_code=FIKIRHANE, location_name=Fikirhane, location_type=workspace, description="Front community workspace area.", max_capacity=16, floor="Ground Floor", indoor_outdoor=indoor, reservable=true, default_price_adjustment=0.00, currency_code=TRY, status=active, sort_order=10.
