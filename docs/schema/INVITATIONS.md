# INVITATIONS

## Purpose
Operational table: one row = one invitation sent to a specific person (existing User or guest), by a User or an Organization, optionally within a Campaign and/or for a specific Event, with its lifecycle status. Answers "whom did we invite, who invited, which campaign/event is it tied to, and what was the outcome?".
NOT stored here: free usage rights (-> FREEPASSES, incl. usage_limit), actual reservations/participation (-> BOOKINGS), campaign rationale (-> CAMPAIGNS), acquisition snapshot (-> USER_ACQUISITIONS), analytics counters (derived). CAMPAIGN = why/which program; INVITATION = who was invited; FREEPASS = what right was given; BOOKING = which event was actually booked.

## Final fields
Final ("nihai sade") field set:

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Invitation | uuid | NOT NULL | generated | PK | Immutable (doc example `inv_10001`). |
| ID_Campaign | uuid | NULL | | CAMPAIGNS.ID_Campaign | Set if created within a campaign; NULL for private individual invitations. |
| ID_Event | uuid | NULL | | EVENTS.ID_Event | Set for specific-event invitation; NULL = general Fikirhane invitation. |
| invited_by_user_id | uuid | NULL | | USERS.ID_User | User who sent it (e.g. Member Ahmet -> Bring a Guest). |
| invited_by_organization_id | uuid | NULL | | ORGANIZATIONS.ID_Organization | Inviting organization (e.g. sponsor ABC Ltd inviting employee/guest). |
| invited_user_id | uuid | NULL | | USERS.ID_User | Invitee if already a User (guest contact snapshot may still be stored, not required). |
| guest_first_name | text | NULL | | | Invitee first name if not a User. |
| guest_last_name | text | NULL | | | Invitee last name if not a User. |
| guest_email | text | NULL | | | Invitee email. |
| guest_phone | text | NULL | | | Invitee phone. |
| invitation_code | text | NOT NULL | generated (random) | | Unique invitation code or URL token (e.g. `INV-7XK2P9`). Unique, hard to guess, immutable if possible, sufficiently random if used as authorization token. |
| invitation_type | enum | NOT NULL | | | Functional type; used for reporting and to determine booking behaviour. |
| source | enum / text | NULL | | | Distribution/source channel (NOT campaign type). |
| status | enum | NOT NULL | `draft` (implied) | | Lifecycle. |
| sent_at | timestamptz | NULL | | | When actually delivered; need not equal created_at (e.g. created 09:00, sent 11:30). |
| expires_at | timestamptz | NULL | | | Validity end (e.g. 2026-10-10 23:59). |
| accepted_at | timestamptz | NULL | | | When accepted (e.g. 2026-10-04 13:20). |
| claimed_by_user_id | uuid | NULL | | USERS.ID_User | Set when a guest uses the invite link and creates/links an account; useful for attribution. |
| cancelled_at | timestamptz | NULL | | | Cancellation time. |
| notes | text | NULL | | | Internal note. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | USERS.ID_User | |
| ID_Club | uuid | NULL | | CLUBS.ID_Club | (V2/optional) Only if club invitations are actually used; target club. Acceptance may create a CLUB_USERS row. |

