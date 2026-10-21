# USER_MEMBERSHIPS

## Purpose
USER_MEMBERSHIPS is the historical lifecycle table that actually assigns a membership package to a user: one row = one user holding one MEMBERSHIP_TYPE over one date range with a lifecycle status. A user can have many rows over time but at most one active at once; Member/Premium status is derived from here. It does NOT store package definitions/rights (MEMBERSHIP_TYPES), the application/review process (MEMBERSHIP_APPLICATIONS), system permissions (USER_ROLES), or account status (USERS.account_status). Visitor has no row here — it is derived (user with no active USER_MEMBERSHIPS). Do not put ID_MembershipType on USERS (loses history).

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_UserMembership | uuid | NOT NULL | gen uuid | PK | Relation's own ID. Example `umem_001`. |
| ID_User | uuid | NOT NULL | – | USERS.ID_User | Membership holder. |
| ID_MembershipType | uuid | NOT NULL | – | MEMBERSHIP_TYPES.ID_MembershipType | Package. |
| status | enum | NOT NULL | `pending` or `active` (not stated) | – | Lifecycle state. |
| start_date | date / timestamptz | NOT NULL | – | – | Validity start. |
| end_date | date / timestamptz | NULL | – | – | End (planned or actual). NULL = open-ended, but author prefers explicit range. |
| approved_at | timestamptz | NULL | – | – | Approval time (if approval required). |
| approved_by_user_id | uuid | NULL | – | USERS.ID_User | Approver (e.g. FIKIRHANE_ADMIN). |
| cancelled_at | timestamptz | NULL | – | – | Cancellation time. |
| cancelled_by_user_id | uuid | NULL | – | USERS.ID_User | Who cancelled (admin/user/system); NULL allowed for system, with audit log. |
| cancellation_reason | text | NULL | – | – | Reason, esp. for manual cancellations. |
| source | enum / text | NULL | – | – | How the membership was created. |
| notes | text | NULL | – | – | Internal note. |
| created_at | timestamptz | NOT NULL | now() | – | Creation. |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Creator. |
| updated_at | timestamptz | NOT NULL | now() | – | Last change. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifier. |
| ID_MembershipApplication | uuid | NULL | – | MEMBERSHIP_APPLICATIONS.ID_MembershipApplication | Proposed in MEMBERSHIP_APPLICATIONS.md §7 (not in this doc's field list): provenance — which application produced this membership; NULL for admin grants etc. Recommended ("bence evet, faydalı"). |

## Enums / allowed values
- **status**
  - `pending` – created but not yet active (e.g. awaiting approval).
  - `active` – currently valid.
  - `expired` – period ended.
  - `cancelled` – manually cancelled.
  - `suspended` – temporarily stopped.
  - (Note: upgrade section also uses "ended" — not in enum; see inconsistencies.)
- **source**: `admin_grant`, `application`, `campaign`, `conversion`, `manual`, `system`.

## Constraints & indexes
- PK: ID_UserMembership.
- FKs NOT NULL: ID_User, ID_MembershipType.
- Partial UNIQUE (ID_User) WHERE status = 'active' — max one active membership per user (UMEM-D02). (Optionally also exclusion constraint on overlapping active date ranges.)
- CHECK end_date IS NULL OR end_date >= start_date (implied).
- cancelled status ⇔ cancelled_at IS NOT NULL (business logic: "cancelled: cancelled_at != NULL").
- On insert: referenced MEMBERSHIP_TYPES.status must be `active` (UMEM-D06).
- No hard delete.
- Index (ID_User, status), (status, end_date) for expiration job.

## Relationships
- USERS 1 — N USER_MEMBERSHIPS; MEMBERSHIP_TYPES 1 — N USER_MEMBERSHIPS.
- MEMBERSHIP_APPLICATIONS 1 — 0..1 USER_MEMBERSHIPS (via nullable ID_MembershipApplication).
- approved_by / cancelled_by / created_by / updated_by -> USERS.ID_User.

## Business rules / data rules
1. UMEM-D01: Every row references a valid User and Membership Type.
2. UMEM-D02: A user has at most one active membership at a time (e.g. Member active + Premium active is wrong).
3. UMEM-D03: No row is created for Visitors (Visitor = user with 0 active records).
4. UMEM-D04: Membership history is never hard-deleted (use cancelled / expired).
5. UMEM-D05: Upgrade/downgrade: never change the type of an existing record; close the old (status ended/cancelled, end_date = change time) and create a new record (new type, status active, start_date = same time).
6. UMEM-D06: No new memberships with inactive/archived Membership Type.
7. UMEM-D07: Expired/cancelled/suspended memberships produce no pricing or reservation benefits.
8. UMEM-D08: Membership status and USERS.account_status are independent (account active + membership expired = usable account but Visitor; account suspended + membership active = account unusable).
9. UMEM-D09: Pricing uses only the currently active membership.
10. UMEM-D10: Membership changes must be audited.
11. Renewal: create a new record per period (e.g. 2026 Member -> expired; 2027 Member -> new active record) for clean periodic reporting.
12. Status/date semantics: active = status active AND start_date <= now AND (end_date > now OR NULL); expired = end_date < now; cancelled = cancelled_at not null. Must be defined clearly in business logic.
13. Automatic expiration: scheduled job/system action sets status = expired where end_date < now AND status = active; writing to audit log is useful.
14. Application flow: User -> Membership Application -> Review -> Approved -> USER_MEMBERSHIPS created. Application = request; membership = actual entitlement.
15. Pricing at booking: find active USER_MEMBERSHIP; none -> Visitor; else Membership Type -> discount / pricing rule (e.g. Member -> 15%).
16. Reservation rights resolved via USER_MEMBERSHIPS -> MEMBERSHIP_TYPES (reservation_window_days, max_active_bookings, seat_selection_enabled, priority_booking_enabled).
17. Type rights changes apply live to existing memberships (e.g. Member 15% -> 10% affects all active Members); no entitlement snapshot in V1.
18. Membership (commercial/reservation entitlement) is independent from USER_ROLES (system permissions): same user can be FIKIRHANE_ADMIN and Premium.

## Superseded / rejected ideas
- USERS.ID_MembershipType column — rejected (loses history).
- Multiple concurrent active memberships — rejected.
- Mutating type on upgrade/downgrade — rejected.
- Extending one record on renewal — not preferred (new record per period).
- Hard delete — rejected.
- Entitlement snapshot per membership — not in V1.
- Managing applications via USER_MEMBERSHIPS.status = pending — rejected in MEMBERSHIP_APPLICATIONS.md (separate table).

## Open questions
- Whether start_date/end_date are date or timestamptz.
- Default status on insert; whether `pending` is still needed given the separate applications table.
- Status for closed-by-upgrade records ("ended" vs `cancelled`/`expired`).
- Whether `source` is enum or free text.
- Whether to add ID_MembershipApplication (recommended in other doc).
- Open-ended (NULL end_date) memberships allowed but discouraged.

## Example row
`ID_UserMembership=umem_1001, ID_User=usr_AHMET, ID_MembershipType=mtype_MEMBER, status=active, start_date=2026-09-01, end_date=2027-08-31, approved_at=2026-08-30 15:00, approved_by_user_id=usr_ADMIN, cancelled_at=NULL, cancelled_by_user_id=NULL, cancellation_reason=NULL, source=application, notes=NULL, created_at=2026-08-30 15:00, created_by_user_id=usr_ADMIN, updated_at=2026-08-30 15:00, updated_by_user_id=usr_ADMIN`
