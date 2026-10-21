# BOOKINGS

## Purpose
One row = one physical participant's actual reservation for a specific Event AND a specific EventOption (location/setup choice), optionally at seat or table level ("who booked which Event, for which option/location, under which terms"). It is the operational + commercial snapshot (quote at booking time) of the reservation: participant, seat/table, price snapshot, membership snapshot, payment status, check-in and cancellation lifecycle. NOT stored here: the accounting source of truth (DOCUMENTS / DOCUMENT_ITEMS, linked via DOCUMENT_ITEMS.ID_Booking; money movement in TRANSACTIONS), participants via EVENT_USERS (participants live here, not in EVENT_USERS), the user's acquisition source (USER_ACQUISITIONS), Club (derived via EVENT -> CLUB_EVENTS -> CLUB), Location (derived via EVENT_OPTION -> LOCATION), attendance history log (future ATTENDANCE_LOGS, not in V1), freepass redemption source of truth (FREEPASS_REDEMPTIONS).

## Final fields
Authoritative set = section 32 "nihai field set". Types from section 3 table where given.

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Booking | uuid | NOT NULL | gen | PK | Booking's own ID (example value `booking_10001`) |
| ID_Event | uuid (FK) | NOT NULL | | EVENTS.ID_Event | Event booked. Must equal EVENT_OPTIONS.ID_Event of the chosen option |
| ID_EventOption | uuid (FK) | NOT NULL | | EVENT_OPTIONS.ID_EventOption | Chosen location/setup option (e.g. `option_ATOLYE`). Mandatory |
| ID_User | uuid (FK) | NULL | | USERS.ID_User | Actual participant if registered user; NULL for guest booking |
| booked_by_user_id | uuid (FK) | NULL | | USERS.ID_User | User who created the reservation (may differ from participant, e.g. staff booking on behalf of user) |
| ID_Invitation | uuid (FK) | NULL | | INVITATIONS.ID_Invitation | Set if booking came via an invitation |
| ID_Freepass | uuid (FK) | NULL | | FREEPASSES.ID_Freepass | Set if a freepass was used (traceability; FREEPASS_REDEMPTIONS is source of truth) |
| ID_MembershipTypeAtBooking | uuid (FK) | NULL | | MEMBERSHIP_TYPES.ID_MembershipType | Snapshot of user's membership type at booking time; NULL = Visitor. Recommended addition (sections 29-30) |
| booking_status | enum | NOT NULL | | | Booking lifecycle (see enums) |
| booking_source | enum | NOT NULL | | | Transaction channel the booking came through (see enums) |
| booked_at | timestamptz | NOT NULL | now() | | Moment reservation was created |
| expires_at | timestamptz | NULL | | | Temporary hold / pending-payment expiry (e.g. booked_at + 10 min) |
| booking_unit | enum | NOT NULL | | | Level of booking: location / table / seat. Derivable from EventOption but kept as snapshot |
| ID_Table | uuid (FK) | NULL | | TABLES.ID_Table | Required when booking_unit = table, else NULL |
| ID_Seat | uuid (FK) | NULL | | SEATS.ID_Seat | Required when booking_unit = seat, else NULL |
| ID_Need | uuid (FK) | NULL | | NEEDS.ID_Need | Need the user chose to make visible for this event (selectable when Event.enable_need = true) |
| need_text_snapshot | text | NULL | | | Snapshot of Need text at booking time |
| ID_Offer | uuid (FK) | NULL | | OFFERS.ID_Offer | Event-specific Offer selection |
| offer_text_snapshot | text | NULL | | | Snapshot of Offer text at booking time |
| price_list_amount | numeric(12,2) (Decimal) | NULL | | | List/reference (undiscounted) price snapshot, e.g. 500.00 |
| discount_amount | numeric(12,2) (Decimal) | NULL | | | Total discount applied (membership/freepass/promotion), e.g. 75.00 |
| final_price | numeric(12,2) (Decimal) | NOT NULL | | | Final price at booking time snapshot, e.g. 425.00 |
| currency_code | text (e.g. char(3)) | NOT NULL | | | Currency, e.g. TRY |
| payment_status | enum | NOT NULL | | | Payment state, separate from booking_status |
| checkin_at | timestamptz | NULL | | | Check-in time (real attendance) |
| checkout_at | timestamptz | NULL | | | Check-out time (esp. workspace sessions) |
| cancelled_at | timestamptz | NULL | | | Cancellation time |
| cancelled_by_user_id | uuid (FK) | NULL | | USERS.ID_User | Who cancelled (user or admin) |
| cancellation_reason | text | NULL | | | Cancellation reason; doc suggests controlled reason code + optional note (see enums) |
| is_manual_booking | bool | NOT NULL | false | | Booking manually created by staff |
| override_reason | text | NULL | | | Reason when an admin overrode a business rule |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid (FK) | NULL | | USERS.ID_User | |
| guest_first_name | text | NULL | | | Guest snapshot, only if guest booking is used ("V1'de gerekiyorsa") (V2/optional) |
| guest_last_name | text | NULL | | | (V2/optional) |
| guest_email | text | NULL | | | (V2/optional) |
| guest_phone | text | NULL | | | (V2/optional) |

