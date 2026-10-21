# Backend decisions

The schema in `backend/migrations` implements the 48 table documents summarized in [`docs/schema`](schema/README.md)
(source: the Turkish design docs, where each doc's final field set — "nihai sade field set" — was taken as authoritative).
The docs contradict each other in places, and some referenced tables were never written. This file records every
choice made to get to one consistent schema. Items marked **Confirm** are assumptions the business should check.

## Conventions

| # | Decision |
|---|---|
| D-01 | Table and column names are the doc names in snake_case: `ID_EventOption` → `id_event_option`, `EVENT_OPTIONS` → `event_options`. |
| D-02 | Primary keys are UUIDs. The docs' readable IDs (`usr_AHMET`, `loc_FIKIRHANE`) live in the `*_code` columns instead. |
| D-03 | Value lists are `text` + `CHECK`, not Postgres enums, so lists can grow without type migrations. |
| D-04 | Every table gets `created_at / created_by_user_id / updated_at / updated_by_user_id`. A trigger maintains `updated_at`. Ledgers that are never updated (`stock_movements`, `audit_log`) have no update columns. |
| D-05 | "No hard delete" is enforced by triggers on history tables. `audit_log` and `stock_movements` are fully append-only. Draft documents and their lines can still be deleted, as can pending transactions. |
| D-06 | Business date ranges (`start_date`/`end_date` on memberships, club relations, sponsorships) are `date`. Instants are `timestamptz`. |

## Naming conflicts resolved

| # | Conflict | Decision |
|---|---|---|
| D-07 | Permission codes differ between ROLES.md and PERMISSIONS.md. | PERMISSIONS.md is the master list. ROLES.md bundle names are mapped onto it: `profile.view_own/edit_own` → `user.view_own/update_own`, `cafeteria.sale.create` → `cafeteria_sale.create`, `system.settings.edit` → `system_settings.update`, `role.manage` → `role.view/create/update/assign/revoke`, `financial_report.view` → `report.view`. Codes the bundles needed but the master list lacked were added: `membership.apply`, `club.join`, `campaign.*`, `freepass.*`, `invitation.*`, `acquisition.*`, `marketing_analytics.view`, `sponsorship.*`, `stock.override_negative`, `transaction.adjust`, `booking.manual_create`. See `migrations/0100_reference_data.sql`. |
| D-08 | `CLUB_EVENTS` vs `EVENT_CLUBS`; `ORGANIZATION_EVENTS` vs `EVENT_ORGANIZATIONS`. | `event_clubs`, `event_organizations` (the names both docs say they prefer). |
| D-09 | `MEMBERSHIPS` vs `USER_MEMBERSHIPS`. | `user_memberships`. |
| D-10 | `ID_Setup` vs `ID_SpaceSetup`. | `id_space_setup`. |
| D-11 | `CLUB_USERS.club_role` enum vs FK to `CLUB_MEMBER_ROLES`. | FK `id_club_member_role` (per CLUB_MEMBER_ROLES.md). There is no `club_admin` role: `CLUB_LEAD` is the club's manager. |
| D-12 | Organization admin is written as `admin` in one doc and `organization_admin` in another; `corporate_customer` vs `customer`. | `admin`; `customer`. |
| D-13 | Atölye tables were named A01–A03 in one doc while its seats were A01–A12. | Tables `T01–T03`, seats `A01–A12` (Fikirhane: tables `T01–T04`, seats `F01–F16`). |
| D-14 | `USER_MEMBERSHIPS` uses a status `ended` that its own value list lacks; MEMBERSHIP_APPLICATIONS uses `reviewed`. | `ended` was added and marks a membership closed by an upgrade/downgrade. `reviewed` maps to `under_review`. |
| D-15 | `CLUB_SPONSORSHIPS` snapshot columns were referenced but never defined. | `agreed_event_limit`, `agreed_guest_pass_limit`, `agreed_content_post_limit`, `agreed_speaker_nomination_limit`. `billing_period` accepts `custom` on both plans and sponsorships. |
| D-16 | `freepass_batch` usage references point to an entity that doesn't exist. | `sponsorship_usage.reference_type` is limited to `freepass` / `invitation`; batch issuance is one usage row per freepass. |
| D-17 | `MEMBERSHIP_APPLICATIONS.submitted_at` is required, yet drafts exist. | Nullable while `draft`; a CHECK requires it in every other status. |
| D-18 | `EVENT_USERS` uniqueness is given both as a full unique key and as "one active row". | Partial unique index on active rows only, so a cancelled duty can be replaced. |
| D-19 | Seat map anchor convention was left open. | `position_x/y` is the object's **center**, normalized 0..1 over the whole setup canvas. |

## Tables referenced but not documented

| Table | Status |
|---|---|
| `user_emails`, `auth_identities`, `user_sessions` | **Created** (needed for login). Password identities only (scrypt); Google/Apple are reserved values. |
| `password_reset_tokens` | **Created** for forgot password (`0101_password_reset.sql`), with a new sensitive permission `user.reset_password` for FIKIRHANE_ADMIN and TECH_ADMIN. Only token hashes are stored. |
| `needs`, `offers` | **Created** minimally (free text + status), because `bookings` references them. |
| `stock_counts`, `stock_count_items` | **Created** minimally, because `stock_movements` references them. |
| `PRICING_RULES`, `EVENT_QUOTAS`, `EVENT_INTERESTS`, `EVENT_SKILLS`, `CLUB_INTERESTS`, `FINANCIAL_CENTER_USERS`, `USER_PHONES`, `USER_ADDRESSES`, `ORGANIZATION_EMAILS/PHONES/ADDRESSES`, `SERIES_ENROLLMENTS` | **Deferred.** Nothing in V1 requires them. V1 pricing is base price + option adjustment − membership discount, which is the docs' own V1 model. |

## Business-rule choices — Confirm

| # | Assumption | Where to change |
|---|---|---|
| C-01 | **Premium**: 20% discount, 14-day booking window, 4 active bookings, seat selection. The docs give "7 or more / 2 or more" in one table and 14 / 4 elsewhere. **Member**: 15%, 7 days, 2 bookings. | `membership_types` rows |
| C-02 | **Visitor** (no membership): 7-day window, 2 active bookings, no discount. The docs leave this unspecified. | `VISITOR_*` env vars |
| C-03 | **Payment**: there is no payment provider yet, so priced bookings are `confirmed` with `payment_status = unpaid` (pay at the venue). `PAYMENT_MODE=online` switches to 10-minute `pending_payment` holds once a provider is integrated. | `PAYMENT_MODE` |
| C-04 | Approved memberships run 12 months from the approval date. | `MEMBERSHIP_PERIOD_MONTHS` |
| C-05 | New accounts have `networking_enabled = false` (opt-in, privacy by default) and `profile_visibility = community`. | `users` defaults |
| C-06 | Users may cancel until 24 h before the start; inside that window only staff with `booking.cancel` can. A timely cancellation returns a used freepass; a no-show keeps it consumed. | `CANCELLATION_LOCK_HOURS` |
| C-07 | A user holds at most one active booking per event. `waitlisted` counts toward that rule but not toward capacity or the active-booking limit. Waitlist promotion is manual for now. | `services/bookings.ts` |
| C-08 | ACCOUNTING does **not** get `transaction.post` / `transaction.reverse` (the doc leaves this open). | `role_permissions` |
| C-09 | Club leads and co-leads may create events for their own club. These events are created as `submitted` and need `event.publish` (Fikirhane admin) to go live. | `services/authz.ts` |
| C-10 | The financial category seed is the doc's later ~20-item list (section 34). Codes and groups were assigned where the doc gave none. | `0100_reference_data.sql` |
| C-11 | The "Working Club" and "Community Workspace" financial center are one center (`WORKING_CLUB`), as the doc recommends when they are the same service. | `seeds/demo.sql` |
| C-12 | A `creative` club type was added for the Creative Writing Club, which the doc's type list could not express. | `0007_clubs.sql` |

## Demo vs. reference data

- `migrations/0100_reference_data.sql` holds data the app needs and the docs define: roles, permissions and bundles, membership types, club member roles, sponsorship plans, financial categories, General/Cafeteria centers, skills, interests, and the venue (Fikirhane 16 seats, Atölye 12 seats, meeting room).
- `seeds/demo.sql` holds illustrative business data: the three clubs from the public site, a week of coworking sessions at 500 TRY, the 24 Oct English meetup, and zero-balance demo accounts. Replace it with real data before launch. Bank accounts and opening balances in particular are placeholders.
