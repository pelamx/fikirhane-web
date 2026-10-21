# FREEPASSES

## Purpose
One row = a free-usage entitlement ("freepass") granted to a registered User or to a not-yet-registered person (guest): who holds it, its scope (event/club/event type), how many uses, its validity window, and its distribution source. It is NOT the invitation (INVITATIONS), NOT the booking (BOOKINGS), and does NOT store individual uses or a usage counter — each use is a row in FREEPASS_REDEMPTIONS. Price/financial effect is NOT stored here; it is snapshotted on BOOKINGS (price_list_amount / discount_amount / final_price / payment_status). Partial discounts (%50, 100 TL off) are NOT freepasses — they belong to PRICING_RULES / PROMOTIONS.

## Final fields
Authoritative = section 42 "nihai sade field set". `claimed_by_user_id` from the early draft table is dropped (see Superseded); `distribution_source` added.

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Freepass | uuid | NOT NULL | gen | PK | Immutable. Example id style `fp_10001`. |
| ID_Campaign | uuid | NULL | NULL | CAMPAIGNS.ID_Campaign | Set if issued under a Campaign; NULL for one-off admin grants (goodwill, compensation, VIP trial). |
| ID_Invitation | uuid | NULL | NULL | INVITATIONS.ID_Invitation | Set if the freepass resulted from an invitation (e.g. Bring a Guest invitation accepted -> Freepass). |
| ID_User | uuid | NULL | NULL | USERS.ID_User | Final/single owner. NULL while held by a guest / unclaimed physical card; filled with the claiming User on claim. |
| issued_to_name | text | NULL | NULL | | Guest / holder name snapshot (when no User). |
| issued_to_email | text | NULL | NULL | | Guest e-mail snapshot. |
| issued_to_phone | text | NULL | NULL | | Guest phone snapshot. |
| freepass_code | text | NOT NULL | generated | | Unique claim/redemption code, e.g. `FP-X8D4K2`; used in QR / physical cards. Hard-to-guess, non-sequential, securely generated. |
| freepass_type | enum freepass_type | NOT NULL | | | Functional type (see Enums). |
| distribution_source | enum/text | NULL | NULL | | Channel through which this pass was distributed (see Enums). Added in final set for "freepass source conversion" analysis. |
| valid_from | timestamptz | NOT NULL | | | Start of validity. When created from a Campaign: = issue date. |
| valid_until | timestamptz | NOT NULL | | | End of validity. From Campaign: issue date + CAMPAIGNS.default_freepass_valid_days. No new redemptions after this. |
| usage_limit | int | NOT NULL | (Campaign default, typically 1) | | Max number of uses. Snapshot of CAMPAIGNS.default_freepass_usage_limit when campaign-issued. Most passes = 1; 3, 5 possible. |
| booking_unit_grant | enum booking_unit_grant | NULL | NULL | | location/table/seat level grant. Use only if a campaign/promotional right actually needs it; freepass does not imply premium seat selection. |
| ID_Event | uuid | NULL | NULL | EVENTS.ID_Event | Eligibility: only valid for this Event. |
| ID_Club | uuid | NULL | NULL | CLUBS.ID_Club | Eligibility: only valid for this Club's events. |
| event_type | enum event_type | NULL | NULL | (EVENTS.event_type values) | Eligibility: only valid for this event type (e.g. `workspace`). |
| status | enum freepass_status | NOT NULL | 'active' | | Persistent lifecycle: active / cancelled / expired. |
| issued_at | timestamptz | NOT NULL | now() | | When the entitlement was granted; need not equal campaign dates. |
| issued_by_user_id | uuid | NULL | NULL | USERS.ID_User | Granting user (FIKIRHANE_ADMIN, Club Lead, Staff). NULL if system-generated (AuditLog actor_type covers it). |
| claimed_at | timestamptz | NULL | NULL | | When a guest bound the code to a User account. |
| cancelled_at | timestamptz | NULL | NULL | | |
| cancelled_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| cancellation_reason | text | NULL | NULL | | |
| notes | text | NULL | NULL | | Internal note. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | NULL | USERS.ID_User | |

## Enums / allowed values
- **freepass_type** (starting set): `trial`, `campaign`, `referral`, `guest`, `sponsor_guest`, `compensation`, `vip`, `manual`. Examples: Bring a Guest -> `referral`; from sponsor quota -> `sponsor_guest`.
- **distribution_source** (examples): `instagram`, `linkedin`, `email`, `university_partner`, `gym_partner`, `physical_card`, `admin`, `referral`, `sponsor`.
- **booking_unit_grant**: `location`, `table`, `seat` (same value set as BOOKINGS.booking_unit).
- **event_type**: values from EVENTS.event_type (agreed set there: `workspace`, `meetup`, `workshop`, `talk`, `class`, `social`). Doc examples: `workspace`, `meetup`.
- **status** (persistent, V1 chosen): `active`, `cancelled`, `expired`.
- **Derived availability** (computed in UI/backend, NOT stored): `available`, `partially_used`, `fully_used`, `expired`, `cancelled`.

## Constraints & indexes
- PK ID_Freepass (immutable).
- UNIQUE(freepass_code).
- CHECK usage_limit > 0.
- CHECK valid_until > valid_from.
- CHECK owner-or-claimable: ID_User IS NOT NULL OR enough guest/code info to claim (freepass_code always present; a physical card may have ID_User and issued_to_email both NULL — code alone suffices).
- If status = 'cancelled' then cancelled_at (and ideally cancelled_by_user_id, cancellation_reason) required.
- Suggested indexes: ID_Campaign, ID_Invitation, ID_User, (status, valid_until), ID_Event, ID_Club.

