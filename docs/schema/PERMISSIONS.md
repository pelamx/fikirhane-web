# PERMISSIONS

## Purpose
Master table of the individual (atomic) permissions defined in Fikirhane. One row = one concrete authorization-controlled action (e.g. `event.update_pricing`). A permission answers "WHAT can be done?"; it does not belong to a user by itself and does not say WHERE (scope).
NOT stored here: scope (comes from scope relations: global roles via USER_ROLES = all; Club via CLUB_USERS; Event via EVENT_USERS; Organization via ORGANIZATION_USERS); who has it (-> ROLES via ROLE_PERMISSIONS); no direct user permissions (no USER_PERMISSIONS in V1); no deny permissions.

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Permission | uuid | NOT NULL | generated | PK | Immutable id (doc examples `perm_001`, `perm_event_005`). Referenced by ROLE_PERMISSIONS.ID_Permission. |
| permission_code | text | NOT NULL | | | Stable technical key, e.g. `event.update_pricing`. UNIQUE; should not change; same code used by backend and frontend. Convention `resource.action` or `resource.action_detail`. |
| resource | text / enum | NOT NULL | | | Domain/resource the permission belongs to (e.g. `event`). Useful for admin permission screen, docs, filtering, reporting. |
| action | text / enum | NOT NULL | | | Main action (e.g. `update`). |
| sub_action | text | NULL | | | Optional sub-dimension of a broad action (e.g. `pricing` for event.update_pricing). Not required for every permission. |
| permission_group | text / enum | NULL | | | Logical grouping for admin UI/docs (e.g. "Finance"). Not used by authorization logic. |
| description | text | NOT NULL | | | What the permission allows. Required (live documentation). |
| is_sensitive | bool | NOT NULL | (false presumably) | | Critical/sensitive permission. Used for: warning in role editing screen, mandatory audit, extra confirmation, security review. |
| is_system_permission | bool | NOT NULL | | | Core system permission protected against accidental deletion. Custom added permissions = false. |
| status | enum | NOT NULL | (active presumably) | | Lifecycle state. |
| sort_order | int | NULL | | | Ordering in admin permission matrix screen (event.view 10, event.create 20, ...). |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | USERS.ID_User | NULL for seed. |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | USERS.ID_User | |

## Enums / allowed values
- status:
  - `active` — usable in authorization computation
  - `inactive` — temporarily not used
  - `archived` — no longer used in new role assignments, history preserved
- resource (listed values): `user`, `membership`, `organization`, `club`, `event`, `booking`, `pricing`, `campaign`, `freepass`, `item`, `stock`, `document`, `transaction`, `account`, `report`, `role`, `permission`, `audit`, `system`. (Seed codes also use resource prefixes `organization_users`, `club_members`, `club_analytics`, `event_participants`, `event_attendance`, `pricing_rule`, `stock_count`, `account_balance`, `system_settings`, `integration`, `cafeteria_sale`, `financial_category`.)
- action (listed values): `view`, `create`, `update`, `delete`, `archive`, `approve`, `publish`, `cancel`, `post`, `reverse`, `manage`, `assign`, `export`.
- Permission categories (documentation classification, not a column):
  - A. CRUD: view, create, update, archive
  - B. Workflow: approve, publish, cancel, complete, post, reverse
  - C. Sensitive Operations: update_pricing, view_sensitive, manage_financial_data
  - D. Override: override_capacity, override_payment, override_policy (keep override permissions separate, especially for admin operations)
- permission_group examples: `User Management`, `Event Management`, `Booking Operations`, `Finance`, `Stock`, `System Administration`.

## Constraints & indexes
- PK ID_Permission (immutable).
- UNIQUE(permission_code).
- Inactive/archived permissions produce no effective authorization.

## Relationships
- PERMISSIONS 1 — N ROLE_PERMISSIONS N — 1 ROLES (PERMISSIONS N:M ROLES).
- Effective authorization = Permission + Scope relation (USER_ROLES -> global/all; CLUB_USERS -> club scope; EVENT_USERS -> event scope; ORGANIZATION_USERS -> organization scope).

