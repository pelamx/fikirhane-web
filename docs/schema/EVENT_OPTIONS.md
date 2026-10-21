# EVENT_OPTIONS

## Purpose
One row = one concrete, bookable variant of an EVENT: a Location + SpaceSetup + capacity + booking unit combination (e.g. Working Club 22 Sep -> Option 1 Fikirhane/Cowork/16/seat, Option 2 Atolye/Focus/12/seat). EVENTS = shared content and time; EVENT_OPTIONS = bookable variant. BOOKINGS reference the chosen option directly. NOT stored here: time (EVENTS.start/end_datetime), event type (parent event), club (CLUB_EVENTS / event level), organization (EVENT_ORGANIZATIONS), minimum attendees (EVENTS.minimum_attendees in V1), seat/table lists (derived via SPACE_SETUPS -> SEATS/TABLES), financial center (from event's primary club / DocumentItem context), sold_out (derived).

## Final fields
Final "nihai sade field set" (section 32):

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_EventOption | uuid | NOT NULL | gen | PK | e.g. `eopt_001`, `eopt_WORKING_PM_FIK`. Referenced by BOOKINGS.ID_EventOption. |
| ID_Event | uuid | NOT NULL | | -> EVENTS.ID_Event | Parent event. |
| ID_Location | uuid | NOT NULL | | -> LOCATIONS.ID_Location | Physical area (Fikirhane, Atolye, Meeting Room). |
| ID_SpaceSetup | uuid | NOT NULL | | -> SPACE_SETUPS.ID_SpaceSetup | Physical layout used, e.g. "Fikirhane — Cowork 4x4 V2". Must belong to ID_Location. |
| option_code | text | NOT NULL | | | Technical code, e.g. `FIK`, `ATL`, `MR1`, or `OPT_FIKIRHANE`, `OPT_ATOLYE`. Unique per event. |
| option_name | text | NULL | | | UI name, can be more commercial ("Fikirhane — Network Zone", "Atolye — Focus Zone"); optional if location name suffices. |
| capacity | int | NOT NULL | | | Real sales/booking capacity for this option; > 0; <= setup capacity. |
| booking_unit | enum | NOT NULL | (suggested from SPACE_SETUPS.default_booking_unit) | | location / table / seat. Authoritative booking behaviour. |
| price_adjustment | numeric(12,2) | NULL | | | Price delta on EVENTS.base_price; snapshot copied from LOCATIONS.default_price_adjustment at creation. |
| status | enum | NOT NULL | 'draft' (implied) | | Option lifecycle. |
| sort_order | int | NULL | | | UI ordering (e.g. 10, 20). |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| currency_code | text (ISO) | NULL | | | (V2/optional) In initial list and example rows (TRY), but final set drops it: redundant if single currency / inherited from EVENTS.currency_code. If kept, must equal event's currency. |

## Enums / allowed values
- booking_unit: `location` (user only gets participation right; does not pick table/seat), `table` (a Table is booked), `seat` (an individual Seat is booked). Fikirhane normal community workspace -> `seat`.
- status (preferred clean set): `draft`, `active`, `inactive`, `cancelled`, `archived`. (`sold_out` rejected as stored status; derived.)
- Derived availability: `sold_out` when active capacity-consuming bookings >= capacity.

## Constraints & indexes
- PK ID_EventOption.
- UNIQUE (ID_Event, option_code) (preferred).
- CHECK capacity > 0.
- Validation: SPACE_SETUPS.ID_Location = EVENT_OPTIONS.ID_Location (setup must belong to the option's location).
- Validation: capacity <= SPACE_SETUPS.capacity <= LOCATIONS.max_capacity.
- Normal rule: one active EventOption per (ID_Event, ID_Location, ID_SpaceSetup) (partial unique where status='active').
- booking_unit is a controlled list (location/table/seat).
- BOOKINGS integrity: BOOKING.ID_Event = EVENT_OPTION.ID_Event.

## Relationships
- EVENTS 1 -> N EVENT_OPTIONS (>= 1 always, even single-location events: 1:1).
- EVENT_OPTIONS 1 -> N BOOKINGS (booking stores both ID_Event and ID_EventOption).
- EVENT_OPTIONS N -> 1 LOCATIONS; N -> 1 SPACE_SETUPS.
- Seats/Tables derived: EVENT_OPTION -> SPACE_SETUP -> SEATS / TABLES.

## Business rules / data rules
1. EOPT-D01: Every EventOption must belong to a valid Event.
2. EOPT-D02: Every EventOption must reference a valid Location and SpaceSetup.
3. EOPT-D03: SpaceSetup must belong to the referenced Location.
4. EOPT-D04: capacity > 0.
5. EOPT-D05: EventOption capacity must not exceed SpaceSetup capacity.
6. EOPT-D06: SpaceSetup capacity must not exceed Location max capacity.
7. EOPT-D07: booking_unit is a controlled list: location/table/seat.
8. EOPT-D08: For seat booking, the Setup must contain enough reservable Seats.
9. EOPT-D09: For table booking, the Setup must contain reservable Tables.
10. EOPT-D10: A published Event must have at least one active EventOption.
11. EOPT-D11: price_adjustment changes must not alter past Booking prices (Booking snapshots final_price).
12. EOPT-D12: Once bookings exist, critical fields (ID_Location, ID_SpaceSetup, booking_unit) must not be changed directly; instead set old option inactive/cancelled and create a new option.
13. EOPT-D13: Time conflicts on the same physical Location are checked by scheduling logic.
14. EOPT-D14: Sold-out is preferably derived from booking count and capacity, not stored.
15. Option capacity is separate from setup capacity because an event may open fewer seats (e.g. setup 16, option 12 for networking quality). Example valid: Location.max 16, Setup 16, Option 14.
16. SPACE_SETUPS.default_booking_unit is only a suggestion; EVENT_OPTIONS.booking_unit governs (e.g. setup default seat, option override location).
17. LOCATIONS.default_price_adjustment is the suggested value when creating; it is copied into EVENT_OPTIONS.price_adjustment as a snapshot. Later changes to the location default (e.g. -50 -> -70) do not change existing published options.
18. V1 pricing model: Event base price + EventOption adjustment + Membership discount. PRICING_RULES come later for complex campaigns/exceptions. Example: 500 - 50 = 450; Member 15% -> 382.50.
19. Capacity-consuming booking statuses: `pending_payment`, `confirmed`, `checked_in`. Non-consuming: `cancelled`, `expired`, `no_show`, `completed` (completed is past anyway); waitlist does not consume.
20. Seat availability (booking_unit=seat): EventOption -> SpaceSetup -> Seats list, then BOOKINGS determines occupied seats.
21. Option can be closed independently (event published; Fikirhane active, Atolye inactive) without cancelling the event.
22. When option status = cancelled, its active bookings enter a cancellation/reassignment flow (move to another option, refund, credit) — business logic.
23. Published option capacity may change (e.g. 12 -> 14) with validation.
24. price_adjustment may change before bookings; after bookings it may change for future bookings only.
25. Resource conflict on publish: check same Location + overlapping Event time + active/published conflicting EventOption; if exists, second event cannot open. Different setups do not double the physical space; scheduling considers Location + Event time.
26. If options start at different times (Fikirhane 14:00, Atolye 15:00), they should be separate Events, not options.
27. Same Location twice in same Event (e.g. standard vs premium window seating) is possible but not in V1; prefer one option + seat selection.

## Superseded / rejected ideas
- Making each location variant a separate Event — rejected (content duplication).
- Stored status `sold_out` — rejected; derived.
- EVENT_OPTION_SEATS junction (open only specific seats) — not now; future if needed.
- Event-specific table list/override — not V1.
- start/end time on option — rejected.
- event_type, club, organization on option — rejected (event level).
- EVENT_OPTIONS.minimum_attendees — not V1 (event-level suffices).
- ID_FinancialCenter on option — unnecessary now.
- currency_code — dropped from final simple set (optional).
- Using PRICING_RULES instead of price_adjustment for location delta in V1 — rejected for V1 simplicity.

## Open questions
- Keep currency_code or inherit from EVENTS.
- Future option-level minimum attendees, seat subsets, financial center.

## Example row
- eopt_WORKING_PM_FIK: ID_Event=event_WORKING_20260922_PM, ID_Location=loc_FIKIRHANE, ID_SpaceSetup=setup_FIKIRHANE_COWORK_V1, option_code=FIK, option_name="Fikirhane — Network Zone", capacity=16, booking_unit=seat, price_adjustment=0.00, currency_code=TRY, status=active, sort_order=10, created/updated 2026-09-15 10:00 by usr_ADMIN.
- eopt_WORKING_PM_ATL: same event, loc_ATOLYE, setup_ATOLYE_COWORK_V1, ATL, "Atolye — Focus Zone", 12, seat, -50.00, TRY, active, sort_order=20.
