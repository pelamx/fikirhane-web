# CAMPAIGNS

## Purpose
One row = the umbrella identity of an acquisition / invitation / freepass / promotion / community-growth program (e.g. Launch Freepass Campaign, University Outreach, Bring a Guest, Corporate Trial Week) plus default rules for freepasses issued under it. It does NOT store individual invitations (INVITATIONS), granted free rights (FREEPASSES), uses (FREEPASS_REDEMPTIONS), or bookings (BOOKINGS); does NOT link users directly (via INVITATIONS / FREEPASSES / USER_ACQUISITIONS); does NOT hold discount mechanics (PRICING_RULES), real expenses (DOCUMENTS / DOCUMENT_ITEMS / TRANSACTIONS), or KPI counters (derived).

## Final fields
Authoritative = section 25 "nihai sade field set" (same as proposed table).

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_Campaign | uuid | NOT NULL | gen | PK | Immutable. Example `campaign_001` / `camp_LAUNCH_FREEPASS_2026`. |
| campaign_code | text | NOT NULL | | | Technical stable code, unique (e.g. `LAUNCH_FREEPASS_2026`). Shared reference for QR, UTM, referral, analytics. |
| campaign_name | text | NOT NULL | | | Display name in UI/reports. |
| campaign_type | enum campaign_type | NOT NULL | | | Purpose classification. |
| description | text | NULL | NULL | | |
| start_at | timestamptz | NULL | NULL | | Campaign active period start; independent of freepass validity. |
| end_at | timestamptz | NULL | NULL | | Campaign active period end. |
| target_audience | text | NULL | NULL | | Human-readable audience description (V1 text, no segment engine). |
| default_freepass_usage_limit | int | NULL | NULL | | Default usage_limit copied to FREEPASSES.usage_limit at creation (e.g. 1). |
| default_freepass_valid_days | int | NULL | NULL | | Default validity: freepass valid_from = issue date, valid_until = issue date + N days (e.g. 7). |
| default_booking_unit_grant | enum booking_unit_grant | NULL | NULL | | Default level of free right (location/table/seat); keep only if it varies between campaigns. |
| status | enum campaign_status | NOT NULL | 'draft' | | Lifecycle. |
| budget_amount | numeric(p,2) | NULL | NULL | | Planned budget (planning value only, not expense ledger). |
| currency_code | text (ISO 4217, char(3)) | NULL | NULL | | Budget currency, e.g. TRY. |
| notes | text | NULL | NULL | | Internal note. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | NULL | USERS.ID_User | |

## Enums / allowed values
- **campaign_type** (starting set): `acquisition`, `freepass`, `referral`, `invitation`, `promotion`, `partnership`, `retention`, `reactivation`. Examples: Launch Freepass -> `freepass`; Bring a Guest -> `referral`; University outreach -> `acquisition`.
- **status**: `draft` (in preparation), `scheduled` (waiting for start date), `active` (running), `paused` (temporarily stopped), `completed` (ended as planned), `cancelled` (cancelled early), `archived` (historical record).
- **default_booking_unit_grant**: `location`, `table`, `seat` (doc examples: location, seat).

## Constraints & indexes
- PK ID_Campaign (immutable).
- UNIQUE(campaign_code).
- Suggested CHECK end_at >= start_at when both set (implied, not stated).
- Suggested CHECK default_freepass_usage_limit > 0, default_freepass_valid_days > 0 when set (consistent with FP-D05; not explicitly stated).

## Relationships
- CAMPAIGNS 1 — N INVITATIONS (INVITATIONS.ID_Campaign, optional).
- CAMPAIGNS 1 — N FREEPASSES (FREEPASSES.ID_Campaign, optional).
- CAMPAIGNS 1 — N USER_ACQUISITIONS (attribution snapshot, ID_Campaign).
- Indirect: Campaign -> Invitation/Freepass -> Booking (performance funnel).
- Optional future: PRICING_RULES may reference a Campaign.