## Enums / allowed values
- booking_status:
  - `pending_payment` - place temporarily held, payment not completed (e.g. hold = 10 minutes); becomes `expired` when time runs out
  - `confirmed` - reservation finalized
  - `waitlisted` - capacity full, on waiting list
  - `checked_in` - user arrived
  - `completed` - event participation completed
  - `cancelled` - reservation cancelled
  - `expired` - payment hold or reservation hold expired
  - `no_show` - had a reservation but did not show up (important KPI)
- booking_source (transaction channel, NOT acquisition): `web`, `mobile_app`, `staff`, `phone`, `whatsapp`, `walk_in`, `invitation`, `freepass`
- booking_unit: `location`, `table`, `seat`
- payment_status: `unpaid`, `pending`, `paid`, `partially_paid`, `refunded`, `partially_refunded`, `waived`
- cancellation_reason (suggested codes; doc recommends controlled code + optional note): `user_request`, `event_cancelled`, `payment_failed`, `duplicate`, `admin_override`

## Constraints & indexes
- PK ID_Booking.
- ID_Event NOT NULL, ID_EventOption NOT NULL; BOOKINGS.ID_Event = EVENT_OPTIONS.ID_Event for ID_EventOption (composite FK or trigger) (BOOK-D02).
- CHECK: booking_unit = 'seat' => ID_Seat IS NOT NULL; booking_unit = 'table' => ID_Table IS NOT NULL; location-only booking: both may be NULL.
- CHECK: ID_User IS NOT NULL OR guest identity present (guest fields) - both cannot be empty (BOOK-D05).
- Partial unique: one active booking per (ID_User, ID_Event) where booking_status in active set (BOOK-D06).
- Partial unique: one active booking per (ID_EventOption, ID_Seat) where ID_Seat not null and status active (BOOK-D08).
- Whole-table booking (booking_unit = table): no other active booking on the same table for that option (partial unique on (ID_EventOption, ID_Table) where booking_unit='table' and active).
- Capacity: COUNT(active bookings WHERE ID_EventOption = X) <= EVENT_OPTIONS.capacity (app/trigger, not a DB constraint; override needs special permission).
- Active set for quota counting (doc's initial choice): `pending_payment`, `confirmed`, `checked_in` (waitlisted excluded).

## Relationships
- USERS 1 - N BOOKINGS (via ID_User; also booked_by_user_id, cancelled_by_user_id, created_by/updated_by).
- EVENTS 1 - N BOOKINGS.
- EVENT_OPTIONS 1 - N BOOKINGS.
- TABLES 1 - N BOOKINGS; SEATS 1 - N BOOKINGS (one active per option+seat).
- INVITATIONS 1 - N BOOKINGS (optional); FREEPASSES 1 - N BOOKINGS (optional).
- MEMBERSHIP_TYPES 1 - N BOOKINGS (snapshot).
- NEEDS 1 - N BOOKINGS; OFFERS 1 - N BOOKINGS (optional).
- BOOKINGS 1 - N DOCUMENT_ITEMS (DOCUMENT_ITEMS.ID_Booking; no BOOKINGS.ID_Document).
- BOOKINGS 1 - 0..1 FREEPASS_REDEMPTIONS (redemption created on freepass booking).
- Club derived: BOOKING -> EVENT -> CLUB_EVENTS -> CLUB. Location derived: BOOKING -> EVENT_OPTION -> LOCATION.

## Business rules / data rules
1. BOOK-D01: Every booking must reference a valid Event and EventOption.
2. BOOK-D02: Booking.Event must equal EventOption's Event.
3. BOOK-D03: One physical participant = one Booking. Same person attending two events = two bookings.
4. BOOK-D04: Participants are stored in BOOKINGS, not EVENT_USERS.
5. BOOK-D05: Registered booking must have a User; guest booking must have sufficient guest identity. Guest may later open an account and the booking can then be linked to the User. Guest bookings may come via invitation/freepass.
6. BOOK-D06: A user can have at most one active booking per Event at a time. To change EventOption use a modify-booking flow on the existing booking instead of a new booking; cancellation lock applies.
7. BOOK-D07: EventOption capacity must not be exceeded by active bookings; override requires special permission.
8. BOOK-D08: No duplicate active booking for same EventOption + Seat.
9. BOOK-D09: final price is preserved as a snapshot.
10. BOOK-D10: Pricing/membership changes (event base price, membership discount, pricing rules) must not change past booking prices.
11. BOOK-D11: Cancellation is a separate lifecycle from payment/refund. Cancel does not delete payment. Flow: Booking cancelled -> refund eligibility calculation -> Transaction refund -> payment_status updated.
12. BOOK-D12: 24-hour cancellation lock enforced in backend: if now >= event.start_datetime - 24h the user cannot cancel/change own booking (cancel_own = denied); admin can override. This is a business rule, not a field.
13. BOOK-D13: Manual bookings stay in BOOKINGS (no MANUAL_BOOKINGS table). Example: payment system failed -> staff creates booking_source=staff, is_manual_booking=true, payment_status=unpaid, booking_status=confirmed so user does not lose place; when payment arrives the normal financial flow applies.
14. BOOK-D14: Expired/cancelled/completed bookings must not be hard deleted.
15. BOOK-D15: Freepass booking keeps list price and discount where possible (e.g. price_list_amount=500, discount_amount=500, final_price=0, payment_status=waived) so promo value can be measured; FREEPASS_REDEMPTION is created.
16. BOOK-D16: booking_source must not be confused with user acquisition source (Instagram/Google/Referral/Partner -> USER_ACQUISITIONS).
17. pending_payment hold: if payment not received by expires_at (e.g. 10 min) the booking becomes expired and capacity is released.
18. Booking status and payment status are independent (e.g. cancelled+refunded; confirmed+unpaid for manual; confirmed+waived for freepass; confirmed+paid).
19. Reservation window: user may book events where event.start_datetime <= now + MembershipType.reservation_window_days (e.g. Member 7 days). Visitor may have a separate default system rule.
20. Max active bookings: MembershipType.max_active_bookings (e.g. 2); active statuses counted = pending_payment, confirmed, checked_in; waitlisted not counted.
21. Event cancelled (EVENTS.status = cancelled) -> related bookings moved to cancelled; paid bookings enter refund workflow; booking records not deleted.
22. Any rule override by admin records override_reason and must also be written to audit log.
23. Accounting source of truth after a financial document exists is DOCUMENT_ITEMS; Booking = quote/commercial snapshot, Document Item = real financial record. Paid booking typically creates BOOKING -> DOCUMENT -> DOCUMENT_ITEM with DOCUMENT_ITEMS.ID_Booking.
24. Table booking: if one booking takes the whole table (booking_unit=table, ID_Table=T1) no other booking may enter that table; if table seats are booked individually the booking is seat-level. Seat model preferred for Fikirhane in most cases.
25. Invitation is not a reservation (it is an invitation right/link); Booking is the participation reservation.
26. checkin_at/checkout_at/no_show on booking are sufficient for attendance in V1.
27. Need/Offer: store text snapshots so later edits of Need/Offer text do not alter historical event context (recommended especially for networking events).

## Superseded / rejected ideas
- Separate MANUAL_BOOKINGS table - rejected.
- BOOKINGS.ID_Club - rejected (redundant; derive via CLUB_EVENTS).
- Mandatory BOOKINGS.ID_Document - rejected; link via DOCUMENT_ITEMS.ID_Booking.
- Storing participants in EVENT_USERS - rejected.
- Separate ATTENDANCE_LOGS table - not needed in V1 (future option).
- Location snapshot on booking - not in V1 (FK chain sufficient); only if snapshot need arises.
- Storing only ID_Need/ID_Offer without text snapshot - superseded by adding need_text_snapshot/offer_text_snapshot.
- Single combined status for booking+payment - rejected.
- Counting waitlisted toward active booking quota - rejected.
- Treating ID_Freepass on booking as source of truth - rejected (FREEPASS_REDEMPTIONS is).

## Open questions
- Whether guest fields are included in V1 ("if needed").
- Whether waitlisted counts as active (doc marks `waitlisted?`; initial answer: not counted) - business rule to finalize.
- cancellation_reason: free text vs controlled reason code + optional note (doc says code+note "could be better").
- Visitor reservation window default rule value not specified.
- Location snapshot may be needed later.

## Example row
`ID_Booking=booking_10001, ID_Event=Working Club 22 Sep 14:00, ID_EventOption=Fikirhane option, ID_User=Ahmet, booked_by_user_id=Admin, booking_unit=seat, ID_Seat=F-12, booked_at=2026-09-22 10:42, price_list_amount=500.00, discount_amount=75.00, final_price=425.00, currency_code=TRY, booking_status=confirmed, payment_status=paid`
