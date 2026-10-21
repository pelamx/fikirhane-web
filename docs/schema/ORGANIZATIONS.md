# ORGANIZATIONS

## Purpose
Master record of legal/institutional entities in Fikirhane (Company, University, NGO, Community, Government Institution, Agency, Partner/Sponsor Organization, Supplier, Corporate Customer). One row = one real-world institution ("Who is this institution?") — identity, official/trade name, structural type, tax identity, general profile, system status, audit. The same company may simultaneously be sponsor, supplier, corporate customer and event partner but has ONE row. NOT stored here: commercial roles (-> ORGANIZATION_ROLES), people/admins/billing contacts (-> ORGANIZATION_USERS), emails/phones/addresses (-> ORGANIZATION_EMAILS / _PHONES / _ADDRESSES), event links (-> EVENT_ORGANIZATIONS), club sponsorship (-> CLUB_SPONSORSHIPS), purchase/sales history (-> DOCUMENTS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_Organization | uuid | NOT NULL | gen | PK | Immutable system id (e.g. `org_01HXYZ...`). Name never used as PK. Referenced by ORGANIZATION_USERS, ORGANIZATION_ROLES, EVENT_ORGANIZATIONS, CLUB_SPONSORSHIPS, DOCUMENTS (.ID_Organization). |
| organization_name | text | NOT NULL | - | - | Short/trade display name shown in UI (e.g. Acme, Bahçeşehir Üniversitesi, ABC Teknoloji). |
| legal_name | text | NULL* | - | - | Official legal/trade title (e.g. "ABC Teknoloji Sanayi ve Ticaret A.Ş."). Need not equal organization_name. *Becomes required if the Organization is used on financial documents. |
| organization_type | enum | NOT NULL | - | - | Structural type (what kind of entity), NOT relation to Fikirhane. |
| tax_number | text | NULL | - | - | Tax ID; used for purchase/sale/invoice/accounting. Not mandatory (informal community may lack one). |
| tax_office | text | NULL | - | - | Tax office (vergi dairesi), used in Turkish commercial docs. |
| registration_number | text | NULL | - | - | Generic official registration no. (trade registry, company reg., foreign reg.). May be split per country later. |
| website | text (URL) | NULL | - | - | Single main website. |
| logo | text/uuid (file_id or URL reference) | NULL | - | (file ref) | Not binary. |
| description | text | NULL | - | - | Short description; used on public org profile if any. |
| status | enum | NOT NULL | (not stated; `active` sensible) | - | System usability status of the record. |
| created_at | timestamptz | NOT NULL | now() | - | Auto. |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | Admin, or company rep who self-created during onboarding. |
| updated_at | timestamptz | NOT NULL | now() | - | Auto-updated. |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | Detailed change history in AUDIT_LOG. |

## Enums / allowed values
- **organization_type**: `company`, `university`, `ngo`, `community`, `government`, `agency`, `other`. (supplier/sponsor/customer must NOT be here.)
- **status**: `active` (normal use), `inactive` (no active relation currently but record kept), `suspended` (access/operations temporarily restricted), `archived` (no longer operational, history preserved).
- Child contact tables (types, from doc):
  - ORGANIZATION_EMAILS.email_type: `general`, `billing`, `accounting`, `support`, `sales`
  - ORGANIZATION_PHONES type: `main`, `office`, `accounting`, `support`
  - ORGANIZATION_ADDRESSES type: `registered`, `billing`, `office`, `shipping`

## Constraints & indexes
- PK ID_Organization, immutable (ORG-D01).
- No duplicate Organization rows for the same real institution (ORG-D02) — doc doesn't specify the dedupe key; tax_number (when present) is the natural candidate.
- Conditional: legal_name required if used in financial documents.

## Relationships
- 1:N ORGANIZATION_ROLES; 1:N ORGANIZATION_USERS (N:N to USERS); 1:N EVENT_ORGANIZATIONS (N:N to EVENTS); 1:N CLUB_SPONSORSHIPS (N:N to CLUBS); 1:N DOCUMENTS; 1:N ORGANIZATION_EMAILS / ORGANIZATION_PHONES / ORGANIZATION_ADDRESSES.
- Child table sketch ORGANIZATION_EMAILS: ID_OrganizationEmail, ID_Organization, email, email_type, is_primary, status.
- Organization–Club relation types: partner, sponsor, supporter — but club system management is given only to real Users via CLUB_USERS.

## Business rules / data rules
1. ORG-D01: ID_Organization unique & immutable.
2. ORG-D02: No duplicate Organization rows for the same real institution.
3. ORG-D03: Supplier/Sponsor/Customer not stored as the Organization's base type.
4. ORG-D04: An Organization can have multiple Organization Roles.
5. ORG-D05: Organization–User relations via ORGANIZATION_USERS (roles never written to USERS or ORGANIZATIONS).
6. ORG-D06: Email, phone, address in child contact tables.
7. ORG-D07: Organization with historical transactions must not be hard-deleted (no hard delete in general; archive).
8. ORG-D08: Official info used in financial documents snapshotted at transaction time on DOCUMENTS (billing_name_snapshot, tax_number_snapshot, tax_office_snapshot, billing_address_snapshot) — master changes (e.g. Maslak -> Levent) must not alter past documents.
9. ORG-D09: System status independent of commercial roles (status=active with roles supplier + sponsor).
10. Sponsorship is a dated commercial relationship, not identity (same org can be English Club sponsor in 2026 Q1, not in Q2, AI Club sponsor in Q3) — history preserved in CLUB_SPONSORSHIPS / EVENT_ORGANIZATIONS.
11. Supplier = ORGANIZATION + ORGANIZATION_ROLE supplier; corporate customer = ORGANIZATION + ORGANIZATION_ROLE customer; sale docs link via DOCUMENTS.ID_Organization.
12. Billing master source: ORGANIZATIONS + ORGANIZATION_ADDRESSES.
13. A company is a Club's sponsor but never "club admin" itself; its employee User gains rights via ORGANIZATION_USERS + CLUB_USERS.
14. Organization page: Organization Admin may manage Organization Profile, Organization Users, Corporate Bookings, Documents, Billing Information, Event Participation — subject to permission + scope (scope = ID_Organization the user belongs to).
15. Looking at an ORGANIZATIONS row alone you cannot (and should not) tell sponsor/supplier/customer/admin/clubs/events.

## Superseded / rejected ideas
- Boolean flags sponsor/supplier/customer (is_supplier, is_sponsor, is_customer) — rejected -> ORGANIZATION_ROLES.
- organization_admin / billing contact columns — rejected -> ORGANIZATION_USERS.
- event sponsor history, club sponsorship, purchase/sales history on this table — rejected.
- Multiple emails/phones/addresses columns — rejected -> child tables.
- Separate SUPPLIERS / CUSTOMERS master tables — rejected (duplicate data).
- Single EVENTS.ID_Organization FK — insufficient; N:N EVENT_ORGANIZATIONS.
- Social links duplicated here — rejected; ORGANIZATION_LINKS later (not V1).
- Logo binary in DB — rejected.
- USERS.organization_id single FK — rejected (see ORGANIZATION_USERS).

## Open questions
- ORGANIZATION_LINKS deferred (not V1).
- registration_number per-country split deferred.
- Dedupe key for ORG-D02 not specified.
- Event sponsorship: "EVENT_ORGANIZATIONS or a special sponsorship relation" — left open here (EVENT_ORGANIZATIONS doc settles on role = sponsor).

## Example row
`ID_Organization=org_47aa..., organization_name="ABC Teknoloji", legal_name="ABC Teknoloji Sanayi ve Ticaret A.Ş.", organization_type=company, tax_number=1234567890, tax_office=Maslak, registration_number=123456, website=abc.com, logo=file_882, description="AI tabanlı kurumsal yazılım çözümleri geliştiren teknoloji şirketi.", status=active, created_at=2026-09-22 14:00, created_by_user_id=usr_admin_01, updated_at=2026-09-22 14:00, updated_by_user_id=usr_admin_01`
