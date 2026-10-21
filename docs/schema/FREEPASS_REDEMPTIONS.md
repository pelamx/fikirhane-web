# FREEPASS_REDEMPTIONS

## Purpose
One row = one actual use of a FREEPASS entitlement against a specific BOOKING (when, and whether that use is still valid). It is a small, immutable-style usage ledger; FREEPASSES.usage_limit is compared against the count of active rows here. It does NOT store price/financial effect (that is the Booking price snapshot), does NOT copy eligibility info (checked before creation), and is not a money ledger.

## Final fields
Authoritative = section 30 "nihai sade field set" (identical to the proposed table). Doc says: do not grow this table beyond this.

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_FreepassRedemption | uuid | NOT NULL | gen | PK | Each real freepass use is a separate record. Example `fpred_10001`. |
| ID_Freepass | uuid | NOT NULL | | FREEPASSES.ID_Freepass | Which entitlement was used. |
| ID_Booking | uuid | NOT NULL | | BOOKINGS.ID_Booking | Booking the freepass was applied to (chain Freepass -> Redemption -> Booking -> Event/EventOption). |
| redeemed_at | timestamptz | NOT NULL | now() | | Time of use = when the Booking became confirmed. |
| status | enum redemption_status | NOT NULL | 'active' | | Is this use valid (see Enums). |
| reversed_at | timestamptz | NULL | NULL | | Set when use is reversed (right returned). |
| reversed_by_user_id | uuid | NULL | NULL | USERS.ID_User | Who reversed. |
| reversal_reason | text | NULL | NULL | | Reason, e.g. `event_cancelled`. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | NULL | USERS.ID_User | |

## Enums / allowed values
- **status**: `active` — use is valid and counts against usage_limit; `reversed` — right was returned (e.g. booking cancelled within policy / event cancelled by Fikirhane); `cancelled` — redemption transaction invalidated. Doc notes in practice `active`/`reversed` may suffice.

## Constraints & indexes
- PK ID_FreepassRedemption.
- ID_Freepass NOT NULL, ID_Booking NOT NULL (FPRED-D01).
- Partial UNIQUE (ID_Freepass, ID_Booking) WHERE status='active' (FPRED-D05).
- Partial UNIQUE (ID_Booking) WHERE status='active' — V1: max one active freepass redemption per booking (FPRED-D04).
- Application/transactional check: COUNT(active) per ID_Freepass ≤ FREEPASSES.usage_limit (FPRED-D03); enforced atomically (row lock on freepass or equivalent).
- If status='reversed' then reversed_at required (reversed_by_user_id / reversal_reason expected).
- Index on ID_Freepass (for usage count), ID_Booking.

## Relationships
- FREEPASSES 1 — N FREEPASS_REDEMPTIONS.
- BOOKINGS 1 — N FREEPASS_REDEMPTIONS (but V1: ≤1 active per booking). Structure supports future N:N between bookings and freepasses.

## Business rules / data rules
1. FPRED-D01: Every redemption links to a valid Freepass and Booking.
2. FPRED-D02: Created only for a valid, usable freepass (active, within dates, usage available, Event/Club/EventType eligible, user/holder valid).
3. FPRED-D03: Total active redemptions must not exceed FREEPASSES.usage_limit.
4. FPRED-D04: V1 — a Booking has at most one active freepass redemption (freepass is the single entitlement that makes a booking fully free; may change with future combined promotion/credit system).
5. FPRED-D05: No duplicate active redemption for the same Freepass + Booking.
6. FPRED-D06: Reversed redemptions do not count toward the usage limit (used = COUNT(status='active'); remaining = usage_limit − used). FREEPASSES.used_count not needed.
7. FPRED-D07: Booking cancellation does NOT automatically reverse the redemption; the cancellation policy decides. Example policy: cancellation < 24h before event start -> right not returned (Booking=cancelled, Redemption=active).
8. FPRED-D08: No-show -> redemption stays active (consumed) by default (Booking=no_show, Redemption=active) to discourage no-shows on free bookings.
9. FPRED-D09: Never hard delete; erroneous use -> status=reversed. History preserved.
10. FPRED-D10: Freepass validation + redemption creation done atomically in one transaction where possible (check remaining usage + create redemption) — prevents double-use from two concurrent browser windows on a usage_limit=1 pass.
11. Timing: redemption is created when the Booking is actually **confirmed**, not on booking start; pending_payment or abandoned bookings must not consume the right. Flow: user starts booking -> freepass validated -> booking temporarily created -> booking confirmed -> redemption created (same transaction ideally).
12. Timely user cancellation where right is to be returned: status=reversed, reversed_at=now -> freepass usable again.
13. Event cancelled by Fikirhane: Event cancelled -> Booking cancelled -> Redemption reversed -> Freepass available again.
14. Booking completed: redemption stays active; no further status change (ledger).
15. Freepass with usage_limit>1 can be redeemed on multiple bookings; usage_limit=1 -> after 1 active redemption no longer available.
16. Price is not stored here; Booking snapshot holds price_list_amount=500, discount_amount=500, final_price=0, payment_status=waived.
17. Audit: `freepass_redemption.created`, `freepass_redemption.reversed` should be audited (esp. reversal); reversed_by_user_id + reversal_reason also stored inline.
18. Levels distinction: SPONSORSHIP_USAGE = what was consumed from sponsor quota; FREEPASS_REDEMPTION = where the user's freepass was used; BOOKING = actual attendance reservation.

## Superseded / rejected ideas
- Tracking usage only via `BOOKINGS.ID_Freepass` — rejected; makes history management hard.
- `FREEPASSES.used_count` counter — not required (derived).
- Copying eligibility info or price into redemption rows — rejected.
- Creating redemption at booking creation / pending_payment — rejected; only on confirmation.
- Hard delete of erroneous redemptions — rejected (use reversed).
- Adding more fields — doc explicitly says not to grow the table.

## Open questions
- Whether `cancelled` status is needed in addition to `reversed` (doc: active/reversed may suffice).
- Exact cancellation-policy parameters (24h is an example rule) and where they are configured.
- Who may reverse (permission code not specified).

## Example row
ID_FreepassRedemption=fpred_10001, ID_Freepass=fp_10001, ID_Booking=booking_50001, redeemed_at=2026-10-04 10:32, status=active, reversed_at/by/reason=NULL, created_at=2026-10-04 10:32, created_by_user_id=usr_AYSE, updated_at=2026-10-04 10:32, updated_by_user_id=usr_AYSE.
Reversal example: fpred_1001, status=reversed, reversed_at=2026-10-04 16:00, reversal_reason=event_cancelled.
