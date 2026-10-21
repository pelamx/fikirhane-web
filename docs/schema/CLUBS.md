# CLUBS

## Purpose
Master table of Fikirhane's permanent communities / interest / working groups (e.g. Working Club, English Club, Spanish Club, Russian Club, AI Club, Math Club). One row = one persistent community (Club = permanent community; Event = activity at a specific date/time). CLUBS stores only the Club's identity and base structure. NOT stored here: admins/leads and members (-> CLUB_USERS), events (-> EVENT_CLUBS / CLUB_EVENTS junction), sponsors (-> CLUB_SPONSORSHIPS), interests (-> CLUB_INTERESTS), finances (-> linked FINANCIAL_CENTERS row via DOCUMENT_ITEMS), and any counts/KPIs (derived).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Club | uuid | NOT NULL | gen | PK | Unique, immutable. Example ids in doc: `club_001`, `club_ENGLISH`. Referenced by CLUB_USERS.ID_Club, EVENT_CLUBS.ID_Club, CLUB_SPONSORSHIPS.ID_Club. |
| club_code | text | NOT NULL | - | - | Technical stable code, UNIQUE (e.g. WORKING, ENGLISH, SPANISH, RUSSIAN, AI, MATH). Should stay as stable as possible even if club_name changes. |
| club_name | text | NOT NULL | - | - | Display name (e.g. "English Club"). May change. |
| club_description | text | NULL | - | - | Purpose/scope; shown on public club detail screen. |
| club_type | enum/text (controlled) | NULL | - | - | High-level category. Controlled field; no separate CLUB_TYPES table in V1. |
| cover_image | text (file reference/URL) | NULL | - | (file ref) | Cover image for club detail page. Store file reference/URL, not binary. |
| logo | text (file reference/URL) | NULL | - | (file ref) | Optional logo/icon. |
| ID_FinancialCenter | uuid | NOT NULL | - | FINANCIAL_CENTERS.ID_FinancialCenter | UNIQUE. Each Club has exactly one Financial Center. |
| status | enum | NOT NULL | (not stated; `draft` sensible) | - | Club lifecycle status. |
| sort_order | int | NULL | - | - | UI ordering (e.g. 10, 20, 30, 40). |
| created_at | timestamptz | NOT NULL | now() | - | |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | |

## Enums / allowed values
- **club_type**: `workspace`, `language`, `technology`, `education`, `professional`, `social`. Examples: Working Club -> workspace; English Club -> language; AI Club -> technology.
- **status**:
  - `draft` — being prepared, not public
  - `active` — active club
  - `inactive` — temporarily not operating
  - `archived` — no longer used, but historical relations preserved

## Constraints & indexes
- PK ID_Club (unique, immutable) — CLUB-D01.
- UNIQUE(club_code) — CLUB-D02.
- ID_FinancialCenter NOT NULL + UNIQUE (1:1 Club -> Financial Center) — CLUB-D03, CLUB-D04.

## Relationships
- CLUBS 1:1 FINANCIAL_CENTERS (every Club has exactly one FC; an FC need not be a Club, e.g. Cafeteria, General).
- CLUBS 1:N CLUB_USERS N:1 USERS (members, leads, moderators, sponsor reps).
- CLUBS N:N EVENTS via EVENT_CLUBS (a.k.a. CLUB_EVENTS); events can be co-organized by multiple clubs.
- CLUBS 1:N CLUB_SPONSORSHIPS N:1 ORGANIZATIONS.
- CLUBS N:N INTERESTS via CLUB_INTERESTS (optional, for discovery/matching).
- Club–Skill relation possible later; not required in V1.

## Business rules / data rules
1. CLUB-D01: ID_Club unique and immutable.
2. CLUB-D02: club_code unique.
3. CLUB-D03: Every Club linked to exactly one Financial Center.
4. CLUB-D04: ID_FinancialCenter unique across Club rows (same FC never shared by two Clubs). Not every FC is a Club.
5. CLUB-D05: Club managers defined via CLUB_USERS (club_role = club_lead / club_admin), never on CLUBS — clubs can have multiple managers, managers change over time, history kept, same user can have different roles in different clubs.
6. CLUB-D06: Events not embedded in Club; use EVENT_CLUBS relation (N:N).
7. CLUB-D07: Sponsor information not stored on Club (dated commercial relation -> CLUB_SPONSORSHIPS).
8. CLUB-D08: Club is independent of Fikirhane Membership (MEMBERSHIP = general Fikirhane membership; CLUB_USERS = relation within a club). A Member may not be in a club; a Visitor may attend club events.
9. CLUB-D09: Archived Club cannot be used for new Event/Member relations.
10. CLUB-D10: A Club with usage history must not be hard-deleted; use status = archived (may be linked to Club Users, Events, Sponsorships, Financial records, Documents, Analytics).
11. Club finance tracked via ID_FinancialCenter on DOCUMENT_ITEMs (e.g. FC = English Club with category Event Revenue / Tutor Expense / Sponsorship Revenue) -> club-level contribution.
12. Per-user club level (new/regular/active/core) lives on CLUB_USERS, not CLUBS.
13. Club Manager performance (revenue, direct expense, contribution, attendance, repeat attendance, event count, sponsorship) measured via Club + Financial Center reporting; not CLUBS fields.
14. Club status and Event status are independent lifecycles (Club active while an Event is draft/cancelled/published).
15. Interests must not be stored as interest_1, interest_2 columns.
16. member_count is derived: COUNT of active CLUB_USERS.

## Superseded / rejected ideas
- CLUBS.ID_AdminUser / admin_user_id — rejected; use CLUB_USERS.
- member_count, event_count — rejected; derived.
- sponsor_name — rejected; CLUB_SPONSORSHIPS.
- current_revenue, current_profit — rejected; derived from Financial Center.
- event_price, location, schedule — rejected; belong to events.
- interest_1, interest_2… columns — rejected; CLUB_INTERESTS.
- Single EVENTS.ID_Club FK — rejected in favor of N:N.
- Separate CLUB_TYPES table — not needed in V1.
- Storing image binaries in DB — rejected; file reference/URL.
- club level on CLUBS — rejected; CLUB_USERS.

## Open questions
- CLUB_INTERESTS ("can be added if needed") and Club–Skill relation not finalized for V1.
- Default value for status not stated.
- Doc mentions club_role `club_admin / club_lead` here, but CLUB_USERS role set has no `club_admin`.

## Example row
`ID_Club=club_ENGLISH, club_code=ENGLISH, club_name="English Club", club_description="English conversation, networking and learning events for Fikirhane community members.", club_type=language, cover_image=file_english_01, logo=file_english_logo, ID_FinancialCenter=fc_ENGLISH, status=active, sort_order=20, created_at=2026-09-22 14:00, created_by_user_id=usr_admin, updated_at=2026-09-22 14:00, updated_by_user_id=usr_admin`

## Seed data
Clubs named in doc (code / name / type / sort_order where stated):
| club_code | club_name | club_type | sort_order |
|---|---|---|---|
| WORKING | Working Club | workspace | 10 |
| ENGLISH | English Club | language | 20 |
| SPANISH | Spanish Club | (language implied) | 30 |
| RUSSIAN | Russian Club | (language implied) | - |
| AI | AI Club | technology | 40 |
| MATH | Math Club | (not stated) | - |