## Relationships
- CAMPAIGNS 1 — N FREEPASSES (optional).
- INVITATIONS 1 — N FREEPASSES (optional).
- USERS 1 — N FREEPASSES (owner, optional until claim).
- FREEPASSES 1 — N FREEPASS_REDEMPTIONS N — 1 BOOKINGS.
- EVENTS / CLUBS 1 — N FREEPASSES (optional eligibility scope).
- Indirect: CLUB_SPONSORSHIPS -> SPONSORSHIP_USAGE (usage_type=guest_pass) -> FREEPASS (freepass_type=sponsor_guest); linked via SPONSORSHIP_USAGE.reference_type/reference_id.
- USER_ACQUISITIONS.ID_Freepass may point here.

## Business rules / data rules
1. FP-D01: ID_Freepass unique and immutable.
2. FP-D02: freepass_code unique; hard to guess, preferably non-sequential, securely generated if used as claim/redemption token.
3. FP-D03: A freepass can be created without a Campaign or Invitation.
4. FP-D04: A freepass must either be bound to a User or have sufficient guest/code info to be claimed.
5. FP-D05: usage_limit > 0.
6. FP-D06: valid_until > valid_from.
7. FP-D07: Expired or cancelled freepasses cannot produce new redemptions.
8. FP-D08: Count of successful (active) redemptions must not exceed usage_limit; override requires a special permission.
9. FP-D09: Redemption requires the target Event to satisfy the freepass's Event/Club/EventType eligibility.
10. FP-D10: Freepass usage history is never hard deleted.
11. FP-D11: Using a freepass must preserve list price and the granted discount in the Booking price snapshot (price_list_amount=500, discount_amount=500, final_price=0, payment_status=waived) so campaign cost / commercial value can be measured.
12. FP-D12: Changing Campaign defaults must not retroactively change existing freepasses (values are snapshotted at creation).
13. Used count and remaining usage are NOT stored: used = COUNT(active FREEPASS_REDEMPTIONS); remaining = usage_limit − used.
14. Scope semantics: all non-NULL eligibility fields (ID_Event, ID_Club, event_type) must be satisfied together (AND). All NULL = valid for any eligible Event.
15. Freepass is always a 100% free entitlement (by definition).
16. Guest flow: ID_User NULL + issued_to_* snapshot; on account creation/claim, set ID_User = claiming User and claimed_at. If issued directly to a registered User, no claim needed.
17. Physical cards: batches (e.g. 100 cards) pre-generated with freepass_code, ID_User and issued_to_email NULL; bound to a User when code is claimed (university/gym/company partner distribution). Digital (e.g. Instagram campaign: unique code/link -> user claims -> booking) uses the same model.
18. Booking flow: User selects Event -> system finds valid freepass -> eligibility validation -> usage limit validation -> Booking created -> FREEPASS_REDEMPTION created -> Booking price 0 / discount applied.
19. Expiration: a freepass with valid_until < now must not be used. status may be physically set to `expired` by a scheduled job, but validation must ALWAYS also check dates.
20. Cancellation: set status=cancelled + cancelled_at, cancelled_by_user_id, cancellation_reason; no hard delete.
21. A used freepass's past redemptions are never deleted; if a booking is cancelled and the right is returned, the redemption is set to `reversed` (usage counts only active redemptions).
22. issued_by_user_id may be NULL for system-generated passes; actor captured by AuditLog actor_type.
23. Sponsor guest pass: sponsor quota consumption is in SPONSORSHIP_USAGE; the guest's right is the FREEPASS (freepass_type=sponsor_guest). Two separate ledgers.
24. distribution_source allows comparing conversion per channel within the same campaign (Instagram -> booking vs University -> booking).

## Superseded / rejected ideas
- `claimed_by_user_id` — dropped in final set; ID_User is the single owner field, filled on claim (avoid two owner fields).
- Rich persistent status set `issued / claimed / partially_used / used / expired / cancelled` — rejected in favor of `active / cancelled / expired` + derived usage state.
- `remaining_usage` / `used_count` stored field — rejected; derived from redemptions.
- Partial-discount freepasses (%50 off, 100 TL off) — rejected; belong to PRICING_RULES / PROMOTIONS.
- `FREEPASS_ELIGIBILITY_RULES` table / generic rule engine — not for V1 (possible future if eligibility conditions grow).
- `BOOKINGS.ID_Freepass` as source of truth — considered redundant; FREEPASS_REDEMPTIONS is the source of truth (Booking field at most optional convenience).

## Open questions
- Whether `expired` status is set by a scheduled job or purely derived (doc accepts either; date validation mandatory regardless).
- Whether to keep BOOKINGS.ID_Freepass as a convenience reference at all.
- Exact permission code for exceeding usage_limit (override) not named.
- Whether distribution_source is a strict enum or free text (listed as examples).
- Concrete semantics of booking_unit_grant interacting with membership seat rules.

## Example row
ID_Freepass=fp_10001, ID_Campaign=camp_LAUNCH_FREEPASS_2026, ID_Invitation=NULL, ID_User=usr_AYSE, issued_to_name/email/phone=NULL, freepass_code=FP-X8D4K2, freepass_type=campaign, distribution_source=instagram, valid_from=2026-10-01 00:00, valid_until=2026-10-08 23:59, usage_limit=1, booking_unit_grant=seat, ID_Event=NULL, ID_Club=NULL, event_type=workspace, status=active, issued_at=2026-10-01 09:30, issued_by_user_id=NULL, claimed_at=2026-10-01 09:35, cancelled_*=NULL, notes="Launch campaign freepass.", created_at=2026-10-01 09:30, created_by_user_id=NULL, updated_at=2026-10-01 09:35, updated_by_user_id=usr_AYSE.
