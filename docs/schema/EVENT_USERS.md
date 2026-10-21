# EVENT_USERS

## Purpose
One row = one duty/organization role a User holds in a specific Event (tutor, speaker, moderator, host, facilitator, staff) — an N:N event-scoped relationship ("In what role does this person take part in this Event?"). It does NOT store participants (-> BOOKINGS), fees/payments (-> DOCUMENTS / DOCUMENT_ITEMS), global roles (-> USER_ROLES), club roles such as Club Lead (-> CLUB_USERS), or organization representation (-> ORGANIZATION_USERS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_EventUser | uuid | NOT NULL | gen | PK | The relation's own ID (not event or user ID), e.g. `evusr_001`. |
| ID_Event | uuid | NOT NULL | | -> EVENTS.ID_Event | |
| ID_User | uuid | NOT NULL | | -> USERS.ID_User | |
| event_user_role | enum (doc: "Enum/FK"; enum in V1) | NOT NULL | | | Role in this event; see enums. |
| status | enum | NOT NULL | 'active' (implied) | | Relation status. |
| is_primary | bool | NULL | (false implied) | | Main person among several in same role (co-tutor, panel); optional in V1. |
| start_at | timestamptz | NULL | | | Duty start if not whole event (e.g. speaker 14:00 in a 10:00–18:00 event). NULL = event's own time range applies. |
| end_at | timestamptz | NULL | | | Duty end. NULL = event end. |
| notes | text | NULL | | | Internal ops note ("Needs HDMI adapter.", "Primary tutor confirmed by Club Lead."). |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |

## Enums / allowed values
- event_user_role (V1 set): `tutor` (runs the teaching side; event-scoped, not a global Role), `speaker` (talk/panel speaker), `moderator` (runs discussion/meetup flow), `host` (greeter / main presenter), `facilitator` (runs workshop/group work), `staff` (Fikirhane personnel working the event operation). Possible future additions: `assistant`, `technician`, `photographer`.
- status: `active`, `inactive`, `cancelled`, `ended`. (E.g. a last-minute tutor change: old record -> cancelled, new record created.)

## Constraints & indexes
- PK ID_EventUser.
- UNIQUE (ID_Event, ID_User, event_user_role) — section 6; refined in section 15 / EVUSR-D03 as "no duplicate ACTIVE record at the same time" -> implement as partial unique index WHERE status = 'active' (allows a cancelled + new active record for same triple).
- Same user may have multiple rows in the same event with different roles.

## Relationships
- USERS N <-> N EVENTS via EVENT_USERS (USERS 1 -> N EVENT_USERS; EVENTS 1 -> N EVENT_USERS).
- Independent of BOOKINGS: same user can be both EventUser and participant (Booking).

## Business rules / data rules
1. EVUSR-D01: Each record must reference a valid User and Event.
2. EVUSR-D02: Participants must not be stored here; use BOOKINGS.
3. EVUSR-D03: No duplicate active record for the same Event + User + Role.
4. EVUSR-D04: Same user may have multiple different roles in the same event (separate rows; preferred over single-row-single-role).
5. EVUSR-D05: Event role grants authorization only within that event's scope.
6. EVUSR-D06: Tutor/Speaker/Moderator etc. must not be moved into global USER_ROLES.
7. EVUSR-D07: Duty fees are kept in financial document structure (DOCUMENTS/DOCUMENT_ITEMS, optionally with ID_User or organization), not here. EVENT_USERS = who had the duty; DOCUMENT_ITEMS = how much fee arose.
8. EVUSR-D08: EventUser history of cancelled/completed events must not be deleted (no hard delete).
9. EVUSR-D09: EventUser changes for critical roles must be audited.
10. Scoped authorization: Event User Role + Event relation + Role permission mapping = effective scoped authorization. E.g. tutor gets for that event only: `event.participants.view`, `event.attendance.manage`, `event.materials.manage`, `event.notes.edit`.
11. Club Lead = persistent club-scoped role (CLUB_USERS); Tutor = temporary event-scoped role (EVENT_USERS).
12. An organization representative who speaks at an event also needs an EVENT_USERS record.
13. Business rule may waive Booking requirement for staff/tutor.
14. Staff attendance/check-in is not the same as booking attendance; if needed use separate staff operational field or audit event. BOOKINGS attendance is for participants.
15. Event cancelled: EVENT_USERS rows not hard deleted; may stay as history or be set status = cancelled.

## Superseded / rejected ideas
- Storing participants here — rejected.
- `fee` column on EVENT_USERS — rejected (splits finance model).
- Single record per user/event with one role — rejected in favour of one row per role.
- EVENT_USER_ROLES master table — not V1; future if roles gain permission mapping, display order, compensation rules, default visibility, eligibility.
- Event roles in global USER_ROLES — rejected.

## Open questions
- Whether staff/tutors must also have a Booking (left to business rule).
- Mechanism for staff check-in (separate field vs audit event) undecided.
- Exact uniqueness: full unique vs partial (active-only) — doc states both; partial active-only is the later/stricter statement.

## Seed data
Event-scoped tutor permission examples: `event.participants.view`, `event.attendance.manage`, `event.materials.manage`, `event.notes.edit`.

## Example row
ID_EventUser=evusr_1001, ID_Event=event_ENGLISH_MEETUP_0924, ID_User=usr_AYSE, event_user_role=tutor, status=active, is_primary=true, start_at=NULL, end_at=NULL, notes="Primary tutor for this session.", created_at=updated_at=2026-09-20 12:00, created_by/updated_by=usr_CLUB_LEAD.
