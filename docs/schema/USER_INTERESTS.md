# USER_INTERESTS

## Purpose
USER_INTERESTS is the N:N junction between USERS and INTERESTS: one row = "this user has selected this controlled interest", optionally ranked by priority. It is live/current-state profile data and one of the networking/matching inputs. It does NOT store level/proficiency/notes (those belong to the Skill concept, USER_SKILLS), visibility (User/Event privacy and networking rules), or historical event snapshots. Interest definitions live in INTERESTS; dynamic Needs are a separate entity.

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_UserInterest | uuid | NOT NULL | gen uuid | PK | Relation's own ID. Example `ui_001`. |
| ID_User | uuid | NOT NULL | – | USERS.ID_User | Owning user. |
| ID_Interest | uuid | NOT NULL | – | INTERESTS.ID_Interest | Selected interest. |
| priority | int | NULL | – | – | Ordering within user's interests (1 = most important). Optional; could be omitted in V1 if simple selected/not-selected suffices, but author finds it useful for matching. |
| status | enum | NOT NULL | `active` | – | Relation active or not. |
| created_at | timestamptz | NOT NULL | now() | – | When interest was selected (useful for matching/profile history). |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Normally same user; may differ if added by admin/onboarding. |
| updated_at | timestamptz | NOT NULL | now() | – | Last change. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifier. |

## Enums / allowed values
- **status**: `active`, `inactive`.

## Constraints & indexes
- PK: ID_UserInterest.
- FKs NOT NULL: ID_User -> USERS.ID_User; ID_Interest -> INTERESTS.ID_Interest.
- Partial UNIQUE (ID_User, ID_Interest) WHERE status = 'active' (UINT-D02).
- On insert: INTERESTS.status must be `active` (UINT-D03).
- Optional: max active interests per user enforced by business rule (e.g. `max_active_interests = 10`).
- Index on ID_Interest (matching), ID_User.

## Relationships
- USERS 1 — N USER_INTERESTS; INTERESTS 1 — N USER_INTERESTS (USERS N:N INTERESTS).
- Used together with EVENT_INTERESTS for event/user matching.
- Audit user FKs -> USERS.ID_User.

## Business rules / data rules
1. UINT-D01: Every record references a valid User and Interest.
2. UINT-D02: No duplicate active record for same User + Interest.
3. UINT-D03: Only active master Interests can be selected for new relations.
4. UINT-D04: Number of active interests per user may be limited by business rule (suggested 8–10, e.g. `max_active_interests = 10`; profile shows top 3–5). Limit is a rule, not a field.
5. UINT-D05: Interest level/proficiency must not be stored here (do not confuse with Skill).
6. UINT-D06: When a user removes an interest it must not be used in new matching.
7. UINT-D07: A user's interest selection cannot be changed by other users; only an admin with the appropriate permission is an exception.
8. UINT-D08: Visibility is not this table's concern; it is governed by User/Event privacy and networking rules (e.g. `USERS.networking_enabled = true` plus event visibility rules required to show interests on participant profile).
9. Flow: User Profile -> Interests -> Select from controlled list (INTERESTS.status = active) -> USER_INTERESTS created.
10. Free text not allowed into canonical list; "Suggest new interest" is separate and suggestions must not become active INTERESTS rows directly; admin curates.
11. Removal: either status = inactive or hard delete — both acceptable (not financial/legal history). Preferred: keep simple for active profile, use inactive to preserve history when needed.
12. Priority semantics: 1 = most important, 2 = second, ... Preferred over an `is_primary` boolean because it allows multiple ranked top interests.
13. No historical snapshot in V1; if past-event interest display must be preserved, a separate snapshot mechanism is needed (stored separately, not here).
14. Matching use: EVENT_INTERESTS ∩ USER_INTERESTS -> event recommendations, similar participant suggestions, networking matches.

## Superseded / rejected ideas
- USERS.interest_1 / interest_2 / interest_3 columns — rejected.
- proficiency / level / notes fields — rejected (Skill concept).
- `is_primary` boolean — considered, priority preferred.
- Historical snapshots in V1 — rejected (unnecessary complexity).

## Open questions
- Whether priority is included in V1 (optional; author leans yes).
- Hard delete vs inactive on removal (both allowed).
- Exact max active interests (8–10; 10 example).

## Example row
`ID_UserInterest=ui_001, ID_User=usr_Ahmet, ID_Interest=int_AI, priority=1, status=active, created_at=2026-09-22 16:00, created_by_user_id=usr_Ahmet` (second: `ui_002, usr_Ahmet, int_REAL_ESTATE, priority=2, status=active`)
