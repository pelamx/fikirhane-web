# SPONSORSHIP_PLANS

## Purpose
One row = a standard, reusable sponsorship package template (e.g. Supporting Sponsor, Club Partner, Main Sponsor) with default duration, default fee, billing period and basic right limits. It does NOT store the actual sponsorship contract (CLUB_SPONSORSHIPS), is NOT tied to any Club or Organization, holds no contact persons (Organization/User relations), no real revenue (DOCUMENTS / DOCUMENT_ITEMS / TRANSACTIONS), and no usage of rights (SPONSORSHIP_USAGE).

## Final fields
No explicit "final set" section; proposed table (section 3) + example record are authoritative.

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_SponsorshipPlan | uuid | NOT NULL | gen | PK | Immutable. Example `splan_001` / `splan_MAIN`. Referenced by CLUB_SPONSORSHIPS.ID_SponsorshipPlan. |
| plan_code | text | NOT NULL | | | Technical stable code, unique. |
| plan_name | text | NOT NULL | | | Display name. |
| description | text | NULL | NULL | | Package scope. |
| default_duration_months | int | NULL | NULL | | Standard duration (e.g. 12); default only — real dates on CLUB_SPONSORSHIPS.start_date/end_date. |
| default_fee_amount | numeric(p,2) | NULL | NULL | | Standard list price (e.g. 150000.00); actual amount snapshotted on CLUB_SPONSORSHIPS.fee_amount. |
| currency_code | text (ISO 4217) | NULL | NULL | | Default currency (TRY / EUR / USD). |
| billing_period | enum billing_period | NULL | NULL | | Default billing structure; overridable in actual agreement. |
| sponsored_events_limit | int | NULL | NULL | | Number of events the sponsor may sponsor during the plan (e.g. 12). |
| guest_pass_limit | int | NULL | NULL | | Number of free guest passes/invites (e.g. 50); usage tracked in SPONSORSHIP_USAGE. |
| content_post_limit | int | NULL | NULL | | Sponsor content posts on Fikirhane channels (e.g. 6). |
| speaker_nomination_limit | int | NULL | NULL | | Speaker nominations for Club/Event (e.g. 4); nomination right only, not automatic speaker assignment. |
| branding_level | enum branding_level | NULL | NULL | | Brand visibility tier. |
| priority_level | int | NULL | NULL | | Hierarchical ordering/comparison (10 Supporting, 20 Club Partner, 30 Main Sponsor); not a source of permissions/rights. |
| status | enum sponsorship_plan_status | NOT NULL | 'active' | | |
| sort_order | int | NULL | NULL | | UI ordering. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | NULL | USERS.ID_User | |

## Enums / allowed values
- **billing_period** (listed here): `one_time`, `monthly`, `quarterly`, `annual`. (CLUB_SPONSORSHIPS adds `custom` — use shared enum incl. `custom`.)
- **branding_level**: `basic` (sponsor page listing), `standard` (event logo presence), `enhanced` (club page branding), `main` (primary sponsor visibility). Details to be explained in business rules/docs.
- **status**: `active` (usable for new sponsorships), `inactive` (not usable for new agreements; existing history stays), `archived` (no longer used package).

## Constraints & indexes
- PK ID_SponsorshipPlan (immutable).
- UNIQUE(plan_code).
- No FK to Club or Organization (by design).
- Suggested CHECK limits >= 0 when set (implied).

## Relationships
- SPONSORSHIP_PLANS 1 — N CLUB_SPONSORSHIPS.
- Indirect: plan limits are the defaults for CLUB_SPONSORSHIPS agreed_* snapshots, consumed via SPONSORSHIP_USAGE.

## Business rules / data rules
1. SPLAN-D01: ID_SponsorshipPlan unique and immutable.
2. SPLAN-D02: plan_code unique.
3. SPLAN-D03: Plan is a reusable template; must not be tied to a specific Club or Organization.
4. SPLAN-D04: Plan default fee does not substitute real financial revenue.
5. SPLAN-D05: Plan values can be overridden in the actual sponsorship.
6. SPLAN-D06: Plan changes must not retroactively alter past/active sponsorship contracts (e.g. guest_pass_limit 50 -> 30 must not reduce existing sponsors' rights). V1 solution: snapshot critical rights onto CLUB_SPONSORSHIPS (agreed_guest_pass_limit, agreed_event_limit, ...).
7. SPLAN-D07: Inactive/archived plans cannot be used for new sponsorships.
8. SPLAN-D08: Consumed sponsorship rights are tracked in SPONSORSHIP_USAGE, not here.
9. Remaining rights = agreed limit − SUM(active usage) (e.g. 50 − 38 = 12), computed via SPONSORSHIP_USAGE (usage_type=guest_pass, quantity=1 per use).
10. V1 keeps a few basic limits directly on plan rather than a generic rights table.
11. Start with 3 plans; no more tiers needed initially.

## Superseded / rejected ideas
- Repeating package rights on each CLUB_SPONSORSHIPS record without a master — rejected (central definition).
- Separate `SPONSORSHIP_ENTITLEMENTS` table — "cleaner" alternative, deferred; V1 snapshots on Club Sponsorship.
- Sponsor contact/person on plan — rejected.
- ID_Club on plan — rejected.
- ID_Organization on plan — rejected.
- More than 3 initial tiers — unnecessary.

## Open questions
- Whether `custom` billing_period is valid on plans (only listed on CLUB_SPONSORSHIPS).
- Exact branding_level benefits (to be documented).
- Whether a `branding` usage limit exists (SPONSORSHIP_USAGE has usage_type `branding` but plan has only branding_level, no limit).

## Example row
ID_SponsorshipPlan=splan_MAIN, plan_code=MAIN_SPONSOR, plan_name="Main Sponsor", description="Club'ın ana sponsoru için yıllık yüksek görünürlük ve etkinlik/guest pass hakları içeren paket.", default_duration_months=12, default_fee_amount=150000.00, currency_code=TRY, billing_period=annual, sponsored_events_limit=12, guest_pass_limit=50, content_post_limit=6, speaker_nomination_limit=4, branding_level=main, priority_level=30, status=active, sort_order=30, created_at=2026-09-22 17:00, created_by_user_id=usr_ADMIN, updated_at=2026-09-22 17:00, updated_by_user_id=usr_ADMIN.

## Seed data
Initial 3 plans (codes/names verbatim; positioning from §12, priority from §priority_level example). Only Main Sponsor has full values in the doc.

| plan_code | plan_name | positioning | priority_level | other values |
|---|---|---|---|---|
| SUPPORTING | Supporting Sponsor | low/medium visibility (düşük/orta görünürlük) | 10 | not specified |
| CLUB_PARTNER | Club Partner | regular Club collaboration (düzenli Club işbirliği) | 20 | not specified |
| MAIN_SPONSOR | Main Sponsor | main sponsor / high visibility | 30 | duration 12 mo, fee 150000.00 TRY, annual, 12 events, 50 guest passes, 6 content posts, 4 speaker nominations, branding_level=main, sort_order=30 |
