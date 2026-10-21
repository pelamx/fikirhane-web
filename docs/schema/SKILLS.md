# SKILLS

## Purpose
SKILLS is the system-wide, admin-curated controlled taxonomy (master dictionary) of competencies/skills that users can claim to "know / can do / be experienced in" (e.g. Python, SketchUp, Financial Modeling, Spanish). One row = one canonical skill, present exactly once regardless of how many users have it. It does NOT belong to a user: which user has which skill (and at what level) lives in USER_SKILLS. Skill level is NOT stored here (it belongs to the user-skill relation). Free-text, contextual "what I can help with" statements are OFFERS, not skills. Interests ("what I'm interested in") are a separate taxonomy (INTERESTS).

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Skill | uuid | NOT NULL | gen uuid | PK | Unique, immutable PK. Example `skill_001`. Referenced by USER_SKILLS.ID_Skill. Must never change. |
| skill_code | text | NOT NULL | – | – | Technical, stable UPPER_SNAKE code for code/integrations (e.g. `PROJECT_MANAGEMENT`). UNIQUE. |
| skill_name | text | NOT NULL | – | – | Human-readable display name (e.g. "Project Management"). Unique "would be good" (recommended, not mandatory). |
| category | text / enum (controlled field) | NOT NULL | – | – | Top-level skill group. Controlled value list, no separate table in V1. |
| description | text | NULL | – | – | Scope of the skill; useful to distinguish similar skills. |
| status | enum | NOT NULL | `active` (implied) | – | Availability: active / inactive / archived. |
| sort_order | int | NULL | – | – | UI ordering. Optional. |
| created_at | timestamptz | NOT NULL | now() | – | Creation time. |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Creating user. |
| updated_at | timestamptz | NOT NULL | now() | – | Last update time. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifying user. |

## Enums / allowed values
- **status**
  - `active` – selectable by new users.
  - `inactive` – no new selections allowed; existing user relations are kept.
  - `archived` – no longer used; historical records kept.
- **category** (controlled field, example values from doc): `Technology`, `Business`, `Finance`, `Creative`, `Language`, `Communication`, `Operations`, `Management`, `Data`, `Marketing`.
  - Examples: Python -> Technology; Financial Modeling -> Finance; Public Speaking -> Communication; Project Management -> Management.

## Constraints & indexes
- PK: ID_Skill (immutable).
- UNIQUE(skill_code) (SKL-D02).
- UNIQUE(skill_name) recommended ("unique olması iyi olur").
- category: CHECK / enum restricted to controlled list.
- status: CHECK IN ('active','inactive','archived').

## Relationships
- SKILLS 1 — N USER_SKILLS (USERS N:N SKILLS via USER_SKILLS).
- Future (not V1-mandatory): SKILLS 1 — N EVENT_SKILLS (event tagging), optional `skill_relation_type` on that relation.
- Future: SKILL_CATEGORIES master table could replace `category` text if categories grow.
- created_by_user_id / updated_by_user_id -> USERS.ID_User.

## Business rules / data rules
1. SKL-D01: ID_Skill is unique and immutable.
2. SKL-D02: skill_code is unique.
3. SKL-D03: Skill master list must be a controlled taxonomy (not free text) — free text causes duplicates like "Project Management / Project Mgmt / PM / Proje Yönetimi", breaking matching, filtering and reporting.
4. SKL-D04: Users cannot directly create canonical Skills. Users may "Suggest Skill"; admin reviews and adds it to the master list.
5. SKL-D05: User–Skill relationship is stored only in USER_SKILLS (no skill columns on USERS).
6. SKL-D06: Skill level is stored in USER_SKILLS (relation), never in SKILLS.
7. SKL-D07: Interest and Skill are separate concepts. The same term (e.g. "Spanish") may legitimately exist in both INTERESTS and SKILLS.
8. SKL-D08: Skill and Offer must not be mixed (SKILLS = controlled taxonomy; OFFERS = free text/dynamic).
9. SKL-D09: Inactive/archived skills are not shown for new selections; existing relations are preserved.
10. SKL-D10: Taxonomy must not become overly granular. Start with roughly 100–150 skills (somewhat more detailed than Interests); do not start with thousands.
11. skill_name is for UI; skill_code is for code and integrations.
12. Language skills (English, Spanish, Russian) are ordinary Skill rows; their levels (A1–C2, native) go in USER_SKILLS.skill_level, which is optional because not all skills fit one level system.
13. Per-user skill count limits are business rules, not fields here (suggested max 10–15 active skills; top 3–5 shown on profile).
14. Skills are used for networking matching (e.g. a user's Need "looking for someone experienced in Project Management" matched against other users' skills).

## Superseded / rejected ideas
- Free-text skill entry on users — rejected (controlled taxonomy instead).
- `level` column on SKILLS — rejected; level belongs to USER_SKILLS.
- Separate SKILL_CATEGORIES table — not in V1 (possible later).
- Alias/synonym table (e.g. PM, Project Mgmt, Proje Yönetimi) — not in V1 (possible later).
- Users creating canonical skills directly — rejected (suggest + admin review only).

## Open questions
- Whether skill_name must be enforced UNIQUE (only "good to have").
- Exact category value list (only examples given).
- Event–Skill relation (EVENT_SKILLS) and its `skill_relation_type` (`required`, `taught`, `relevant`) — deferred, "not required in V1".
- Skill-suggestion workflow storage (no table defined).
- Future per-skill-type level sets (mentioned in USER_SKILLS as later).

## Seed data
Example skill_codes: `PYTHON`, `SKETCHUP`, `PROJECT_MANAGEMENT`, `FINANCIAL_MODELING`, `DIGITAL_MARKETING`.
Example starter skill names (taxonomy sample): Software Development, Python, JavaScript, Data Analysis, Machine Learning, Prompt Engineering, Project Management, Product Management, Sales, Negotiation, Digital Marketing, Content Creation, Financial Modeling, Accounting, Investing, SketchUp, AutoCAD, Graphic Design, Photography, English, Spanish, Russian, Public Speaking, Facilitation, Teaching. Also mentioned: Excel, Real Estate Analysis.

## Example row
`ID_Skill=skill_001, skill_code=PROJECT_MANAGEMENT, skill_name="Project Management", category=Management, description="Planning, organizing and delivering projects within defined scope, time and resource constraints.", status=active, sort_order=10, created_at=2026-09-22 10:00, created_by_user_id=usr_admin, updated_at=2026-09-22 10:00, updated_by_user_id=usr_admin`
