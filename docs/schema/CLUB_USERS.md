# CLUB_USERS

## Purpose
N:N junction between USERS and CLUBS. One row = one period of a User's persistent relation with a Club, including that user's functional role in the club and the relation's lifecycle. All club roles (member, lead, moderator, sponsor rep) live here — no separate CLUB_MEMBERS / CLUB_ADMINS / CLUB_MODERATORS tables. NOT stored here: event participation (-> BOOKINGS), Fikirhane general membership (-> USER_MEMBERSHIPS / MEMBERSHIP), global system roles (-> USER_ROLES), role definitions (-> CLUB_MEMBER_ROLES).

## Final fields
Note: CLUB_USERS.md defines `club_role` as an enum; the later CLUB_MEMBER_ROLES.md says that if CLUB_MEMBER_ROLES is used, `club_role` enum should be replaced by FK `ID_ClubMemberRole`. Listed here as the final design, with club_role as the superseded alternative.

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_ClubUser | uuid | NOT NULL | gen | PK | ID of the relation record itself (not club's or user's). Example `clubusr_001`. |
| ID_Club | uuid | NOT NULL | - | CLUBS.ID_Club | |
| ID_User | uuid | NOT NULL | - | USERS.ID_User | |
| ID_ClubMemberRole | uuid | NOT NULL | - | CLUB_MEMBER_ROLES.ID_ClubMemberRole | User's functional role in this club (replaces club_role enum). |
| club_level | enum | NULL | - | - | Engagement level in the club (not a role). Optional. |
| status | enum | NOT NULL | (not stated; `active` sensible) | - | Relation status. |
| start_date | date (or timestamptz) | NOT NULL | - | - | When relation began. |
| end_date | date (or timestamptz) | NULL | NULL | - | When relation ended; NULL while active. |
| joined_source | enum/text | NULL | - | - | How the user joined. Not required in V1 (V2/optional). |
| notes | text | NULL | - | - | Internal ops note; never shown on public profile. |
| created_at | timestamptz | NOT NULL | now() | - | |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | |

## Enums / allowed values
- **club_role** (original enum; now values of CLUB_MEMBER_ROLES.role_code in uppercase):
  - `member` — normal club participant, no management rights
  - `club_lead` — main club manager; scoped permissions e.g. `club.update`, `club_members.view`, `club_members.manage`, `club_events.create`, `club_events.update`, `club_analytics.view` — only for that club
  - `co_lead` — like club lead but more limited (e.g. event create, event edit, members view; possibly no sponsor/finance management)
  - `moderator` — helps community operations (participant list view, attendance, community moderation)
  - `sponsor_representative` — real User representing the club's sponsor organization (the Organization itself never becomes Club Admin)
- **club_level**: `new` (first few attendances), `regular` (comes regularly), `active` (frequently attends / contributes), `core` (club's core community).
- **status**: `active` (currently related), `inactive` (temporarily not active), `suspended` (temporarily removed from club relation), `ended` (relation ended).
- **joined_source**: `self_join`, `admin_added`, `invitation`, `event_conversion`, `sponsor_nomination`.

## Constraints & indexes
- PK ID_ClubUser.
- Partial unique: at most one active record per (ID_User, ID_Club) — e.g. UNIQUE(ID_User, ID_Club) WHERE status = 'active' (CLU-D02). Multiple historical periods allowed (2025 member -> ended; 2026 member -> active).
- V1: single active role per user per club (one row; club_lead implies member — no separate member row).
- Optional business rule (business decision, not mandatory): max 1 active club_lead per club (CLUB_MEMBER_ROLES.md states it as "max 1 active Club Lead per club", checked via CLUB_USERS).
- end_date NULL while active.

## Relationships
- N:1 CLUBS, N:1 USERS, N:1 CLUB_MEMBER_ROLES.
- A User can belong to many clubs; a Club has many users.
- Sponsor rep scenario combines three relations: CLUB_SPONSORSHIPS (Org <-> Club), ORGANIZATION_USERS (User <-> Org), CLUB_USERS (User <-> Club, role sponsor_representative).

## Business rules / data rules
1. CLU-D01: Every row linked to a valid User and Club.
2. CLU-D02: Max one active relation per User + Club at a time.
3. CLU-D03: Club role valid only within that club's scope. Effective authorization = Scoped Role + Club Relation + Permission Mapping (e.g. club_lead may `event.update_details` only if the event belongs to that club).
4. CLU-D04: Club membership must not be confused with Fikirhane Membership (Premium member may be club member; a Visitor may be a club member if policy allows).
5. CLU-D05: Club event attendance does not automatically create club membership. Controlled flow: Event attendance -> club join invitation / user opt-in -> CLUB_USERS created.
6. CLU-D06: When relation ends, don't delete; close with status/end_date. Lead change: old lead row status=ended + end_date; new lead row status=active + start_date (management history preserved).
7. CLU-D07: Club Lead/Admin not stored on CLUBS.
8. CLU-D08: Global system roles not stored in CLUB_USERS; and club_lead must NOT be written to global USER_ROLES (would lose scope).
9. CLU-D09: club_level and club_role are separate concepts (role = what person can do; level = how involved).
10. CLU-D10: New Club User relations for archived/inactive Clubs blocked by business rule.
11. club_level initially manual; ideally derived from signals (attendance count, repeat attendance, referrals, event contribution, volunteering) using simple classification, not an opaque score.
12. Role is not stored on USERS since same user can have different roles in different clubs.
13. A club may have several leads/co-leads (e.g. 1 club_lead + 2 co_leads).
14. Inactive/archived roles (CLUB_MEMBER_ROLES) cannot be assigned to new rows.

## Superseded / rejected ideas
- Separate CLUB_MEMBERS, CLUB_ADMINS, CLUB_MODERATORS tables — rejected.
- `club_role` plain enum — superseded by ID_ClubMemberRole FK (per CLUB_MEMBER_ROLES.md).
- Multiple concurrent role rows per user per club (e.g. club_lead + member) — rejected for V1; CLUB_USER_ROLES junction possible later if needed.
- Auto-creating CLUB_USERS after every event attendance — rejected.
- Storing club_lead in global USER_ROLES — rejected.
- Opaque engagement score for club_level — rejected in favor of simple classification.
- Hard delete of ended relations — rejected.

## Open questions
- Whether "max 1 active club_lead per club" is enforced (business decision).
- start_date/end_date type: Date vs Timestamp left open.
- club_level: manual vs derived — manual first, derivation later.
- CLUBS.md mentions `club_admin` role; not in this role set.

## Example row
`ID_ClubUser=clubusr_001, ID_Club=club_ENGLISH, ID_User=usr_AHMET, club_role=club_lead (-> ID_ClubMemberRole=CLUB_LEAD), club_level=core, status=active, start_date=2026-09-01, end_date=NULL, joined_source=admin_added, notes=NULL, created_at=2026-09-01 10:00, created_by_user_id=usr_ADMIN, updated_at=2026-09-01 10:00, updated_by_user_id=usr_ADMIN`
