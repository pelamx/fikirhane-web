# USERS

## Purpose
One row = one real person who has an identity in the Fikirhane system (the master person record). A person has exactly one USERS row no matter how many relationships they have (member, club lead, tutor, organization admin, etc.); all those relationships live in relationship tables. USERS holds core identity, account status, main profile info, system identity and audit fields.
NOT stored here: membership type/status (-> MEMBERSHIPS / MEMBERSHIP_TYPES), system/global roles (-> USER_ROLES / ROLES), club roles (-> CLUB_USERS), event roles such as tutor/speaker/moderator (-> EVENT_USERS), organization roles (-> ORGANIZATION_USERS), permissions, booking history (-> BOOKINGS), payments, addresses (-> USER_ADDRESSES), emails (-> USER_EMAILS), phones (-> USER_PHONES), authentication data (-> AUTH_IDENTITIES), interests/skills (-> USER_INTERESTS / USER_SKILLS), needs/offers (-> NEEDS / OFFERS).

## Final fields
V1 field set (as stated in the doc):

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_User | uuid | NOT NULL | generated | PK | Immutable unique ID of the user. Doc example: `usr_01HXYZ...` or real UUID. All other tables reference users through this. Email/phone are never used as user ID. |
| first_name | text | NOT NULL | | | First name. |
| last_name | text | NOT NULL | | | Last name. |
| profile_photo | text (file id / URL) | NULL | | (file reference; doc says `file_id` or `image_url`) | Reference to profile photo; binary image is NOT stored in the DB. Used in profile, networking, participant lists, club members, event participant screen. |
| headline | text | NULL | | | Short professional description (e.g. "Architect & Entrepreneur"). Free text; NOT a Skill. Important for "physical LinkedIn" concept. |
| bio | text | NULL | | | Longer self-description (a few sentences). |
| account_status | enum | NOT NULL | (not stated; presumably `active`) | | System account status. See enums. |
| networking_enabled | bool | NOT NULL | (not stated) | | Global user preference: does the user participate in networking features. |
| profile_visibility | enum | NOT NULL | (not stated) | | Who can see the profile. See enums. |
| created_at | timestamptz | NOT NULL | now() | | System-generated; user cannot change. |
| created_by_user_id | uuid | NULL | | USERS.ID_User | Who created the record. NULL (or system identity) for normal signup; admin's user id if admin created the user. |
| updated_at | timestamptz | NOT NULL | now() | | Auto-updated on every update by the system. |
| updated_by_user_id | uuid | NULL | | USERS.ID_User | Last user who modified the record (self or admin). Only last change; full history in AUDIT_LOG. |

## Enums / allowed values
- account_status:
  - `active` — normal usable account
  - `suspended` — temporarily blocked by admin
  - `inactive` — account not in use but not closed/deleted
  - `deleted` — account considered deleted from the user's perspective, historical records preserved; NOT a physical delete
- profile_visibility: full proposal `private`, `event_participants`, `members`, `public`; simplified V1 option `private`, `community` (doc's example row uses `community`). Doc says the 2-value set "may be enough" for V1 — not firmly decided (see Open questions).

## Constraints & indexes
- PK ID_User (unique, immutable).
- No unique email/phone on USERS (they do not live here).

## Relationships
- USERS 1 — N AUTH_IDENTITIES (e.g. Google login + email login for same user)
- USERS 1 — N USER_EMAILS, USER_PHONES, USER_ADDRESSES
- USERS 1 — N MEMBERSHIPS — N:1 MEMBERSHIP_TYPES
- USERS 1 — N USER_ROLES — N:1 ROLES
- USERS 1 — N CLUB_USERS — CLUBS
- USERS 1 — N EVENT_USERS — EVENTS
- USERS 1 — N ORGANIZATION_USERS — ORGANIZATIONS
- USERS 1 — N USER_INTERESTS — INTERESTS
- USERS 1 — N USER_SKILLS — SKILLS
- USERS 1 — N NEEDS, OFFERS, BOOKINGS, INVITATIONS, FREEPASSES, DOCUMENTS
- USERS self-reference via created_by_user_id / updated_by_user_id.

## Business rules / data rules
1. USR-D01: ID_User must be unique and immutable.
2. USR-D02: As far as possible, one real person has one User record.
3. USR-D03: Users must not be hard deleted (use account_status = deleted).
4. USR-D04: Membership info must not be stored on USERS.
5. USR-D05: System role info must not be stored on USERS.
6. USR-D06: Club/Event/Organization scoped roles must not be stored on USERS.
7. USR-D07: Contact data is managed in separate contact tables.
8. USR-D08: Authentication secrets must not be stored in USERS.
9. USR-D09: created_at and updated_at are managed by the system.
10. USR-D10: Historical records of suspended/inactive/deleted users must be preserved.
11. account_status (can the person use the system?) is independent of membership (which commercial membership rights do they have?) — an active account may be Visitor, Member or Premium.
12. Networking visibility requires BOTH `EVENT.networking_enabled = true` AND `USERS.networking_enabled = true`. If user's networking_enabled = false: may not appear in networking matches, Need/Offer info not shown to other participants, profile may not appear on event networking screen.
13. networking_enabled (participates in networking?) and profile_visibility (who can see profile?) are distinct concepts.
14. Display full name is composed by UI from first_name + last_name.
15. Membership changes over time (e.g. Jan–Jun Member, Jul–Aug none, Sep– Premium) — this history is why membership is a separate table.
16. A user record alone must not reveal whether the person is Member/Tutor/Admin; that comes from related tables.

## Superseded / rejected ideas
- full_name field — rejected (duplicate, derivable).
- Storing profile image binary in DB — rejected (store file_id / URL).
- USERS.email as single login/contact field — rejected (login email -> auth layer, contact email -> USER_EMAILS).
- USERS.phone — rejected (-> USER_PHONES).
- USERS.address — rejected (-> USER_ADDRESSES).
- USERS.membership_type — rejected (-> MEMBERSHIPS).
- USERS.role — rejected (-> USER_ROLES).
- password / password_hash / Google ID / Apple ID / OTP data / reset token on USERS — rejected (-> AUTH_IDENTITIES).
- Interests/skills/needs/offers as USERS fields — rejected.
- Tutor / club_admin / organization_admin flags on USERS — rejected.

## Open questions
- profile_visibility value set: 4-value (`private, event_participants, members, public`) vs simplified V1 (`private, community`).
- Defaults for account_status, networking_enabled, profile_visibility not stated.
- profile_photo stored as file_id (FK to a files table?) vs URL — not decided.
- Whether normal signup sets created_by_user_id NULL or a "system identity".
- AUTH_IDENTITIES, USER_EMAILS, USER_PHONES, USER_ADDRESSES to be defined later.

## Example row
ID_User=usr_8f9c..., first_name=Ahmet, last_name=Yılmaz, profile_photo=file_4821, headline="Architect & Entrepreneur", bio="AI, architecture and real estate technologies.", account_status=active, networking_enabled=true, profile_visibility=community, created_at=2026-09-22 16:40, created_by_user_id=NULL, updated_at=2026-09-22 16:40, updated_by_user_id=NULL
