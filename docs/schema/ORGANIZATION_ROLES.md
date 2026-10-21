# ORGANIZATION_ROLES

## Purpose
Child table of ORGANIZATIONS recording in which functional/commercial capacities an Organization relates to Fikirhane ("What does this institution act as for Fikirhane?"). One row = one Organization + role_type relation period (e.g. ABC Teknoloji -> sponsor). It is a master classification ("in which categories can this org be used"), NOT the concrete relation. NOT stored here: institution identity (-> ORGANIZATIONS), specific sponsorship contracts (-> CLUB_SPONSORSHIPS / EVENT_ORGANIZATIONS), concrete event links (-> EVENT_ORGANIZATIONS), user permissions (-> ORGANIZATION_USERS / USER_ROLES), purchase/sale history (-> DOCUMENTS). Note: despite the name, this is NOT a role-definition master and NOT people's roles inside an org.

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_OrganizationRole | uuid | NOT NULL | gen | PK | ID of the org+role relation (not the org). Example `orgrole_001`. |
| ID_Organization | uuid | NOT NULL | - | ORGANIZATIONS.ID_Organization | |
| role_type | enum | NOT NULL | - | - | Org's role vis-à-vis Fikirhane; controlled list. |
| status | enum | NOT NULL | (not stated; `active` sensible) | - | |
| start_date | date | NULL | - | - | Role start; not mandatory for every role, useful if history matters. |
| end_date | date | NULL | NULL | - | NULL for active role. |
| notes | text | NULL | - | - | Internal ops note (e.g. "Preferred coffee supplier.", "Annual framework agreement."); not shown to users. |
| created_at | timestamptz | NOT NULL | now() | - | |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | |

## Enums / allowed values
- **role_type** (V1):
  - `supplier` — sells products/services to Fikirhane (coffee supplier, cleaning company, software service provider, bakery); used on purchase documents
  - `customer` — corporate customer buying from Fikirhane (corporate membership, meeting room rental, corporate event purchase)
  - `sponsor` — can enter / is used in sponsorship relations; does NOT say which club/event/dates
  - `partner` — general strategic/operational partner (university, community, media, business partner)
  - `club_partner` — works with clubs as partner (e.g. Instituto Cervantes -> Spanish Club Partner); which club stored in the club relation
  - `event_partner` — participates as partner per event; actual link in EVENT_ORGANIZATIONS
  - Possible later (V2/optional): `service_provider`, `venue_partner`, `education_partner` (don't expand unnecessarily).
- **status**: `active`, `inactive`, `ended`.

## Constraints & indexes
- PK ID_OrganizationRole.
- Partial unique: UNIQUE(ID_Organization, role_type) WHERE status = 'active' (ORGR-D04). Historical periods allowed (2024–2025 supplier ended; 2026– supplier active).
- role_type CHECK in controlled list (ORGR-D02).

## Relationships
- ORGANIZATIONS 1:N ORGANIZATION_ROLES.
- Used as validation source for DOCUMENTS counterparty (purchase -> supplier; sale -> customer).

## Business rules / data rules
1. ORGR-D01: Each role row linked to an Organization.
2. ORGR-D02: role_type is a controlled list.
3. ORGR-D03: An Organization may have multiple different roles.
4. ORGR-D04: Max one active row per Organization + role_type.
5. ORGR-D05: Organization Role grants no User permission (ABC = sponsor gives the company no system rights; rights come via real users in ORGANIZATION_USERS). Unlike global ROLES (user permission bundles like FIKIRHANE_ADMIN, KITCHEN_STAFF, TECH_ADMIN), this is classification only.
6. ORGR-D06: Sponsor role does not replace the actual sponsorship contract (e.g. ABC Ltd / AI Club / 2026-01-01 -> 2026-12-31 / Main Sponsor lives in CLUB_SPONSORSHIPS).
7. ORGR-D07: Supplier role does not replace purchase history.
8. ORGR-D08: Customer role does not replace sales documents.
9. ORGR-D09: Role rows not deleted if history needed; close via status/end_date.
10. Purchase document (DOCUMENTS.direction = purchase): system may require counterparty org to have an active `supplier` role — only active suppliers selectable.
11. Sale document (DOCUMENTS.direction = sale): system may check `customer` role; alternatively auto-create customer role on first corporate sale (business-rule decision).
12. ORGANIZATION_ROLES = org's role; ORGANIZATION_USERS = person's role inside org — completely different.

## Superseded / rejected ideas
- Boolean columns is_supplier / is_customer / is_sponsor / is_partner on ORGANIZATIONS — rejected.
- Permissions on org roles — rejected.
- Expanding role list prematurely — discouraged.

## Open questions
- Enforce supplier role on purchase docs: "system may check" (not mandated).
- Customer role: check vs auto-create on first corporate sale — business decision pending.

## Example row
Organization ABC Teknoloji (org_ABC):
- #1 `ID_Organization=org_ABC, role_type=customer, status=active, start_date=2026-01-01`
- #2 `ID_Organization=org_ABC, role_type=sponsor, status=active, start_date=2026-05-01`
- #3 `ID_Organization=org_ABC, role_type=event_partner, status=active`
Ended example: `role_type=supplier, start_date=2025-01-01, end_date=2026-03-31, status=ended`

## Seed data
None (rows are per-organization). role_type controlled values: `supplier`, `customer`, `sponsor`, `partner`, `club_partner`, `event_partner`.
