# INTERESTS

## Purpose
INTERESTS is the system-wide, admin-curated controlled taxonomy (master dictionary) of topics users can say they are "interested in / want to learn / want to talk about" (e.g. Artificial Intelligence, Startups, Real Estate). One row = one canonical interest, stored once. It does NOT belong to a user and has no ID_User column: which user has which interest is in USER_INTERESTS; event/club tagging is in separate junctions (EVENT_INTERESTS, CLUB_INTERESTS). Skills ("what I can do") are in SKILLS; dynamic, specific Needs/Offers are separate free-text entities (NEEDS/OFFERS).

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Interest | uuid | NOT NULL | gen uuid | PK | Unique, immutable PK. Example `int_001`. Referenced by USER_INTERESTS.ID_Interest. Must not change. |
| interest_code | text | NOT NULL | – | – | Technical, stable UPPER_SNAKE code (e.g. `ARTIFICIAL_INTELLIGENCE`). UNIQUE. Never changes even if UI is localized (e.g. shown as "Yapay Zeka"). |
| interest_name | text | NOT NULL | – | – | Human-readable display name. Unique "generally good". |
| category | text / enum (controlled field) | NOT NULL | – | – | Top-level topic group; controlled field, no separate table in V1. |
| description | text | NULL | – | – | Scope of the interest; helps distinguish similar concepts. |
| status | enum | NOT NULL | `active` (implied) | – | active / inactive / archived. |
| sort_order | int | NULL | – | – | UI ordering (e.g. 10, 20, 30...). Optional. |
| created_at | timestamptz | NOT NULL | now() | – | Creation time. |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Creator. |
| updated_at | timestamptz | NOT NULL | now() | – | Last update. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifier. |

## Enums / allowed values
- **status**
  - `active` – selectable by new users.
  - `inactive` – no new selections; existing relations kept.
  - `archived` – no longer used; history kept.
- **category** (controlled field, example values): `Technology`, `Business`, `Creative`, `Finance`, `Lifestyle`, `Languages`, `Science`, `Society`, `Professional`.
  - Examples: Artificial Intelligence -> Technology; Entrepreneurship -> Business; Architecture -> "Creative / Professional" (doc ambiguous: single-valued field but example gives two).

## Constraints & indexes
- PK: ID_Interest (immutable).
- UNIQUE(interest_code) (INT-D02).
- UNIQUE(interest_name) recommended ("generally good").
- status CHECK IN ('active','inactive','archived').
- category restricted to controlled list.

## Relationships
- INTERESTS 1 — N USER_INTERESTS (USERS N:N INTERESTS).
- INTERESTS 1 — N EVENT_INTERESTS (future junction; "probably yes") for user–event interest matching.
- INTERESTS 1 — N CLUB_INTERESTS (future junction) for discovery/matching.
- Future: INTEREST_CATEGORIES, INTEREST_ALIASES.
- created_by_user_id / updated_by_user_id -> USERS.ID_User.

## Business rules / data rules
1. INT-D01: ID_Interest unique and immutable.
2. INT-D02: interest_code unique.
3. INT-D03: Canonical interest list is a controlled taxonomy (free text would create "AI / Artificial Intelligence / Yapay Zeka" duplicates and break matching, reporting, filtering, event participant matching).
4. INT-D04: Users cannot create master interests via free text. Users may "Suggest an Interest"; suggestions must not land directly as active INTERESTS rows; admin curates.
5. INT-D05: Interests link to users only via USER_INTERESTS, never by direct FK.
6. INT-D06: Interest and Skill are separate concepts; the same term may exist in both (e.g. Spanish).
7. INT-D07: Interest must not be mixed with Need/Offer (INTERESTS = controlled taxonomy; NEEDS = free text/dynamic).
8. INT-D08: Inactive/archived interests not shown for new selections; existing historical relations preserved.
9. INT-D09: Category is a controlled field in V1; no separate category table needed.
10. INT-D10: Taxonomy must not be unnecessarily granular. Start with ~60–80 interests at a mid-level granularity (too broad: "Technology"; too narrow: "Transformer Architecture Optimization").
11. Hard delete not recommended (use inactive/archived).
12. interest_name is for UI; interest_code for code/integration.
13. Per-user limit is a business rule, not a column here (suggested max 8–10; profile shows top 3–5).
14. Used for networking: common interests between event attendees shown as connection reason (e.g. "You both are interested in Artificial Intelligence.").

## Superseded / rejected ideas
- Free-text interest fields on users (interest_1/2/3) — rejected.
- ID_User column on INTERESTS — rejected (junction table).
- Users directly creating canonical interests — rejected.
- Separate INTEREST_CATEGORIES table — not V1.
- INTEREST_ALIASES (AI, Yapay Zeka, GenAI) — not V1.
- Very broad or very granular taxonomies — rejected.

## Open questions
- Exact category list; whether one interest can belong to multiple categories (Architecture example "Creative / Professional").
- Whether interest_name is strictly unique.
- EVENT_INTERESTS / CLUB_INTERESTS schemas not defined here.
- Localization approach for interest_name (only noted that code stays fixed).

## Seed data
Example interest_codes: `ARTIFICIAL_INTELLIGENCE`, `ENTREPRENEURSHIP`, `REAL_ESTATE`, `ARCHITECTURE`.
Example starter interests: Artificial Intelligence, Software Development, Data Science, Cybersecurity, Startups, Entrepreneurship, E-commerce, Digital Marketing, Finance, Investing, Real Estate, Architecture, Interior Design, Languages, Travel, Sustainability. Also listed in intro: Marketing, Design.
Example sort_order: 10 AI, 20 Entrepreneurship, 30 Startups, 40 Marketing.

## Example row
`ID_Interest=int_001, interest_code=ARTIFICIAL_INTELLIGENCE, interest_name="Artificial Intelligence", category=Technology, description="Artificial intelligence, machine learning and generative AI related topics.", status=active, sort_order=10, created_at=2026-09-22 10:00, created_by_user_id=usr_admin, updated_at=2026-09-22 10:00, updated_by_user_id=usr_admin`
