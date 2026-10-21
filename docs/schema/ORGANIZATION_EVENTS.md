# ORGANIZATION_EVENTS

## Purpose
N:N junction between EVENTS and ORGANIZATIONS. Author prefers the name **EVENT_ORGANIZATIONS** (EVENTS is the main entity; "the Event's Organization relations"); ORGANIZATION_EVENTS also works technically. One row = one Organization's concrete role in one specific Event (e.g. AI Summit: ABC Teknoloji -> sponsor, XYZ Üniversitesi -> co_organizer, Startup Hub -> partner). NOT stored here: org's general classification (-> ORGANIZATION_ROLES), club sponsorship (-> CLUB_SPONSORSHIPS), org representatives (-> ORGANIZATION_USERS), persons with event duties e.g. speakers (-> EVENT_USERS), money (-> DOCUMENTS / DOCUMENT_ITEMS; this is not a financial ledger).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_EventOrganization | uuid | NOT NULL | gen | PK | Relation's own id. Example `evorg_001`. |
| ID_Event | uuid | NOT NULL | - | EVENTS.ID_Event | |
| ID_Organization | uuid | NOT NULL | - | ORGANIZATIONS.ID_Organization | |
| organization_event_role | enum (doc: "Enum/FK"; V1 = enum) | NOT NULL | - | - | Org's role in this Event; controlled list. |
| status | enum | NOT NULL | `active` (most relations) | - | |
| is_primary | bool | NOT NULL | (not stated; false sensible) | - | Main org among several in the SAME role (esp. organizer, sponsor). |
| start_at | timestamptz | NULL | - | - | Relation start; optional in V1 (event already dated; useful if relation starts before/ends after event). |
| end_at | timestamptz | NULL | - | - | Relation end; optional in V1. |
| notes | text | NULL | - | - | Internal note; partner role details may be described here. |
| created_at | timestamptz | NOT NULL | now() | - | |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | |

## Enums / allowed values
- **organization_event_role** (V1):
  - `organizer` — main institutional organizer (e.g. XYZ University); distinct from which User created the event record
  - `co_organizer` — co-organizing institution (e.g. Fikirhane + University)
  - `partner` — general collaboration; details via business rules or notes
  - `sponsor` — sponsor of this Event (club sponsorship separate)
  - `content_partner` — contributes event content (e.g. training company provides workshop content)
  - `venue_partner` — venue partner if event held at another venue; may not be needed for normal Fikirhane Locations
  - Later if needed (V2/optional): `media_partner`, `community_partner`, `education_partner`
- **status**: `active`, `inactive`, `cancelled`, `ended`.

## Constraints & indexes
- PK ID_EventOrganization.
- Partial unique: UNIQUE(ID_Event, ID_Organization, organization_event_role) WHERE status = 'active' (EVORG-D03). Same org may hold multiple roles in same event as separate rows (e.g. ABC Ltd sponsor + content_partner).
- organization_event_role CHECK in controlled list (EVORG-D02).
- (Implied, not explicitly stated) at most one is_primary = true per (ID_Event, organization_event_role).

## Relationships
- N:1 EVENTS, N:1 ORGANIZATIONS; EVENTS N:N ORGANIZATIONS.
- Realistic sponsor-rep model = 3 separate relations: EVENT_ORGANIZATIONS (ABC Ltd -> AI Summit -> sponsor), ORGANIZATION_USERS (Ahmet -> ABC Ltd -> representative), EVENT_USERS (Ahmet -> AI Summit -> speaker).

## Business rules / data rules
1. EVORG-D01: Each row linked to valid Event and Organization.
2. EVORG-D02: organization_event_role is a controlled list.
3. EVORG-D03: No duplicate active row for same Event + Organization + Role.
4. EVORG-D04: Relation produces no User permissions.
5. EVORG-D05: Relation does not substitute for financial transactions; sponsor revenue flows through DOCUMENTS (direction = sale, ID_Organization = ABC Ltd) and DOCUMENT_ITEMS (description "AI Summit Event Sponsorship", ID_FinancialCenter = AI Club, ID_FinancialCategory = Sponsorship Revenue).
6. EVORG-D06: Event sponsor role not to be confused with Club Sponsorship (same org may be AI Club annual sponsor AND AI Summit event sponsor — different levels).
7. EVORG-D07: Org representatives via ORGANIZATION_USERS; event staff/people via EVENT_USERS.
8. EVORG-D08: Historical org relations preserved when Event cancelled/completed — no hard delete; Event gets status = cancelled; relation rows may stay or be set to ended/cancelled.
9. Relation independent of finance: partner may exist with no payment (University -> co_organizer, no financial transaction).
10. Multiple roles for same org in same event = multiple rows (preferred over multi-role in one row).
11. EVENTS.created_by_user_id (who created the DB record) ≠ organizer organization.
12. ORGANIZATION_ROLES (general capacity, e.g. ABC -> sponsor) vs EVENT_ORGANIZATIONS (role in a specific event, e.g. ABC -> Event #123 -> sponsor): master classification vs actual relation.

## Superseded / rejected ideas
- Single EVENTS.ID_Organization FK — rejected.
- Multiple roles stored in one relation row — rejected.
- SERIES_ORGANIZATIONS (series-level org relation) — not in V1; maybe later for big programs.
- EVENT_ORGANIZATION_ROLES master table — not in V1; enum suffices; open later if roles gain permission / display config / branding rules / ordering behavior.

## Open questions
- Final table name: EVENT_ORGANIZATIONS (preferred) vs ORGANIZATION_EVENTS (file name).
- Whether to set relation status to ended/cancelled on event cancellation ("istersen" — optional).
- Enum vs FK for organization_event_role long-term.

## Example row
`ID_EventOrganization=evorg_1001, ID_Event=event_AI_SUMMIT_2026, ID_Organization=org_ABC_TECH, organization_event_role=sponsor, status=active, is_primary=true, start_at=NULL, end_at=NULL, notes="Main event sponsor.", created_at=2026-09-22 17:30, created_by_user_id=usr_ADMIN, updated_at=2026-09-22 17:30, updated_by_user_id=usr_ADMIN`

## Note: unrelated appended content in source file
Lines ~545–713 of ORGANIZATION_EVENTS.md are about EVENT_OPTIONS, not this table. Key points (for the EVENT_OPTIONS owner): EVENT_OPTIONS = bookable physical variant of an Event (fields ID_Event, ID_Location, ID_SpaceSetup, capacity, booking_unit, price_adjustment, status); EVENTS 1:N EVENT_OPTIONS with no limit; every Event has at least one option even if single-location; BOOKING always -> ID_Event + ID_EventOption; EVENT_LOCATIONS rejected as redundant. Examples: Fikirhane U-Shape cap 16 +0 (800 TL), Atölye Classroom cap 12 -50 TL (750 TL), Studio Boardroom cap 8 (900 TL), Terrace.
