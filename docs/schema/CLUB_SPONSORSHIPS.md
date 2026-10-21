# CLUB_SPONSORSHIPS

## Purpose
One row = a dated, commercial sponsorship agreement/relationship between one Organization and one Club (who sponsors which Club, for which period, under which plan and fee). It is NOT the Organization itself, NOT the generic "this org is a sponsor" classification (ORGANIZATION_ROLES role_type=sponsor), NOT sponsor representatives (ORGANIZATION_USERS / CLUB_USERS club_role=sponsor_representative), NOT the real revenue/payment (DOCUMENTS / DOCUMENT_ITEMS / TRANSACTIONS / TRANSACTION_ALLOCATIONS), and NOT usage of rights (SPONSORSHIP_USAGE). Standard package definitions live in SPONSORSHIP_PLANS. Event-level sponsorship goes through the event–organization relation (ORGANIZATION_EVENTS), not here.

## Final fields
No explicit "final set" section; the proposed table (section 3) + example record are authoritative. Snapshot entitlement fields are mandated by SPONSORSHIP_PLANS §5 ("V1: snapshot critical rights on Club Sponsorship") and referenced by SPONSORSHIP_USAGE §4 (`agreed_guest_pass_limit`), but are missing from this doc's own field list — included below marked accordingly.

