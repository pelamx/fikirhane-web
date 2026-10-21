# SPONSORSHIP_USAGE

## Purpose
One row = a single consumption movement of a right defined in a Club Sponsorship (how much of which right was used, when, in what context). It is an entitlement-consumption ledger used to compute used/remaining sponsor rights. It does NOT define rights (SPONSORSHIP_PLANS defaults / CLUB_SPONSORSHIPS agreed snapshot), does NOT record money (DOCUMENTS / TRANSACTIONS), and does NOT represent the guest's own free right (FREEPASSES).

## Final fields
No explicit "final set" section; proposed table (section 3) + example record are authoritative.

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_SponsorshipUsage | uuid | NOT NULL | gen | PK | Single usage record, not a right definition. Example `susage_001`. |
| ID_ClubSponsorship | uuid | NOT NULL | | CLUB_SPONSORSHIPS.ID_ClubSponsorship | Which sponsorship contract it belongs to. |
| usage_type | enum sponsorship_usage_type | NOT NULL | | | Which right was used (controlled list, aligned with plan right names). |
| quantity | int (doc: Decimal/Integer) | NOT NULL | 1 | | Amount used; > 0. Mostly integer. |
| usage_date | timestamptz (doc: Date/Timestamp) | NOT NULL | now() | | When the right was actually used; important for reporting period. |
| ID_Event | uuid | NULL | NULL | EVENTS.ID_Event | Related Event (e.g. sponsored_event, event-specific speaker nomination); NULL for non-event usage. |
| ID_User | uuid | NULL | NULL | USERS.ID_User | Related real person (e.g. requesting sponsor representative, nominated speaker). Not mandatory. |
| reference_type | text/enum | NULL | NULL | | Polymorphic link entity type (e.g. `freepass`, `invitation`, `freepass_batch`). |
| reference_id | text (uuid or text) | NULL | NULL | (polymorphic) | ID of linked record (e.g. `fp_123`, `inv_456`, `fpbatch_001`). |
| status | enum sponsorship_usage_status | NOT NULL | 'active' | | Is the usage valid. |
| description | text | NULL | NULL | | Human-readable description. |
| notes | text | NULL | NULL | | Internal note. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | NULL | USERS.ID_User | |

(reference_type/reference_id are optional for V1: doc says one may start with only ID_Event if generic links aren't wanted.)

## Enums / allowed values
- **usage_type** (starting set): `sponsored_event`, `guest_pass`, `content_post`, `speaker_nomination`, `branding`, `other`. Must align with plan right names (sponsored_events_limit, guest_pass_limit, content_post_limit, speaker_nomination_limit).
- **status**: `active` (counts toward used), `reversed` (e.g. erroneously processed passes, sponsored event cancelled), `cancelled`.
- **reference_type** (examples): `freepass`, `invitation`, `freepass_batch`.

## Constraints & indexes
- PK ID_SponsorshipUsage.
- ID_ClubSponsorship NOT NULL, valid FK (SUSE-D01).
- CHECK quantity > 0 (SUSE-D03) — negative-quantity reversal rows not used in V1.
- usage_type restricted to controlled list (SUSE-D02).
- Validation: usage_date within sponsorship start_date..end_date; exceptions must be audited (SUSE-D04).
- Validation: SUM(quantity WHERE status='active' AND usage_type=X) ≤ agreed limit for X on CLUB_SPONSORSHIPS; override requires special permission (SUSE-D05).
- Index (ID_ClubSponsorship, usage_type, status); index (reference_type, reference_id); ID_Event.

## Relationships
- CLUB_SPONSORSHIPS 1 — N SPONSORSHIP_USAGE.
- EVENTS 1 — N SPONSORSHIP_USAGE (optional).
- USERS 1 — N SPONSORSHIP_USAGE (optional).
- Polymorphic to FREEPASSES / INVITATIONS / (freepass batch) via reference_type/reference_id.
- Chain: CLUB_SPONSORSHIP -> SPONSORSHIP_USAGE -> FREEPASS -> FREEPASS_REDEMPTION -> BOOKING.

## Business rules / data rules
1. SUSE-D01: Every usage links to a valid Club Sponsorship.
2. SUSE-D02: usage_type is a controlled list.
3. SUSE-D03: quantity > 0.
4. SUSE-D04: Usage must fall within the sponsorship's valid date range; exceptions must be audited.
5. SUSE-D05: Total usage must not exceed the agreed entitlement limit; override requires special permission.
6. SUSE-D06: Reversed/cancelled usage excluded from remaining-rights calculation (only status=active summed).
7. SUSE-D07: Usage does not substitute financial payment (e.g. "sponsor paid 150,000 TRY" is not stored here).
8. SUSE-D08: Usage generated automatically whenever possible (Sponsor Freepass issued -> usage created; Event sponsor relation activated -> sponsored_event usage created); manual entry only as exception/fallback.
9. SUSE-D09: Usage history never hard deleted.
10. SUSE-D10: Entitlement calc uses the actual Club Sponsorship agreement's snapshot rights (e.g. agreed_guest_pass_limit), NOT the current Sponsorship Plan values. Plan = default; Club Sponsorship = agreed entitlement = real limit.
11. Remaining = agreed limit − SUM(active quantity for usage_type), e.g. 50 − 32 = 18. No stored remaining_* field.
12. Each sponsored event = one row usage_type=sponsored_event, quantity=1, ID_Event set (7 rows -> 7 used, 5 remaining of 12).
13. Each published content post = one row usage_type=content_post, quantity=1, usage_date.
14. Speaker nomination counts as used only when ACCEPTED by Fikirhane, not when submitted (rejected nominations don't consume rights).
15. Guest pass: quota decremented here; the guest's actual right is a FREEPASS (freepass_type=sponsor_guest). Sponsor gives 1 guest pass -> FREEPASS created -> usage quantity=1. Batch issuance can be one row with quantity=N (e.g. 5) referencing a freepass batch.
16. Cancellation of usage (e.g. sponsored event cancelled): set status=reversed (preferred over negative-quantity rows in V1).
17. Audit: `sponsorship_usage.created`, `sponsorship_usage.reversed` should be audited, especially manual usage/reversal.

## Superseded / rejected ideas
- Single counter fields like `used_guest_pass = 15` / `remaining_guest_pass` — rejected (loses history, context, audit; remaining is derived).
- Negative quantity rows for reversal — technically possible but rejected for V1 in favor of status reversal.
- Separate FK per usage type — avoided via reference_type/reference_id.
- Computing limits from current plan values — rejected.
- Hard delete — rejected.

## Open questions
- Whether to include reference_type/reference_id in V1 or only ID_Event.
- quantity type: integer vs decimal.
- usage_date: date vs timestamp.
- What limit applies to usage_type `branding` / `other` (no plan limit field).
- Freepass batch entity (`freepass_batch` reference) has no defined table.
- Exact override permission code not specified.

## Example row
ID_SponsorshipUsage=susage_1001, ID_ClubSponsorship=cspon_1001, usage_type=guest_pass, quantity=5, usage_date=2027-03-15 10:30, ID_Event=event_ENGLISH_NETWORKING_0315, ID_User=usr_SPONSOR_REP, reference_type=freepass_batch, reference_id=fpbatch_001, status=active, description="5 sponsor guest passes issued for English Networking Night.", notes=NULL, created_at=2027-03-15 10:30, created_by_user_id=usr_ADMIN, updated_at=2027-03-15 10:30, updated_by_user_id=usr_ADMIN.
