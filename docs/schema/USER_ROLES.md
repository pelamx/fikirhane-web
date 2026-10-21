# USER_ROLES

## Purpose
Assignment table between USERS and global system ROLES. One row = one assignment of one global Role to one User for a period (with its own lifecycle: start, end, who assigned, who revoked). Answers "which global permission packages does this user have system-wide?".
NOT stored here: membership (Member/Premium -> MEMBERSHIPS; Visitor = no active membership); scoped roles — Tutor (-> EVENT_USERS), Club Admin (-> CLUB_USERS), Organization Admin (-> ORGANIZATION_USERS); permissions (-> ROLE_PERMISSIONS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_UserRole | uuid | NOT NULL | generated | PK | Assignment's own id (doc examples `usrrole_001`, `ur_001`). |
| ID_User | uuid | NOT NULL | | USERS.ID_User | User who has the role. |
| ID_Role | uuid | NOT NULL | | ROLES.ID_Role | Assigned global system role. |
| status | enum | NOT NULL | `active` (implied) | | Assignment status. |
| assigned_at | timestamptz | NOT NULL | now() | | When the role was given; important for authorization history. |
| assigned_by_user_id | uuid | NULL | | USERS.ID_User | Who assigned (e.g. a TECH_ADMIN user assigning MARKETING). Important for audit. |
| expires_at | timestamptz | NULL | NULL | | For temporary roles (e.g. temporary admin during event period, 30-day support access: `2026-10-31`). NULL = permanent. |
| revoked_at | timestamptz | NULL | NULL | | When removed. |
| revoked_by_user_id | uuid | NULL | NULL | USERS.ID_User | Who removed it. |
| notes | text | NULL | | | Internal note, e.g. "Temporary marketing access during launch period." |
| created_at | timestamptz | NOT NULL | now() | | |
| updated_at | timestamptz | NOT NULL | now() | | |

## Enums / allowed values
- status:
  - `active` — role currently valid
  - `inactive` — temporarily not used
  - `revoked` — deliberately removed
  - `expired` — time-limited role whose time is up

## Constraints & indexes
- PK ID_UserRole.
- FK ID_User -> USERS, FK ID_Role -> ROLES (NOT NULL, must be valid).
- Partial unique: max one active assignment per (ID_User, ID_Role) — UNIQUE(ID_User, ID_Role) WHERE status = 'active'. Historical rows for same pair allowed.
- ID_Role must reference an active role for new assignments (ROLES rule ROLE-D08: inactive/archived roles can't be newly assigned).

## Relationships
- USERS 1 — N USER_ROLES N — 1 ROLES (USERS N:M ROLES).
- Effective permissions via ROLES -> ROLE_PERMISSIONS -> PERMISSIONS.

## Business rules / data rules
1. USRROLE-D01: Each row must reference a valid User and Role.
2. USRROLE-D02: Max one active assignment per User + Role at the same time.
3. USRROLE-D03: Role assignments are never hard deleted; closed via revoke/expire (status=revoked, revoked_at, revoked_by_user_id) so history of who had which authority is visible.
4. USRROLE-D04: Only global system roles are assigned via USER_ROLES.
5. USRROLE-D05: Membership info must not be stored in USER_ROLES (no MEMBER / PREMIUM_MEMBER / VISITOR roles).
6. USRROLE-D06: Club/Event/Organization scoped roles must not be stored in USER_ROLES.
7. USRROLE-D07: If expires_at is in the past, the role must not produce effective permissions.
8. USRROLE-D08: Revoked role must not be included in authorization computation.
9. USRROLE-D09: User's effective global permission set = union of permissions of all active global roles.
10. A user may hold multiple roles simultaneously (e.g. FIKIRHANE_ADMIN + MARKETING; ACCOUNTING + KITCHEN_STAFF).
11. Conflicting roles: allow-based RBAC — if any role grants a permission, user has it. No deny system in V1.
12. Re-assigning after revoke: create a NEW assignment row rather than reusing the old one (e.g. 2025 active, 2026 revoked, 2027 assigned again).
13. Authorization check flow: (1) user authenticated? (2) find active USER_ROLES; (3) find active ROLE_PERMISSIONS of those roles; (4) does required permission (e.g. transaction.view) exist? -> ALLOW else DENY.
14. USER_ROLES = global authorization only; scoped authorization comes from CLUB_USERS, EVENT_USERS, ORGANIZATION_USERS (e.g. user may be admin in English Club but member in AI Club; tutor role on Event 100 gives no system-wide tutor authority).
15. Default USER role: recommended to manage base frontend permissions via a USER role auto-assigned to every normal authenticated user (not mandatory; alternative is a post-authentication default policy). Recommended for documentation/visibility.

## Seed data
Global roles assignable in V1: USER, FIKIRHANE_ADMIN, KITCHEN_STAFF, ACCOUNTING, MARKETING, TECH_ADMIN (future maybe OPERATIONS_STAFF, SUPPORT).
Default USER role permissions example: profile.view_own, profile.edit_own, booking.create, booking.view_own, event.view, club.view.

## Superseded / rejected ideas
- USERS.role single field — rejected (multiple roles + lifecycle).
- MEMBER / PREMIUM_MEMBER / VISITOR as roles — rejected.
- Tutor / Club Admin / Organization Admin as global roles — rejected.
- Deny permissions / allow+deny precedence — rejected for V1.
- Hard delete of assignments — rejected.
- Reusing a historical row on re-assignment — discouraged.

## Open questions
- USER role auto-assignment vs default post-auth policy (doc recommends USER role, but says not mandatory).
- Who/what flips status to `expired` when expires_at passes (job vs computed) — not specified; rule only says expired-by-date roles produce no permissions.

## Example row
Record 1: ID_UserRole=ur_001, ID_User=usr_Ahmet, ID_Role=role_USER, status=active, assigned_at=2026-01-01
Record 2: ID_UserRole=ur_002, ID_User=usr_Ahmet, ID_Role=role_FIKIRHANE_ADMIN, status=active, assigned_at=2026-05-01, assigned_by_user_id=usr_TECHADMIN
(Revoke example: status=revoked, revoked_at=2027-01-10, revoked_by_user_id=usr_admin)
