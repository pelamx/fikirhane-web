# CLUB_EVENTS

## Purpose
N:N junction between CLUBS and EVENTS (author prefers the name **EVENT_CLUBS** for consistency with the event-centric model; CLUB_EVENTS is acceptable in user docs — same table). One row = one Club's relation to one Event, with that Club's role in the Event and whether it is the primary Club. An Event may have zero, one, or many Clubs. NOT stored here: event participation (-> BOOKINGS), club membership (-> CLUB_USERS), club sponsorship (-> CLUB_SPONSORSHIPS), event sponsorship / organization links (-> EVENT_ORGANIZATIONS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_ClubEvent | uuid | NOT NULL | gen | PK | ID of the relation itself. Example `clubevent_001`. |
| ID_Club | uuid | NOT NULL | - | CLUBS.ID_Club | |
| ID_Event | uuid | NOT NULL | - | EVENTS.ID_Event | |
| club_event_role | enum (or FK) | NOT NULL | - | - | Club's role in the Event. Doc says "Enum/FK". |
| is_primary | bool | NOT NULL | (not stated; false sensible) | - | Marks the main Club when several are linked; used for reporting and financial defaults. |
| status | enum | NOT NULL | `active` (doc: "active is enough in most cases") | - | |
| notes | text | NULL | - | - | Internal note. |
| created_at | timestamptz | NOT NULL | now() | - | |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | |

## Enums / allowed values
- **club_event_role** (V1): `organizer` (main club of the event; sets main community context), `co_organizer` (second club co-organizing), `partner` (contributes but not main organizer). Possible later (V2/optional): `supporting_club`, `host_club` — not in V1.
- **status**: `active`, `inactive`, `cancelled`, `ended`.

## Constraints & indexes
- PK ID_ClubEvent.
- Preferred V1 rule: partial unique on (ID_Club, ID_Event) WHERE status = 'active' — one active row per Club+Event (role is single field) — CLEVT-D02. (Looser alternative considered: unique on (ID_Club, ID_Event, club_event_role) active.)
- Per Event: if count of club relations > 0 then exactly one row with is_primary = true (partial unique on ID_Event WHERE is_primary AND active, plus existence check) — CLEVT-D05.
- Check (V1 rule, "preferably"): is_primary = true => club_event_role = 'organizer' — CLEVT-D06.

## Relationships
- N:1 CLUBS, N:1 EVENTS; Clubs N:N Events.
- EVENT_SERIES -> EVENTS -> CLUB_EVENTS -> CLUBS (series not directly linked to clubs; derivable).
- Scope chain: CLUB_USERS (user is club_lead of club) + CLUB_EVENTS (event belongs to club) => event-scoped management allowed.

## Business rules / data rules
1. CLEVT-D01: Each row linked to valid Club and Event.
2. CLEVT-D02: Max one active relation per Club + Event at a time.
3. CLEVT-D03: An Event may have no Club (e.g. Independent Talk, Open Community Event, Corporate Private Event); club relation not mandatory for EVENTS.
4. CLEVT-D04: An Event may be linked to multiple Clubs.
5. CLEVT-D05: A club-linked Event must have exactly one primary Club.
6. CLEVT-D06: Primary Club should preferably have organizer role.
7. CLEVT-D07: Club relation does not imply Event participation (club members are not auto-participants; participation via BOOKINGS).
8. CLEVT-D08: Club relation does not replace Organization or sponsorship relations.
9. CLEVT-D09: Club Lead's Event scope can be validated through this relation.
10. CLEVT-D10: Event's default Financial Center derived when needed from the primary Club's ID_FinancialCenter; the actual DOCUMENT_ITEM still stores the Financial Center as a snapshot.
11. No hard delete, especially after Event published — close with status = ended or inactive. Wrong relations at draft stage may be deleted (operational decision).
12. club_event_role and is_primary are separate fields (kept separate for flexibility).

## Superseded / rejected ideas
- Single EVENTS.ID_Club FK — rejected (assumes one club per event).
- Same Club holding two roles in same Event — considered unnecessary; one active row per Club+Event preferred.
- Directly linking EVENT_SERIES to CLUBS — not needed.
- Expanding roles (supporting_club, host_club) in V1 — deferred.

## Open questions
- Final table name: EVENT_CLUBS (author's preference) vs CLUB_EVENTS (file name). Other docs (CLUBS.md) use EVENT_CLUBS.
- club_event_role as enum vs FK to a lookup table left open.
- Whether is_primary => organizer is a hard check or soft ("tercihen"/preferably).

## Example row
Event "AI in English Workshop":
- `ID_ClubEvent=clubevent_1001, ID_Club=club_AI, ID_Event=event_AI_ENGLISH_01, club_event_role=organizer, is_primary=true, status=active`
- `ID_ClubEvent=clubevent_1002, ID_Club=club_ENGLISH, ID_Event=event_AI_ENGLISH_01, club_event_role=co_organizer, is_primary=false, status=active`