## Business rules / data rules
1. PERM-D01: ID_Permission unique and immutable.
2. PERM-D02: permission_code unique.
3. PERM-D03: permission_code should follow `resource.action` standard as much as possible (`resource.action_detail` when needed, e.g. event.update_details/schedule/pricing). Preferred over long four-part codes.
4. PERM-D04: Scope must not be embedded in permission code (wrong: `event.update.pricing.club`; right: permission=`event.update_pricing`, scope=`club`).
5. PERM-D05: Critical update operations should be split into sub-permissions when needed (Event: update_details/update_schedule/update_location/update_capacity/update_pricing — so a Club Admin can get details but not pricing). Simple master data may use single `resource.update` (e.g. `financial_category.update`).
6. PERM-D06: Workflow operations must not be forced into CRUD (post, reverse, approve, checkin, ...). System must support CRUD + workflow + sensitive action + override.
7. PERM-D07: No direct permission assignment to users in V1 (flow User -> Role -> Permissions). May be added later if a real need arises.
8. PERM-D08: No deny-permission system in V1 — explicit allow: has permission => ALLOW, otherwise DENY. Don't create negative permissions like `deny_event_edit`.
9. PERM-D09: Inactive/archived permissions must not produce effective authorization.
10. PERM-D10: Authorization must always be validated on backend. Frontend permission = UX (hide/show buttons e.g. "Edit Price"); backend permission = security (re-check on API call).
11. Same permission may apply with different scope (e.g. event.update_pricing for Fikirhane Admin on all events, for Club Admin only on own club events). Global role scope can be thought of as `all`.
12. Use `transaction.update_pending` instead of `transaction.update` — posted transactions must not be updated normally.
13. Pick one naming standard (e.g. `user` vs `profile` domain) and never change it afterwards.
14. Role/permission management permissions (role.*, permission.*) are high risk.

## Seed data
Permission codes listed in the doc (verbatim):
- Intro examples: event.view, event.create, event.update_details, event.update_pricing, event.publish, booking.create, booking.cancel, booking.override_capacity, stock.view, stock.adjust, transaction.view, transaction.post, transaction.reverse, user.suspend
- User: user.view_own, user.update_own, user.view_basic, user.view_contact, user.view_sensitive, user.suspend, user.reactivate
- Membership: membership.view_own, membership.view, membership.create, membership.update, membership.approve, membership.reject, membership.cancel
- Organization: organization.view, organization.create, organization.update, organization.archive, organization_users.view, organization_users.manage
- Club: club.view, club.create, club.update, club.archive, club_members.view, club_members.manage, club_analytics.view
- Event: event.view, event.create, event.update_details, event.update_schedule, event.update_location, event.update_capacity, event.update_pricing, event.publish, event.cancel, event_participants.view, event_attendance.manage
- Booking: booking.create, booking.view_own, booking.view, booking.update, booking.cancel_own, booking.cancel, booking.checkin, booking.checkout, booking.override_capacity, booking.override_payment
- Pricing (if separate domain): pricing.view, pricing_rule.create, pricing_rule.update, pricing_rule.disable (event-level price uses event.update_pricing)
- Stock: stock.view, stock.receive, stock.consume, stock.waste, stock.adjust, stock_count.create, stock_count.enter, stock_count.complete, stock_count.approve, stock_count.post
- Documents: document.view, document.create, document.update, document.post, document.cancel, document.export
- Transaction: transaction.view, transaction.create, transaction.update_pending, transaction.post, transaction.reverse, transaction.export
- Accounts: account.view, account_balance.view, account.create, account.update, account.close, account.reconcile
- Roles/Permissions: role.view, role.create, role.update, role.assign, role.revoke, permission.view, permission.manage
- Audit/System: audit.view, system_settings.view, system_settings.update, integration.view, integration.manage
- Other codes mentioned: item.view, cafeteria_sale.create, financial_category.update, booking.override_payment
- is_sensitive = true examples: transaction.reverse, role.assign, permission.manage, user.view_sensitive, booking.override_payment, event.update_pricing. false examples: event.view, club.view.
- is_system_permission = true examples: role.manage, permission.manage, system.settings.edit, event.update_pricing.
- sort_order example: event.view 10, event.create 20, event.update_details 30, event.update_schedule 40, event.update_pricing 50, event.publish 60, event.cancel 70.
- KITCHEN_STAFF bundle example: item.view, stock.view, stock.receive, stock.consume, stock_count.create, stock_count.enter, cafeteria_sale.create.

## Superseded / rejected ideas
- Scope column / scope inside permission code (`event.update.pricing.club`) — rejected.
- Pure CRUD permission model — rejected.
- Single blind `resource.update` for critical entities — rejected.
- `transaction.update` — replaced by `transaction.update_pending`.
- USER_PERMISSIONS table (direct user permissions) — rejected for V1.
- Deny / negative permissions — rejected for V1.
- Four-part long codes — rejected.

## Open questions
- `user` vs `profile` domain naming for own-profile permissions (doc: "maybe profile domain could be chosen"; ROLES doc uses profile.view_own/profile.edit_own).
- Whether pricing is a separate domain (pricing.*, pricing_rule.*).
- Whether resource/action are free text or enums.
- `role.manage` and `system.settings.edit` are cited as system permissions but are not in the seed lists (lists have role.view/create/update/assign/revoke and system_settings.view/update).

## Example row
ID_Permission=perm_event_005, permission_code=event.update_pricing, resource=event, action=update, sub_action=pricing, permission_group="Event Management", description="Event'in fiyatlama bilgilerinin değiştirilmesine izin verir.", is_sensitive=true, is_system_permission=true, status=active, sort_order=50, created_at=2026-09-22 14:00, created_by_user_id=NULL, updated_at=2026-09-22 14:00, updated_by_user_id=NULL
