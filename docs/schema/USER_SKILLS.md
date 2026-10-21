# USER_SKILLS

## Purpose
USER_SKILLS is the N:N junction between USERS and SKILLS: one row = "this user has this controlled skill", plus user-specific attributes (optional level, priority, verification). It represents the user's CURRENT skill profile (not historical snapshots). Skill definitions live in SKILLS; skill columns must not exist on USERS (no USERS.skill_1/skill_2...). Contextual "what I can offer now" goes in OFFERS, and interests go in USER_INTERESTS.

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_UserSkill | uuid | NOT NULL | gen uuid | PK | Relation's own ID (not the user's or skill's). Example `uskill_001`. |
| ID_User | uuid | NOT NULL | – | USERS.ID_User | Owning user. |
| ID_Skill | uuid | NOT NULL | – | SKILLS.ID_Skill | The skill. |
| skill_level | text / enum | NULL | – | – | User's level in this skill. OPTIONAL (self-assessment, not always reliable; not all skills fit one level scale). Recommended for V1. |
| priority | int | NULL | – | – | Importance/order within profile (1 = most important). Top skills shown first; can be a matching weight. Recommended for V1. |
| is_verified | bool | NOT NULL | false | – | false = self-declared; true = verified by Fikirhane. Include only if a verification process will actually be used (otherwise may be omitted). |
| verified_by_user_id | uuid | NULL | – | USERS.ID_User | Who verified (e.g. Fikirhane Admin). Only with is_verified. |
| verified_at | timestamptz | NULL | – | – | When verified. Only with is_verified. |
| status | enum | NOT NULL | `active` | – | Whether the relation is active. |
| created_at | timestamptz | NOT NULL | now() | – | Relation creation time. |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Creator (normally the user themself). |
| updated_at | timestamptz | NOT NULL | now() | – | Last update. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifier. |

## Enums / allowed values
- **status**: `active`, `inactive` (user removed the skill from profile -> `inactive`).
- **skill_level** (no single enforced set; two example scales):
  - general: `beginner`, `intermediate`, `advanced`, `expert`
  - language (CEFR): `A1`, `A2`, `B1`, `B2`, `C1`, `C2`, `native`
  - Note: e.g. "Spanish -> B2" is meaningful, "Project Management -> B2" is not. Per-skill-type level sets are a future idea, not V1.

## Constraints & indexes
- PK: ID_UserSkill.
- FK ID_User -> USERS.ID_User; FK ID_Skill -> SKILLS.ID_Skill (both NOT NULL).
- Partial UNIQUE (ID_User, ID_Skill) WHERE status = 'active' — max 1 active record per user+skill (USKL-D02).
- On insert: referenced SKILLS.status must be `active` (USKL-D03) — app/trigger check.
- Optional consistency: if is_verified = true then verified_by_user_id / verified_at should be set.
- Index on ID_Skill (matching queries), ID_User.

## Relationships
- USERS 1 — N USER_SKILLS; SKILLS 1 — N USER_SKILLS (USERS N:N SKILLS).
- verified_by_user_id, created_by_user_id, updated_by_user_id -> USERS.ID_User.

## Business rules / data rules
1. USKL-D01: Every row must reference a valid User and Skill.
2. USKL-D02: No duplicate active record for the same User + Skill.
3. USKL-D03: Only active SKILLS master records can be selected for new user skills.
4. USKL-D04: skill_level is optional (not mandatory; selecting e.g. "SketchUp" alone is sufficient).
5. USKL-D05: Skill level lives on this relation, not on SKILLS.
6. USKL-D06: Number of skills per user may be limited by business rule (e.g. `max_active_skills = 12`; 10–15 range sensible; profile shows top 3–5). Limit is a rule, not a column.
7. USKL-D07: Inactive user skills are not used in matching or profile display.
8. USKL-D08: Skill visibility depends on User privacy/networking rules (not on this table).
9. USKL-D09: If self-declared vs verified skills are distinguished, verification data is stored on this relation.
10. Flow: Profile -> Skills -> Select Skill (from SKILLS where status=active) -> USER_SKILLS created. No free-text canonical skills; "suggest new term" is a separate feature.
11. Removal: set status = inactive. Hard delete is technically acceptable (not a financial/legal record), but keeping status is useful for historical analysis.
12. No historical snapshot in V1: level changes overwrite (e.g. Intermediate -> Advanced). Preserving level as of a past event would require a separate snapshot mechanism (out of V1 scope).
13. Uses: networking matching (Need "looking for someone experienced in SketchUp" vs USER_SKILLS), event participant suggestions, advanced-group suggestions. Do NOT enforce automatic event eligibility from skills in V1.
14. Skill ≠ Offer: skill is general competency; Offer is what the user currently wants to offer the community.

## Superseded / rejected ideas
- USERS.skill_1 / skill_2 / skill_3 columns — rejected (junction table instead).
- Mandatory skill_level — rejected.
- One universal level scale for all skills — rejected; per-skill-type level sets deferred.
- Historical skill snapshots per event — not in V1.
- Automatic event eligibility based on skills — not in V1.

## Open questions
- Whether to include is_verified / verified_by_user_id / verified_at in V1 (depends on whether verification process exists).
- Exact skill_level allowed values / whether enforced as enum.
- Hard delete vs inactive on removal (both allowed; inactive preferred if history analysis needed).
- Exact max active skills value (12 given as example; 10–15 range).

## Example row
`ID_UserSkill=uskill_001, ID_User=usr_Ahmet, ID_Skill=skill_PROJECT_MANAGEMENT, skill_level=advanced, priority=1, is_verified=false, verified_by_user_id=NULL, verified_at=NULL, status=active, created_at=2026-09-22 16:00, created_by_user_id=usr_Ahmet, updated_at=2026-09-22 16:00, updated_by_user_id=usr_Ahmet`