## Enums / allowed values
- invitation_type: `general`, `event`, `bring_a_guest`, `campaign`, `organization_guest`, `club_invitation`, `membership_invitation`
- source: `email`, `sms`, `whatsapp`, `qr`, `physical_card`, `instagram`, `linkedin`, `staff`, `partner` (note: doc's own example row uses `mobile_app`, which is not in this list — see inconsistencies)
- status:
  - `draft` — not yet sent
  - `sent` — invitation sent
  - `opened` — link opened (only if open tracking is done; otherwise not needed)
  - `accepted` — accepted / claimed
  - `expired` — validity ended
  - `cancelled` — withdrawn
  - `declined` — invitee declined

## Constraints & indexes
- PK ID_Invitation (immutable).
- UNIQUE(invitation_code).
- CHECK (INV-D05): invitee identified by invited_user_id OR sufficient guest contact info (guest_email and/or guest_phone, presumably with name).
- CHECK: at least one inviter source — invited_by_user_id or invited_by_organization_id — or a system/campaign source (ID_Campaign). Both inviter fields usually not filled at once.
- Duplicate control (business rule, admin can override): no new invitation if same campaign + same normalized guest email + an open invitation exists (e.g. partial unique on (ID_Campaign, lower(guest_email)) WHERE status in open states — admin override allowed so likely app-level).
- Expired/cancelled invitations cannot be claimed.

## Relationships
- CAMPAIGNS 1 — N INVITATIONS (optional)
- EVENTS 1 — N INVITATIONS (optional)
- USERS 1 — N INVITATIONS as inviter, invitee, claimer, creator
- ORGANIZATIONS 1 — N INVITATIONS as inviter
- INVITATIONS 1 — N FREEPASSES (FREEPASSES.ID_Invitation, optional)
- INVITATIONS 1 — N BOOKINGS (BOOKINGS.ID_Invitation, optional); for single-use guest invitations max one active/successful booking
- INVITATIONS 1 — N USER_ACQUISITIONS (USER_ACQUISITIONS.ID_Invitation)
- CLUBS 1 — N INVITATIONS (optional ID_Club)
- Funnel: Campaign -> Invitation -> Freepass -> Booking (-> Sponsorship Usage for sponsor guest passes)

## Business rules / data rules
1. INV-D01: ID_Invitation unique and immutable.
2. INV-D02: invitation_code unique.
3. INV-D03: Invitation can be created without a Campaign (e.g. Club Lead inviting a speaker; Member Bring a Guest).
4. INV-D04: Invitation can be created without an Event.
5. INV-D05: Invitee must be identified either by a registered User or by sufficient guest contact info.
6. INV-D06: Invitation must not replace Booking or Freepass.
7. INV-D07: Expired/cancelled invitation cannot be used for a new claim (nor new booking).
8. INV-D08: When a guest invitation is claimed, link to the real user via claimed_by_user_id where possible.
9. INV-D09: Invitation history must not be hard deleted.
10. INV-D10: If used for authorization, invitation_code must not be a predictable sequential code.
11. Invitation ≠ Freepass: not every invitation grants a freepass (invited guest may pay normal price). An invitation may produce a Freepass (e.g. Bring a Guest accepted -> FREEPASS created with ID_Invitation, usage_limit = 1 per policy) leading to a 0 TL booking.
12. Invitation may link directly to a Booking via BOOKINGS.ID_Invitation, esp. event invitations that grant no free right.
13. V1: most invitations (esp. single-use guest invites) -> max one active/successful booking per invitation. General Fikirhane invitations used only for acquisition attribution may lead to many bookings. Behaviour determined by invitation_type or linked Freepass.
14. No usage_limit on invitations — usage rights belong to FREEPASSES.usage_limit; invitation stays a communication/invitation lifecycle.
15. Sponsor invitation (invitation_type = organization_guest, invited_by_organization_id set): if it consumes the sponsor's guest-pass quota, link Invitation -> Freepass -> Sponsorship Usage.
16. Club invitation acceptance may create a CLUB_USERS record.
17. Guest-to-User conversion matching possible via invitation_code, email, phone — but auto-merge must be careful; safest is claim by invitation code; email match helps but is not strong ownership proof on its own.
18. Cancellation: if not yet claimed -> can be cancelled. If a Freepass was already created -> Freepass lifecycle evaluated separately; child entitlements must not be silently destroyed when an invitation is cancelled/deleted. Automatic behaviour must be explicitly defined.
19. Acquisition: first-arrival via invitation is snapshotted in USER_ACQUISITIONS (source = referral, ID_Invitation = inv_123) and never changes even with later bookings.
20. Analytics are derived, never stored as counters: sent_count, opened_count, accepted_count, booking_count, attendance_count, conversion_to_paid, conversion_to_member.
21. Bring a Guest flow: inviter Premium Member Ahmet (invited_by_user_id, invitation_type = bring_a_guest, guest_email) -> Mehmet accepts (status = accepted, claimed_by_user_id = Mehmet) -> Freepass per policy.

## Superseded / rejected ideas
- usage_limit on INVITATIONS — rejected (belongs to FREEPASSES).
- Generic polymorphic target (target_type / target_id) — rejected for V1; use explicit nullable FKs (ID_Event, ID_Club).
- Counter fields (sent_count, accepted_count, conversion..., etc.) — rejected; derived metrics.
- Auto-merge by email alone — rejected as ownership proof.
- Hard delete of invitations — rejected.

## Open questions
- Whether ID_Club is added (only "if club invitation is really used").
- Membership invitation target (membership_invitation type exists but no membership FK defined).
- Whether `opened` status is used (depends on open tracking).
- No declined_at timestamp defined for `declined` status.
- Exact definition of "open invitation" states for duplicate check, and admin override mechanism.
- Explicit automatic behaviour for freepass when invitation is cancelled — doc says it must be defined.
- source value list vs example `mobile_app`.

## Example row
ID_Invitation=inv_10001, ID_Campaign=camp_BRING_GUEST, ID_Event=NULL, invited_by_user_id=usr_AHMET, invited_by_organization_id=NULL, invited_user_id=NULL, guest_first_name=Mehmet, guest_last_name=Kaya, guest_email=mehmet@example.com, guest_phone=NULL, invitation_code=INV-7XK2P9, invitation_type=bring_a_guest, source=mobile_app, status=sent, sent_at=2026-10-03 12:30, expires_at=2026-10-10 23:59, accepted_at=NULL, claimed_by_user_id=NULL, cancelled_at=NULL, notes=NULL, created_at=2026-10-03 12:30, created_by_user_id=usr_AHMET, updated_at=2026-10-03 12:30, updated_by_user_id=usr_AHMET
