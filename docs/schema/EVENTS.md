# EVENTS

## Purpose
One row = one real, dated/timed event occurrence (e.g. "Working Club, 22 Sep 2026 14:00-18:00"). It holds the event's shared identity, time, type and base price ("What happens, when, and what is its common content?"). NOT stored here: location, setup, capacity and location-dependent price (-> EVENT_OPTIONS); club links (-> EVENT_CLUBS), organization links (-> EVENT_ORGANIZATIONS), staff/role users (-> EVENT_USERS), participants (-> BOOKINGS), quotas (-> EVENT_QUOTAS), interest/skill tags (-> EVENT_INTERESTS / EVENT_SKILLS). Hierarchy: EVENT_SERIES = program/series; EVENTS = real dated event; EVENT_OPTIONS = booking options of this event.

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Event | uuid | NOT NULL | gen | PK | Unique, immutable. Example values in doc look like `event_001`, `event_20260922_PM`. Referenced by EVENT_OPTIONS, EVENT_CLUBS, EVENT_USERS, BOOKINGS, EVENT_ORGANIZATIONS, EVENT_QUOTAS. |
| ID_EventSeries | uuid | NULL | NULL | -> EVENT_SERIES.ID_EventSeries | Parent program/series; NULL for standalone event. Max one series per event. |
| event_code | text | NULL | | | Optional technical/operational code, e.g. `ENG-MEET-2026-09-24`, `WORKING-2026-09-22-PM`. Not required by UI; for admin/reporting/integration. |
| event_type | enum (doc: "Enum/FK") | NOT NULL | | | Functional type; see enums. |
| event_title | text | NOT NULL | | | User-facing title. |
| event_description | text | NULL | | | Detailed description. |
| start_datetime | timestamptz | NOT NULL | | | Start. |
| end_datetime | timestamptz | NOT NULL | | | End; must be > start_datetime. |
| timezone | text | NOT NULL | 'Europe/Istanbul' (implied) | | IANA tz. Keep explicit even in single-location system. |
| status | enum | NOT NULL | 'draft' (implied) | | Lifecycle; see enums. |
| base_price | numeric(12,2) | NULL | | | Event's common base price; NOT the location-specific final price. |
| currency_code | text (ISO 4217, char(3)) | NULL | | | e.g. `TRY`. |
| minimum_attendees | int | NULL | | | Minimum headcount for event to happen (esp. meetup/class). NOT total capacity. |
| networking_enabled | bool | NOT NULL | | | Participant networking feature on for this event. |
| show_interests | bool | NOT NULL | | | Interests may be shown in participant view (subject also to user's privacy). |
| show_skills | bool | NOT NULL | | | Skills may be shown (same logic as show_interests). |
| enable_need | bool | NOT NULL | | | User may pick a Need during booking ("What are you looking for today?"); if false hidden in booking form. |
| enable_offer | bool | NOT NULL | | | User may pick an Offer during booking ("What can you offer others today?"). |
| created_by_user_id | uuid | doc says "Evet/Hayır" (ambiguous) | | -> USERS.ID_User | User who created the record; NOT the organizer. |
| created_at | timestamptz | NOT NULL | now() | | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | Last modifier. |

## Enums / allowed values
- event_type (doc: "your current agreed set"): `workspace`, `meetup`, `workshop`, `talk`, `class`, `social`. Examples: Working Club session -> workspace; English Conversation -> meetup; AI Prompting Session -> workshop; Guest Speaker -> talk.
- status: `draft` (in preparation), `submitted` (sent for approval by Club Admin/User), `approved` (approved by Fikirhane), `published` (open to users), `cancelled`, `completed` (took place and finished), `archived` (historical record).

## Constraints & indexes
- PK ID_Event (unique, immutable).
- CHECK end_datetime > start_datetime.
- FK ID_EventSeries -> EVENT_SERIES (nullable; at most one).
- Published event must have >= 1 active EVENT_OPTIONS row (business rule, enforced in app/rules).

## Relationships
- EVENT_SERIES 1 -> N EVENTS (optional).
- EVENTS 1 -> N EVENT_OPTIONS (most critical child; always >= 1 even for single-location events).
- EVENTS 1 -> N BOOKINGS (booking also stores ID_EventOption).
- EVENTS N <-> N CLUBS via EVENT_CLUBS (event may have 0, 1 or many clubs, e.g. co-organized AI Club + English Club).
- EVENTS N <-> N ORGANIZATIONS via EVENT_ORGANIZATIONS (roles: organizer, co_organizer, partner, sponsor).
- EVENTS 1 -> N EVENT_USERS (staff roles: tutor, speaker, moderator, host, facilitator, staff).
- EVENTS 1 -> N EVENT_QUOTAS; optional EVENT_INTERESTS / EVENT_SKILLS.
- PRICING_RULES may reference ID_Event for event-specific override.

## Business rules / data rules
1. EVT-D01: ID_Event unique and immutable.
2. EVT-D02: end_datetime > start_datetime.
3. EVT-D03: An event belongs to at most one EventSeries.
4. EVT-D04: Location/Setup/Capacity managed via EVENT_OPTIONS (never on EVENTS).
5. EVT-D05: A published Event must have at least one active EventOption.
6. EVT-D06: Participant users are stored in BOOKINGS, not EVENT_USERS.
7. EVT-D07: Tutor/Speaker/Moderator etc. role users are stored in EVENT_USERS.
8. EVT-D08: Club relation via EVENT_CLUBS.
9. EVT-D09: Organization relation via EVENT_ORGANIZATIONS.
10. EVT-D10: Cancelled/completed events are never hard deleted.
11. EVT-D11: Past booking prices are unaffected by later base_price changes (financial snapshot taken at booking).
12. EVT-D12: Event pricing must be resolvable before publishing.
13. Even a single-location event gets exactly 1 EventOption, so booking logic is always Booking -> Event -> EventOption (no second code path).
14. Pricing formula: Event Base Price + Location Adjustment - Membership Discount = Final Price. Location adjustment via PRICING_RULES or EventOption adjustment; membership via MEMBERSHIP_TYPES / PRICING_RULES; event-specific override via PRICING_RULES.ID_Event. Example: base 500, Atolye -50, Member -15% -> (500-50)*0.85 = 382.50. Final price computed at booking time and snapshotted.
15. Capacity rule (per option): EventOption.capacity <= SpaceSetup.capacity <= Location.max_capacity (e.g. setup 12, option 10 OK; option 15 not OK).
16. Status flow: draft -> submitted -> approved -> published -> completed; alternative published -> cancelled. Club Lead-created events go draft -> submitted; Admin can approve -> publish.
17. Publish preconditions (Rules doc, not schema): title exists; start/end valid; event_type exists; >= 1 active EventOption; each EventOption has valid Location/Setup/capacity; pricing resolvable.
18. Cancel: no hard delete; status = cancelled; related Bookings enter cancellation/refund flow separately; bookings are not physically deleted.
19. Completed: set automatically after end time or by admin action; may close after attendance/check-in is finished.
20. show_interests/show_skills effective only if Event flag = true AND the user's networking/profile visibility allows.
21. created_by_user_id is record creator, not organizer (organizer could be a club or organization via junctions).
22. Quota fields (e.g. Visitor max 15%, Freepass max 25%) must not be put in EVENTS; use EVENT_QUOTAS.

## Superseded / rejected ideas
- EVENTS.capacity — rejected; capacity lives on EVENT_OPTIONS.capacity.
- EVENTS.ID_Location — rejected; use EVENT_OPTIONS.ID_Location.
- EVENTS.ID_Setup — rejected; use EVENT_OPTIONS.ID_Setup.
- Quota columns on EVENTS — rejected; use EVENT_QUOTAS.
- Participants in EVENT_USERS — rejected; BOOKINGS.
- Separate code path for single-option events (no EventOption) — rejected.

## Open questions
- event_type as enum vs FK lookup table ("Enum/FK").
- created_by_user_id required or not ("Evet/Hayır").
- Whether location adjustment lives in PRICING_RULES or as an EventOption adjustment.
- Auto vs manual transition to completed.
- EVENT_INTERESTS / EVENT_SKILLS only "if needed".

## Example row
ID_Event=event_20260922_PM, ID_EventSeries=NULL, event_code=WORKING-2026-09-22-PM, event_type=workspace, event_title="Working Club — Afternoon Session", event_description="Fikirhane community workspace afternoon session.", start=2026-09-22 14:00, end=2026-09-22 18:00, timezone=Europe/Istanbul, status=published, base_price=500.00, currency_code=TRY, minimum_attendees=NULL, networking_enabled/show_interests/show_skills/enable_need/enable_offer=true, created_by_user_id=usr_ADMIN, created_at=updated_at=2026-09-15 10:00, updated_by_user_id=usr_ADMIN. Options: Option 1 Fikirhane 16 seats; Option 2 Atolye 12 seats.