## Business rules / data rules
1. CAMP-D01: ID_Campaign unique and immutable.
2. CAMP-D02: campaign_code unique.
3. CAMP-D03: A campaign does not substitute real Invitation, Freepass or Booking records.
4. CAMP-D04: Invitations and Freepasses can be created without a Campaign (e.g. Club Lead private invite; admin goodwill, complaint compensation, VIP trial freepasses -> ID_Campaign NULL).
5. CAMP-D05: Campaign default entitlement values are copied as snapshots when creating a new Freepass.
6. CAMP-D06: Changing campaign defaults never retroactively changes existing freepasses (e.g. valid_days 7 -> 14 does not extend already-issued passes). Campaign = defaults; Freepass = actual entitlement snapshot.
7. CAMP-D07: Conversion/KPI values derived from related transactional tables (COUNT(INVITATIONS), COUNT(FREEPASS_REDEMPTIONS), COUNT(BOOKINGS)); analytics cache may be added later.
8. CAMP-D08: Completed/archived campaigns are never hard deleted (end via status completed/archived); past invitations, freepasses, conversion reports depend on them.
9. CAMP-D09: Campaign budget does not substitute real financial expense; real marketing costs go through DOCUMENTS / DOCUMENT_ITEMS / TRANSACTIONS.
10. Campaign dates are independent of freepass validity (campaign ending Oct 31 can issue a pass on Oct 30 valid 7 days).
11. Users are not linked directly; reach is tracked via INVITATIONS, FREEPASSES, USER_ACQUISITIONS.
12. Channel tracking: one campaign can be distributed via many channels; V1 tracks channel as a source field on INVITATIONS (`source`) / FREEPASSES (`distribution_source`), not on the campaign.
13. Physical printed passes: a campaign (e.g. "Karaköy Partner Distribution") groups a batch of generated freepass codes; each tracked by the freepass code.
14. Funnel (derived): Campaign -> invitations sent -> freepasses issued/claimed -> bookings -> attendance -> later paid booking -> membership conversion.
15. USER_ACQUISITIONS snapshots campaign/source/medium so attribution history survives campaign changes/deletion.
16. Sponsor campaigns are possible (e.g. "ABC Company Sponsored Freepass Campaign") but no sponsor-organization field in V1.

## Superseded / rejected ideas
- `discount_type` / `discount_value` on campaign — rejected; discount mechanics belong to PRICING_RULES (which may link to a campaign).
- Stored KPIs `invitation_count`, `booking_count`, `conversion_rate` — rejected (derived).
- Complex segment engine for target_audience — rejected (text in V1).
- `ID_Event` on campaign — not recommended; future `CAMPAIGN_EVENTS` junction if needed (not V1).
- `ID_Club` on campaign — not recommended; future `CAMPAIGN_CLUBS` if club campaigns become frequent.
- `ID_SponsoringOrganization` — optional future, not added in first phase.
- `CAMPAIGN_CHANNELS` table — "advanced" option; V1 uses source field instead.
- Direct user link on campaign — rejected.
- Hard delete — rejected.

## Open questions
- Whether default_booking_unit_grant is kept at all (only if it truly varies per campaign).
- Whether status transitions (scheduled -> active, active -> completed) are automatic by dates or manual.
- Precision of budget_amount not stated.

## Example row
ID_Campaign=camp_LAUNCH_FREEPASS_2026, campaign_code=LAUNCH_FREEPASS_2026, campaign_name="Fikirhane Launch Freepass", campaign_type=freepass, description="Opening campaign for first-time community workspace visitors.", start_at=2026-10-01 00:00, end_at=2026-10-31 23:59, target_audience="Startup professionals, freelancers and university graduates in central Istanbul.", default_freepass_usage_limit=1, default_freepass_valid_days=7, default_booking_unit_grant=seat, status=active, budget_amount=NULL, currency_code=TRY, notes="Initial target 10–15 freepass users per day.", created_at=2026-09-20 10:00, created_by_user_id=usr_ADMIN, updated_at=2026-09-20 10:00, updated_by_user_id=usr_ADMIN.

## Seed data
None mandated. Example campaign codes in doc (illustrative, not seed): `LAUNCH_FREEPASS_2026`, `UNIVERSITY_OUTREACH_2026`, `BRING_GUEST`, `IG_SEPT_2026`, `UNI_BAU_2026_10`.
