# ORGANIZATION_USERS

## Purpose
N:N junction between USERS and ORGANIZATIONS. One row = one period of a User's relation with an Organization: which user, which org, in what (org-scoped) role, active or not, when it started/ended. A user can belong to many orgs; an org has many users. NOT stored here: user's or org's names, email, phone, membership (-> USER_MEMBERSHIPS), global system roles (-> USER_ROLES), event roles (-> EVENT_USERS), club roles (-> CLUB_USERS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_OrganizationUser | uuid | NOT NULL | gen | PK | Own PK because relation has status, role, history, audit (ID_User+ID_Organization not enough). Example `orgusr_001`. |
| ID_Organization | uuid | NOT NULL | - | ORGANIZATIONS.ID_Organization | |
| ID_User | uuid | NOT NULL | - | USERS.ID_User | |
| organization_role | enum (doc: "Enum / FK") | NOT NULL | - | - | User's role ONLY within this Organization (scoped role, not global ROLES). |
| status | enum | NOT NULL | (not stated; `active` sensible) | - | |
| start_date | date (or timestamptz) | NOT NULL | - | - | Relation start; important for audit/history. |
| end_date | date (or timestamptz) | NULL | NULL | - | NULL while active. |
| is_primary | bool | NULL | - | - | User's primary org when multiple (V2/optional — "not required in V1, leave optional"). |
| created_at | timestamptz | NOT NULL | now() | - | Auto. |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | Fikirhane Admin, Organization Admin inviting, or system after invitation acceptance. |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | Detailed history in AUDIT_LOG. |

## Enums / allowed values
- **organization_role**: `admin`, `manager`, `member`, `representative`, `billing_contact`.
  - `admin` example scoped permissions: `organization.edit`, `organization.users.view`, `organization.users.manage`, `organization.bookings.view`, `organization.documents.view`, `organization.billing.manage` — scope = this Organization only.
  - `representative` — acts only as representative (e.g. sponsor rep).
- **status**: `active` (still linked), `inactive`, `suspended`, `ended` (historical relation kept, no longer active).

## Constraints & indexes
- PK ID_OrganizationUser.
- Partial unique: UNIQUE(ID_User, ID_Organization) WHERE status = 'active' (ORGU-D02).
- Check: end_date IS NOT NULL => status <> 'active' (ORGU-D05).
- V1: single active organization_role per relation (one row; admin covers sub-permissions).

## Relationships
- N:1 USERS, N:1 ORGANIZATIONS.
- Related: INVITATIONS (invite flow creates rows), CLUB_USERS (sponsor_representative), EVENT_USERS (person's role at a specific event), CLUB_SPONSORSHIPS / EVENT_ORGANIZATIONS (org-level relations).

## Business rules / data rules
1. ORGU-D01: Each row linked to a User and an Organization.
2. ORGU-D02: No more than one active relation per User + Organization.
3. ORGU-D03: Organization role valid only in that Organization's scope.
4. ORGU-D04: Ended relation is never hard-deleted (user may have bookings, documents, events organized on behalf of org, payments).
5. ORGU-D05: If end_date is set, relation must not be active.
6. ORGU-D06: Org Admin gains no rights on other Organizations (ABC Ltd admin cannot manage XYZ Ltd).
7. ORGU-D07: User's global system roles not stored here (USER_ROLES = what user can do system-wide, e.g. FIKIRHANE_ADMIN, KITCHEN_STAFF, MARKETING, TECH_ADMIN; ORGANIZATION_USERS = what user can do within a specific org).
8. ORGU-D08: Membership info not stored here (Membership gives commercial rights; org relation gives institutional authority).
9. User leaves org: set status = ended, end_date = today (no DELETE).
10. Invitation flow (preferred over directly creating+linking users): Org Admin invites by email -> INVITATION created -> user accepts -> link existing user or create account -> ORGANIZATION_USERS row created -> organization_role assigned.
11. organization_role is not just a label; it drives scoped permissions.

## Superseded / rejected ideas
- USERS.organization_id single FK — rejected (one org only, no role, no history, no per-org roles).
- Multiple concurrent roles per user per org — rejected for V1; ORGANIZATION_USER_ROLES junction possible later.
- Hard delete on leave — rejected.
- Using global ROLES for org admin — rejected (scoped role).

## Open questions
- organization_role as enum vs FK to a master table (no org-user-role master table defined, unlike CLUB_MEMBER_ROLES).
- is_primary inclusion in V1 (optional).
- start_date/end_date: Date vs Timestamp.

## Example row
`ID_OrganizationUser=orgusr_1001, ID_Organization=org_ABC, ID_User=usr_AHMET, organization_role=admin, status=active, start_date=2026-06-01, end_date=NULL, is_primary=true, created_at=2026-06-01 09:30, created_by_user_id=usr_ADMIN, updated_at=2026-06-01 09:30, updated_by_user_id=usr_ADMIN`
