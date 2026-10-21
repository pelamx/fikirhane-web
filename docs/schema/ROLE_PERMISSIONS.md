# ROLE_PERMISSIONS

## Purpose
N:M junction between ROLES and PERMISSIONS. One row = one grant of one Permission to one global Role for a period (an assignment with its own history). Answers "which permissions does this Role have?" ("what can this Role do?").
NOT stored here: scope (global roles are system-wide; scoped roles get scope via CLUB_USERS / EVENT_USERS / ORGANIZATION_USERS); deny/effect; direct user permissions; permission mappings of scoped roles (club_admin, tutor, organization_admin) — in V1 those are kept in business logic/config, not in this table.

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_RolePermission | uuid | NOT NULL | generated | PK | The assignment's own id (doc example `rp_001`), not the Role's or Permission's id. |
| ID_Role | uuid | NOT NULL | | ROLES.ID_Role | Role receiving the permission. |
| ID_Permission | uuid | NOT NULL | | PERMISSIONS.ID_Permission | Permission granted. |
| status | enum | NOT NULL | `active` (implied) | | Whether this assignment is in effect. |
| granted_at | timestamptz | NOT NULL | now() | | When permission was granted to the role; important for authorization history. |
| granted_by_user_id | uuid | NULL | | USERS.ID_User | User who added it (e.g. a TECH_ADMIN user); important for sensitive permissions. |
| revoked_at | timestamptz | NULL | NULL | | When removed; NULL on active record. |
| revoked_by_user_id | uuid | NULL | NULL | USERS.ID_User | User who removed it. |
| notes | text | NULL | | | Internal note, e.g. "Temporarily granted for launch period." |
| created_at | timestamptz | NOT NULL | now() | | |
| updated_at | timestamptz | NOT NULL | now() | | |

(No created_by_user_id / updated_by_user_id in this table — granted_by/revoked_by cover it.)

## Enums / allowed values
- status:
  - `active` — permission is included in the role's effective permission set
  - `inactive` — temporarily not used
  - `revoked` — deliberately removed

## Constraints & indexes
- PK ID_RolePermission.
- FK ID_Role -> ROLES, FK ID_Permission -> PERMISSIONS (both NOT NULL, must be valid).
- Partial unique: at most ONE active assignment per (ID_Role, ID_Permission) — e.g. UNIQUE(ID_Role, ID_Permission) WHERE status = 'active'. Multiple historical (revoked) rows allowed for the same pair.
- Suggested: revoked status implies revoked_at NOT NULL (implied by revoke procedure).

## Relationships
- ROLES 1 — N ROLE_PERMISSIONS
- PERMISSIONS 1 — N ROLE_PERMISSIONS
- Authorization chain: USER -> USER_ROLES -> ROLE -> ROLE_PERMISSIONS -> PERMISSION.

## Business rules / data rules
1. ROLEPERM-D01: Each row must reference a valid Role and Permission.
2. ROLEPERM-D02: Max one active assignment for the same Role + Permission at a time.
3. ROLEPERM-D03: Only an active Role and an active Permission produce effective authorization.
4. ROLEPERM-D04: Revoked/inactive RolePermission is excluded from authorization computation.
5. ROLEPERM-D05: No negative/deny permissions in V1 (no `effect = allow/deny` field). Explicit allow: active RolePermission exists -> ALLOW; otherwise -> DENY.
6. ROLEPERM-D06: Removing a permission from a role = revoke (status=revoked, revoked_at, revoked_by_user_id), never hard delete — so "did Kitchen Staff ever have this permission?" can be answered (security audit).
7. ROLEPERM-D07: Critical permission changes must be written to the audit log.
8. ROLEPERM-D08: ROLE_PERMISSIONS must not be used for direct user permission assignment.
9. ROLEPERM-D09: A user's permissions from different roles are merged (union) into the effective permission set.
10. Same permission via two roles counts once (DISTINCT permission_code).
11. Re-granting after revoke creates a NEW assignment row for the new period (e.g. granted 2026-01, revoked 2026-06, granted again 2026-09).
12. Revoking a role-permission immediately removes that permission from all users holding the role; no per-user update needed. Adding a permission to a role immediately applies to all holders.
13. Sensitive permissions (PERMISSIONS.is_sensitive = true, e.g. permission.manage, role.assign, transaction.reverse, booking.override_payment) may trigger extra business rules on grant: confirmation required, audit log mandatory, only TECH_ADMIN can grant. These are business rules, not table columns.
14. Admin UI: role detail screen with permission checkboxes grouped (Items, Stock, Finance...); checking creates a ROLE_PERMISSIONS row, unchecking revokes it.
15. In V1 ROLE_PERMISSIONS is used only for global ROLES. Scoped role -> permission mappings (e.g. club_admin -> club.update, club_members.manage, event.create, event.update_details; only valid within that club's events) are kept as fixed mapping in code/business rules/config; no generic scoped-role engine in V1.

## Seed data
Example mappings stated:
- KITCHEN_STAFF -> item.view, stock.view, stock.receive, stock.consume, stock_count.create, stock_count.enter, cafeteria_sale.create (stock.waste given as example of a later addition; stock.adjust given as example of a revoked one)
- ACCOUNTING -> document.view, transaction.view, financial_report.view
- event.view held by USER, FIKIRHANE_ADMIN, MARKETING
- FIKIRHANE_ADMIN -> stock.view (example)
- Scoped (config, not this table): club_admin -> club.update, club_members.manage, event.create, event.update_details

## Superseded / rejected ideas
- Scope column in ROLE_PERMISSIONS — rejected (mixes global RBAC with scoped authorization).
- `effect = allow/deny` field — rejected for V1.
- Hard deleting role-permission rows — rejected in favour of status/revoke history.
- Generic scoped-role definition engine in V1 — deferred; scoped role mappings in config.
- Per-user permission grants — rejected.

## Open questions
- Future: generic scoped role definition system for club_admin/tutor/organization_admin permissions (option 2) vs keeping code/config mapping.
- Exact enforcement of "only TECH_ADMIN can grant" sensitive permissions left as business rule.

## Example row
ID_RolePermission=rp_1001, ID_Role=role_KITCHEN_STAFF, ID_Permission=perm_stock_view, status=active, granted_at=2026-09-22 15:00, granted_by_user_id=usr_TECH_ADMIN, revoked_at=NULL, revoked_by_user_id=NULL, notes=NULL, created_at=2026-09-22 15:00, updated_at=2026-09-22 15:00
