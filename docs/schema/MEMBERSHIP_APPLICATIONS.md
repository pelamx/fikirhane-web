# MEMBERSHIP_APPLICATIONS

## Purpose
MEMBERSHIP_APPLICATIONS stores a user's application for a Fikirhane membership type and its review/decision lifecycle: one row = one application by one user for one MEMBERSHIP_TYPE (with snapshot texts and decision data). It is NOT the membership itself: an approved application results in a separate USER_MEMBERSHIPS row (application is never converted into the membership). It also serves as a community-curation tool, but does not copy profile/attendance/interest/skill data — only the submission snapshot and decision info. Live networking Needs/Offers live in NEEDS/OFFERS; need_text/offer_text here are point-in-time snapshots.

## Final fields
| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_MembershipApplication | uuid | NOT NULL | gen uuid | PK | Example `mapp_001`. |
| ID_User | uuid | NOT NULL | – | USERS.ID_User | Applicant. A user may apply multiple times over time (e.g. 2026 Member, 2027 Premium). |
| ID_MembershipType | uuid | NOT NULL | – | MEMBERSHIP_TYPES.ID_MembershipType | Requested type. |
| status | enum | NOT NULL | `draft` (implied) | – | Application lifecycle. |
| motivation_text | text | NULL | – | – | Why they want membership (free text). Snapshot. |
| offer_text | text | NULL | – | – | What they can contribute. Snapshot. |
| need_text | text | NULL | – | – | What they expect from community. Snapshot. |
| submitted_at | timestamptz | NOT NULL (per field table) | – | – | When actually submitted; submission is a separate event from draft creation. (Field table marks required, though drafts imply it may be NULL until submit — see open questions.) |
| reviewed_at | timestamptz | NULL | – | – | Review/decision time. |
| reviewed_by_user_id | uuid | NULL | – | USERS.ID_User | Reviewer, usually FIKIRHANE_ADMIN. |
| decision_note | text | NULL | – | – | Internal note; not necessarily shown to user. |
| decision_reason | text (controlled reason code preferred) | NULL | – | – | Structured approve/decline reason. V1 may be free text; controlled codes give better reporting. |
| waitlist_until | date / timestamptz | NULL | – | – | Re-evaluation time when waitlisted. Optional. |
| created_at | timestamptz | NOT NULL | now() | – | Record creation. |
| created_by_user_id | uuid | NULL | – | USERS.ID_User | Creator. |
| updated_at | timestamptz | NOT NULL | now() | – | Last change. |
| updated_by_user_id | uuid | NULL | – | USERS.ID_User | Last modifier. |

## Enums / allowed values
- **status**
  - `draft` – not yet completed.
  - `submitted` – user submitted.
  - `under_review` – Fikirhane started reviewing.
  - `approved` – accepted.
  - `waitlisted` – may be suitable but membership not granted yet.
  - `declined` – rejected.
  - `withdrawn` – user withdrew.
  - `expired` – no longer valid.
- **decision_reason** (example codes): `approved_profile_fit`, `approved_active_participation`, `waitlist_capacity`, `declined_incomplete_profile`, `declined_policy`.
- **Audit event codes**: `application.submitted`, `application.review_started`, `application.approved`, `application.waitlisted`, `application.declined`, `application.withdrawn`.

## Constraints & indexes
- PK: ID_MembershipApplication.
- FKs NOT NULL: ID_User, ID_MembershipType.
- Partial UNIQUE (ID_User, ID_MembershipType) WHERE status IN open states (MAPP-D03). "Open" not precisely defined; reasonably `draft`, `submitted`, `under_review`, `waitlisted`.
- Stricter optional variant: partial UNIQUE (ID_User) WHERE open — max one open application across all types.
- On insert: MEMBERSHIP_TYPES.status must be `active` (MAPP-D02).
- On insert: reject if user has an active USER_MEMBERSHIPS of the same type (MAPP-D09).
- No hard delete (at least for declined/withdrawn; MAPP-D06).