| field | type | null? | default | FK -> table.field | meaning / notes |
|---|---|---|---|---|---|
| ID_ClubSponsorship | uuid | NOT NULL | gen | PK | ID of the relationship itself (not Club or Org id). Example `cspon_001`. |
| ID_Club | uuid | NOT NULL | | CLUBS.ID_Club | Sponsored Club. |
| ID_Organization | uuid | NOT NULL | | ORGANIZATIONS.ID_Organization | Sponsor organization. |
| ID_SponsorshipPlan | uuid | NULL | NULL | SPONSORSHIP_PLANS.ID_SponsorshipPlan | Standard package used; NULL for fully custom deals. |
| sponsorship_name | text | NULL | NULL | | Optional custom name, e.g. "2027 English Club Main Partnership". |
| start_date | date (doc: Date/Timestamp) | NOT NULL | | | Sponsorship start. |
| end_date | date (doc: Date/Timestamp) | NULL | NULL | | Sponsorship end; NULL = open-ended / undetermined. |
| status | enum club_sponsorship_status | NOT NULL | 'draft' | | Lifecycle. |
| fee_amount | numeric(p,2) | NULL | NULL | | Contractual/planned amount (snapshot; may differ from plan default). Not a ledger. |
| currency_code | text (ISO 4217) | NULL | NULL | | TRY / USD / EUR. |
| billing_period | enum billing_period | NULL | NULL | | Commercial structure of contract; actual invoice schedule is in finance. |
| is_primary_sponsor | bool | NOT NULL | false | | Main sponsor of the Club? |
| contract_reference | text | NULL | NULL | | Contract/offer reference, e.g. `ENG-SPON-2027-001`. |
| notes | text | NULL | NULL | | Internal ops note. |
| agreed_guest_pass_limit | int | NULL | (copied from plan.guest_pass_limit) | | (snapshot per SPONSORSHIP_PLANS §5 / SPONSORSHIP_USAGE §4 — not in this doc's list) Agreed guest pass entitlement; real limit for remaining-rights calc. |
| agreed_event_limit | int | NULL | (copied from plan.sponsored_events_limit) | | (snapshot per SPONSORSHIP_PLANS §5 — not in this doc's list) Agreed sponsored events entitlement. |
| agreed_content_post_limit | int | NULL | (copied from plan.content_post_limit) | | (snapshot, implied by "agreed_... ..." — name not stated verbatim) |
| agreed_speaker_nomination_limit | int | NULL | (copied from plan.speaker_nomination_limit) | | (snapshot, implied — name not stated verbatim) |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | NULL | USERS.ID_User | |
| contract_file_id | uuid | NULL | NULL | (document mgmt, TBD) | (V2/optional) Contract file reference if document management is added; V1 uses contract_reference. |
| exclusive_category | text/enum | NULL | NULL | | (V2/optional) Sector exclusivity (e.g. no two bank sponsors in one Club); not in V1. |

## Enums / allowed values
- **status**: `draft` (draft agreement), `pending` (awaiting approval/contract/payment), `active` (valid sponsorship), `expired` (period ended), `cancelled` (cancelled before start or at early stage), `terminated` (active agreement ended early).
- **billing_period**: `one_time`, `monthly`, `quarterly`, `annual`, `custom`.
- **is_primary_sponsor**: true / false (e.g. ABC Ltd -> primary; XYZ Ltd -> supporting).

## Constraints & indexes
- PK ID_ClubSponsorship.
- ID_Club, ID_Organization NOT NULL with valid FKs (CSPON-D01).
- CHECK end_date IS NULL OR end_date >= start_date (implied).
- Primary sponsor rule (business rule, configurable per CSPON-D06): at most 1 active is_primary_sponsor=true per Club in overlapping periods — partial unique / exclusion constraint on (ID_Club, daterange(start_date,end_date)) WHERE is_primary_sponsor AND status='active'. Supporting sponsors unlimited.
- Validation: referenced Organization must be active (CSPON-D02); referenced plan must be status=active at creation (SPLAN-D07).
- Indexes: ID_Club, ID_Organization, ID_SponsorshipPlan, status.

## Relationships
- ORGANIZATIONS 1 — N CLUB_SPONSORSHIPS N — 1 CLUBS (junction entity; club may have many sponsors, org may sponsor many clubs, including over different periods).
- SPONSORSHIP_PLANS 1 — N CLUB_SPONSORSHIPS (optional).
- CLUB_SPONSORSHIPS 1 — N SPONSORSHIP_USAGE.
- Related (not FK here): ORGANIZATION_ROLES (role_type=sponsor), ORGANIZATION_USERS (representative), CLUB_USERS (club_role=sponsor_representative), DOCUMENTS (direction=sale, ID_Organization), DOCUMENT_ITEMS (ID_FinancialCenter = club's center, ID_FinancialCategory = Sponsorship Revenue).

## Business rules / data rules
1. CSPON-D01: Each sponsorship links to a valid Club and Organization.
2. CSPON-D02: Sponsor Organization must be active.
3. CSPON-D03: Sponsorship never grants Club management authority (no club.edit, event.create, club_members.manage). If needed, a specific sponsor User gets a role via CLUB_USERS.
4. CSPON-D04: Sponsorship fee does not substitute real financial payment records.
5. CSPON-D05: Real revenue tracked through DOCUMENTS / DOCUMENT_ITEMS / TRANSACTIONS (invoice issued, payment received, partially paid, refunded handled by DOCUMENTS, TRANSACTIONS, TRANSACTION_ALLOCATIONS).
6. CSPON-D06: Whether more than one primary sponsor per Club per period is allowed is a business rule (recommended: max 1 active primary per Club per period).
7. CSPON-D07: Expired sponsorships are never hard deleted.
8. CSPON-D08: Renewal preferably via a NEW record (2027 record -> expired, 2028 record -> active), not extending old dates.
9. CSPON-D09: Use SPONSORSHIP_USAGE for tracking use of sponsor rights.
10. Plan values (fee, rights, billing_period, duration) are defaults; the actual sponsorship can override them (e.g. plan 150,000 vs actual 125,000; plan 50 guest passes vs actual 40). Actual values snapshotted here so later plan changes don't alter existing contracts.
11. end_date default may be derived from plan.default_duration_months, but actual dates live here.
12. Finance: sponsorship revenue posted as DOCUMENT (direction=sale, ID_Organization=sponsor) with item description e.g. "English Club Sponsorship", ID_FinancialCenter = Club, ID_FinancialCategory = Sponsorship Revenue, so Club performance reflects it.
13. Audit events: `club_sponsorship.created`, `club_sponsorship.activated`, `club_sponsorship.updated`, `club_sponsorship.terminated`, `club_sponsorship.renewed`; changes to fee_amount, start_date, end_date, plan, status are especially important.
14. Sector exclusivity in V1: business rule + contract note only, no schema.

## Superseded / rejected ideas
- `CLUBS.ID_SponsorOrganization` / `CLUBS.ID_Sponsor` single FK — rejected (multiple sponsors, dated).
- `ORGANIZATIONS.is_sponsor = true` alone — insufficient.
- Storing sponsor representatives here — rejected (ORGANIZATION_USERS / CLUB_USERS).
- Using fee_amount as revenue record — rejected.
- Extending an existing record on renewal — rejected in favor of new record.
- Heavy document management in this table — rejected for V1 (contract_reference only).
- Separate `SPONSORSHIP_ENTITLEMENTS` table — "cleaner" option deferred; V1 snapshots on this table (per SPONSORSHIP_PLANS doc).

## Open questions
- start_date/end_date: date vs timestamp (doc: Date/Timestamp).
- Exact names/set of agreed_* snapshot columns (only agreed_guest_pass_limit and agreed_event_limit named, "..." for rest).
- Whether status `expired` is set by job or derived from end_date.
- Primary-sponsor uniqueness: hard constraint or configurable rule.
- Whether exclusivity / contract_file_id will be added.

## Example row
ID_ClubSponsorship=cspon_1001, ID_Club=club_ENGLISH, ID_Organization=org_ABC_LANGUAGE, ID_SponsorshipPlan=splan_MAIN, sponsorship_name="2027 English Club Main Sponsorship", start_date=2027-01-01, end_date=2027-12-31, status=active, fee_amount=150000.00, currency_code=TRY, billing_period=annual, is_primary_sponsor=true, contract_reference=ENG-SPON-2027-001, notes="Annual main sponsorship agreement.", created_at=2026-12-15 14:00, created_by_user_id=usr_ADMIN, updated_at=2026-12-15 14:00, updated_by_user_id=usr_ADMIN.
