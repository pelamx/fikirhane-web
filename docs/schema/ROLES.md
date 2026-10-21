# ROLES

## Purpose
Master table of the global permission bundles ("global role / authority packages") defined in Fikirhane. One row = one global system role (e.g. FIKIRHANE_ADMIN, KITCHEN_STAFF). Who has the role is in USER_ROLES; which permissions the role contains is in ROLE_PERMISSIONS -> PERMISSIONS.
NOT stored here: permissions as boolean columns (-> ROLE_PERMISSIONS/PERMISSIONS), membership types Member/Premium/Visitor (-> MEMBERSHIP_TYPES), scoped roles such as Club Admin (-> CLUB_USERS.club_role), Tutor (-> EVENT_USERS), Organization Admin (-> ORGANIZATION_USERS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Role | uuid | NOT NULL | generated | PK | Immutable unique id (doc example `role_001`). Referenced by USER_ROLES.ID_Role and ROLE_PERMISSIONS.ID_Role. |
| role_code | text | NOT NULL | | | Stable technical code used in application code (e.g. `FIKIRHANE_ADMIN`). UNIQUE; should not change after creation. |
| role_name | text | NOT NULL | | | Human-readable UI name (e.g. "Fikirhane Admin"). May later move to a localization system (TR/EN). |
| description | text | NULL | | | Purpose and scope of the role. |
| role_type | enum | NOT NULL (per field table) | `system` | | Role category. Doc says optional for V1 — "may even remove it" (see Open questions). |
| is_system_role | bool | NOT NULL | (not stated) | | True = core role shipped by system, protected from deletion / code changes. |
| status | enum | NOT NULL | (not stated; presumably `active`) | | Lifecycle state. |
| sort_order | int | NULL | | | UI ordering in admin screens (10, 20, 30...). |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | USERS.ID_User | NULL (or system identity) when created by system seed. |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | USERS.ID_User | |

## Enums / allowed values
- role_type: V1 single value `system`. Possible future values: `system`, `service`, `technical`.
- status:
  - `active` — can be assigned to new users and works in existing assignments
  - `inactive` — no new assignments allowed
  - `archived` — no longer used, historical records preserved

## Constraints & indexes
- PK ID_Role (immutable).
- UNIQUE(role_code).
- Inactive/archived role cannot be used for new assignment (enforced at USER_ROLES insert).

## Relationships
- ROLES 1 — N USER_ROLES (N — 1 USERS) => USERS N:M ROLES.
- ROLES 1 — N ROLE_PERMISSIONS (N — 1 PERMISSIONS) => ROLES N:M PERMISSIONS.

## Business rules / data rules
1. ROLE-D01: ID_Role must be unique and immutable.
2. ROLE-D02: role_code must be unique (and preferably never changed after creation).
3. ROLE-D03: Role must not be stored directly on User; use USER_ROLES.
4. ROLE-D04: Permissions must not be stored as boolean fields inside Role.
5. ROLE-D05: Membership Types must not be in ROLES.
6. ROLE-D06: Scoped roles must not be put in ROLES.
7. ROLE-D07: A role with usage history must not be hard deleted.
8. ROLE-D08: Inactive/archived roles cannot be used for new assignments.
9. ROLE-D09: System roles must be protected against accidental deletion (system does not allow deleting some roles, protects role codes, prevents breaking critical roles).
10. Prefer permission checks over direct role_code checks in code (role_code checks like `if role_code == "FIKIRHANE_ADMIN"` possible but discouraged).
11. All ROLES are global (valid across the whole system).
12. No role hierarchy/inheritance in V1 — Role -> explicit permissions only (inheritance makes "where did this permission come from?" hard).
13. Role = "what can they do?" (e.g. event.edit, stock.adjust, user.suspend); Membership = "which commercial rights?" (e.g. 15% discount, priority booking, seat selection). Never mixed.
14. USER role can be auto-assigned to almost every authenticated user; independent of Visitor/Member/Premium.
15. FIKIRHANE_ADMIN should not necessarily get technical infrastructure permissions (permission.manage, integration.manage, system.security.manage) — those may belong to TECH_ADMIN.
16. KITCHEN_STAFF must not access User, Membership or system settings.
17. MARKETING must not access finance, system settings or sensitive user data.
18. ACCOUNTING: whether transaction.post / transaction.reverse are granted is decided separately.
19. TECH_ADMIN may have broad permissions for troubleshooting, but technical role and business role need not be the same.
20. Keep the number of roles small initially.

## Seed data
| sort_order | role_code | role_name | is_system_role | description |
|---|---|---|---|---|
| 10 | USER | User | true | Normal authenticated user; base permission package of authenticated frontend user. |
| 20 | FIKIRHANE_ADMIN | Fikirhane Admin | true | Business management; global role managing Fikirhane business operations. |
| 30 | KITCHEN_STAFF | Kitchen Staff | true | Cafeteria/stock staff. |
| 40 | ACCOUNTING | Accounting | (not stated) | Finance and accounting view/operations. |
| 50 | MARKETING | Marketing | (not stated) | Campaign, acquisition, user analytics. |
| 60 | TECH_ADMIN | Tech Admin | true | Technical system administration. |

(is_system_role=true explicitly named for USER, FIKIRHANE_ADMIN, TECH_ADMIN; example rows also give KITCHEN_STAFF true.)
Possible future roles: OPERATIONS_STAFF, SUPPORT, EVENT_OPERATIONS (EVENT_OPERATIONS given as example admin-created role with is_system_role=false).

Example permission bundles stated in ROLES doc (seed hints for ROLE_PERMISSIONS):
- USER: profile.view_own, profile.edit_own, event.view, club.view, booking.create, booking.view_own, booking.cancel_own
- FIKIRHANE_ADMIN: user.view_basic, user.view_contact, membership.manage, event.manage, booking.manage, club.manage, organization.manage, campaign.manage, freepass.manage, stock.view, finance.view, report.view
- KITCHEN_STAFF: item.view, stock.view, stock.receive, stock.consume, stock.waste, stock_count.enter, cafeteria.sale.create
- ACCOUNTING: document.view, transaction.view, account.view, financial_report.view, report.export (+ optionally transaction.post, transaction.reverse)
- MARKETING: campaign.view, campaign.edit, acquisition.view, marketing.analytics.view, user.view_basic, booking.view
- TECH_ADMIN: role.manage, permission.manage, audit.view, integration.manage, system.settings.edit

## Superseded / rejected ideas
- Permission boolean columns on ROLES (can_edit_event, can_view_finance, can_manage_stock) — rejected.
- Role hierarchy / inheritance (TECH_ADMIN inherits FIKIRHANE_ADMIN inherits USER) — rejected for V1.
- Treating every user segment as a Role (Member, Premium, Visitor, Tutor, Club Admin, Organization Admin) — rejected.
- USERS.role column — rejected.

## Open questions
- Whether to keep role_type at all in V1 (doc: "not required", "I might even remove it").
- Whether ACCOUNTING gets transaction.post / transaction.reverse.
- role_name localization later.
- Defaults for status / is_system_role not stated.

## Example row
ID_Role=role_001, role_code=USER, role_name=User, description="Authenticated frontend kullanıcısının temel yetki paketi.", is_system_role=true, status=active, sort_order=10
