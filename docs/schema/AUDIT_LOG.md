# AUDIT_LOG

## Purpose
Immutable, append-only history of important changes: who changed what, when, on which record, how and why. One row = one business action (V1 approach: "one business action = one audit log row"; detailed field changes go into change_data). It is change history, not operational data.
NOT stored here: the operational data itself — money movements live in TRANSACTIONS, stock movements in STOCK_MOVEMENTS (audit only records who posted/reversed/adjusted and why); current-summary created_by/updated_by stay on the main tables; secrets (password, token, secret) are never logged.

## Final fields
V1 recommended (simplified) set, plus extended fields from the full proposal marked (V2/optional):

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_AuditLog | uuid | NOT NULL | generated | PK | Immutable id (doc example `audit_001`). |
| occurred_at | timestamptz | NOT NULL | now() | | When the action happened; system-generated; most critical audit field. |
| actor_user_id | uuid | NULL | | USERS.ID_User | User who performed it; NULL for system/automatic actions. |
| actor_type | enum | NOT NULL | | | Category of actor. Must be set even when actor_user_id is NULL. |
| action | text / enum | NOT NULL | | | What was done; generic verb or meaningful domain-specific code (e.g. `user.suspend`, `booking.override_capacity`, `role_permission.grant`). Doc prefers sufficiently meaningful actions for readability. |
| entity_type | text / enum | NOT NULL | | | Entity affected (e.g. `user`, `booking`, `role`). Need not equal DB table name but should follow same naming standard. |
| entity_id | uuid / text | NOT NULL | | (polymorphic, no FK) | ID of affected record; entity_type + entity_id identify the record. |
| change_data | jsonb | NULL | | | Structured summary of multiple field changes, shape `{"field": {"old": x, "new": y}, ...}`. Preferred over field_name/old_value/new_value in V1. |
| reason | text | NULL | | | Justification; may be mandatory for some actions (transaction.reverse, booking.override_payment, stock.adjust). |
| source | enum | NULL | | | Technical channel the action came from. |
| request_id | text | NULL | | | Links multiple audit rows from the same API request / transaction (e.g. `req_987`). |
| metadata | jsonb | NULL | | | Extra context per event so schema need not change for new audit needs. |
| field_name | text | NULL | | | (V2/optional) Field changed, for field-level audit (e.g. `account_status`). |
| old_value | jsonb / text | NULL | | | (V2/optional) Value before. |
| new_value | jsonb / text | NULL | | | (V2/optional) Value after. |
| ip_address | text | NULL | | | (V2/optional) Client IP; useful for login, role changes, financial actions. Requires retention policy (KVKK / data minimization). |
| user_agent | text | NULL | | | (V2/optional) Client info (e.g. "Chrome / macOS", "Mobile App / iOS"); security/troubleshooting. |

(No created_at/updated_at — occurred_at is the timestamp; rows are never updated.)

## Enums / allowed values
- actor_type: `user`, `system`, `integration`, `job`
- action (suggested generic values): `create`, `update`, `delete`, `archive`, `activate`, `deactivate`, `approve`, `reject`, `publish`, `cancel`, `assign`, `revoke`, `post`, `reverse`, `override`, `login`, `logout`. Domain-specific codes allowed, e.g. `booking.override_capacity`, `transaction.reverse`, `role_permission.grant`, `user.suspend`.
- entity_type (examples): `user`, `membership`, `organization`, `booking`, `event`, `role`, `permission`, `transaction`, `stock_movement`
- source: `admin_web`, `mobile_app`, `public_web`, `api`, `system_job`, `integration` (technical channel; NOT the same concept as booking_source)
- Audit policy levels (conceptual, NOT required as a field): `critical`, `operational`, `informational`

## Constraints & indexes
- PK ID_AuditLog.
- Append-only: create by system only; no update; no delete (enforce via DB permissions/triggers).
- CHECK: actor_type NOT NULL always; actor_user_id may be NULL only for non-user actors (actor_type = user implies actor_user_id NOT NULL — implied).
- Suggested indexes (implied by usage): (entity_type, entity_id), actor_user_id, occurred_at, request_id.

## Relationships
- AUDIT_LOG N — 1 USERS via actor_user_id (nullable).
- Polymorphic reference to any entity via entity_type + entity_id.

## Business rules / data rules
1. AUD-D01: Audit records are immutable.
2. AUD-D02: Audit log is created only by the system (never by normal users; no update, no delete).
3. AUD-D03: Critical authorization and finance changes must be audited.
4. AUD-D04: Each audit record should contain actor, action, entity and timestamp as far as possible.
5. AUD-D05: For system operations actor_user_id may be NULL but actor_type must be set.
6. AUD-D06: Audit log must not replace the operational entity.
7. AUD-D07: Sensitive old/new values must not be logged unnecessarily — password, token, secret must never be written.
8. AUD-D08: An audit retention policy must be defined separately (esp. ip_address).
9. AUD-D09: Role/permission changes, financial reversals and override operations are high-priority audit events.
10. V1: one business action = one audit row; multi-field changes go in change_data (not one row per field).
11. Not every small change must be logged; critical entities yes with tuned granularity: e.g. user bio change low importance, account_status change must be audited; event description low, event pricing high.
12. created_by/updated_by on main tables = current summary (fast queries); AUDIT_LOG = full history. Both kept.
13. Operations that must be audited:
    - User: user.suspend, user.reactivate, user.contact_change
    - Role/Permission: role.assign, role.revoke, permission.grant, permission.revoke
    - Membership: membership.approve, membership.reject, membership.cancel
    - Event: event.publish, event.cancel, event.update_pricing, event.update_capacity
    - Booking: booking.manual_create, booking.cancel, booking.override_capacity, booking.override_payment
    - Finance: document.post, document.cancel, transaction.post, transaction.reverse, account.adjust
    - Stock: stock.adjust, stock_count.post, stock.waste
14. Reason may be mandatory for transaction.reverse, booking.override_payment, stock.adjust.
15. request_id chains related rows (e.g. Membership approved -> Membership created -> Freepass issued -> Notification created all share req_987).
16. Sensitive permission grants (PERMISSIONS.is_sensitive) require audit (cross-ref ROLE_PERMISSIONS / PERMISSIONS).

## Superseded / rejected ideas
- field_name / old_value / new_value as primary change representation — deprioritized in V1 in favour of change_data JSON (kept as optional).
- One audit row per changed field — rejected for V1.
- Audit severity level as a stored field — not required.
- Updatable/deletable audit rows — rejected.
- Using audit log as financial/stock ledger — rejected.

## Open questions
- Retention policy duration (esp. for ip_address / user_agent) — to be defined.
- Whether action is free text or enum, and whether to use generic verbs + metadata vs domain-specific codes.
- Whether ip_address / user_agent are in V1 (not in simplified V1 set).

## Example row
User suspend: actor_user_id=usr_admin, action=user.suspend, entity_type=user, entity_id=usr_ahmet, change_data={"account_status":{"old":"active","new":"suspended"}}, reason="Repeated policy violation", source=admin_web
Booking override: action=booking.override_capacity, entity_type=booking, entity_id=booking_999, reason="VIP guest approved by management", metadata={"event_id":"event_123","capacity":28,"existing_bookings":28}
Role permission: action=role_permission.grant, entity_type=role, entity_id=role_KITCHEN_STAFF, metadata={"permission":"stock.adjust"}