## Relationships
- USERS 1 — N MEMBERSHIP_APPLICATIONS; MEMBERSHIP_TYPES 1 — N MEMBERSHIP_APPLICATIONS.
- MEMBERSHIP_APPLICATIONS 1 — 0..1 USER_MEMBERSHIPS via USER_MEMBERSHIPS.ID_MembershipApplication (nullable; NULL for admin grants).
- reviewed_by / created_by / updated_by -> USERS.ID_User.

## Business rules / data rules
1. MAPP-D01: Each application references a valid User and Membership Type.
2. MAPP-D02: No new application for inactive/archived Membership Type.
3. MAPP-D03: A user cannot have more than one open application for the same Membership Type (stricter option: one open application for any type) — prevents duplicate reviews.
4. MAPP-D04: When approved, a separate USER_MEMBERSHIPS record must be created (then membership becomes active).
5. MAPP-D05: The approved application is not converted into the membership record; both remain separate.
6. MAPP-D06: Declined/withdrawn applications are not hard-deleted.
7. MAPP-D07: motivation/need/offer texts at submission time are preserved as snapshots (later profile Need/Offer changes must not alter them).
8. MAPP-D08: Membership approval must be audited.
9. MAPP-D09: A user with an active membership cannot re-apply for the same type (Premium upgrade application is allowed separately).
10. MAPP-D10: Decision outcome must not produce User Roles or Club Roles; it affects only the membership lifecycle.
11. Visitors can (and normally do) use this table: Visitor -> Application -> Approved -> Member.
12. Withdrawal: user sets status = withdrawn; record is kept.
13. Declined users may reapply, possibly after a waiting period (e.g. `reapply_after_days = 90`) defined as a business rule, not a column.
14. "Premium application requires active Member" is a possible business rule — to be defined in Rules doc, not schema.
15. No automatic/opaque application score (e.g. `application_score = 78`); admin decides using explainable criteria (profile complete, attended events, active contributor, clear need/offer). A future recommendation score must not replace the decision.
16. Curation inputs considered (not copied here): profile completeness, events attended, attendance, referrals, Interests, Skills, Need/Offer, contribution potential.
17. Audit events must be logged: application.submitted, application.review_started, application.approved, application.waitlisted, application.declined, application.withdrawn; reviewed_by_user_id and decision_note are especially important.
18. Typical transitions: draft -> submitted -> under_review -> approved | waitlisted | declined; withdrawn by user; expired when no longer valid.

## Superseded / rejected ideas
- Managing applications as USER_MEMBERSHIPS.status = pending — rejected (separate table).
- Converting the approved application into the membership — rejected.
- application_score / automatic scoring — rejected for V1.
- Copying curation data (events, interests, skills) into the application — rejected.
- reapply_after_days column — not needed (business rule).
- Premium-requires-Member embedded in schema — rejected (rules doc).

## Open questions
- submitted_at marked required but drafts exist before submission — nullable until submitted?
- Exact definition of "open" statuses for MAPP-D03; per-type vs any-type restriction.
- decision_reason free text vs controlled code list in V1.
- Waiting period after decline (90 days example) and whether Premium requires active Member.
- Trigger/conditions for `expired` status; no audit event listed for expired.
- Whether user-visible decision text is needed (decision_note is internal).

## Example row
`ID_MembershipApplication=mapp_1001, ID_User=usr_AHMET, ID_MembershipType=mtype_MEMBER, status=approved, motivation_text="Fikirhane topluluğuna düzenli katılmak ve girişimcilik/networking etkinliklerinde aktif olmak istiyorum.", offer_text="Financial modeling ve startup finance konusunda katkı sağlayabilirim.", need_text="Teknoloji girişimcileri ve yatırımcılarla bağlantı kurmak istiyorum.", submitted_at=2026-09-10 11:20, reviewed_at=2026-09-12 14:00, reviewed_by_user_id=usr_ADMIN, decision_note="Profile complete, attended 3 events, good community fit.", decision_reason=approved_profile_fit, waitlist_until=NULL, created_at=2026-09-10 11:10, created_by_user_id=usr_AHMET, updated_at=2026-09-12 14:00, updated_by_user_id=usr_ADMIN`
