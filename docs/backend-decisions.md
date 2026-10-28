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
| `bookings.checkin_token` | **Added** (`0105_booking_pass.sql`): an unguessable token per booking for its QR entry pass. The QR also shows date and session; the server re-reads the booking, so a pass only opens its own session. |
| `password_reset_tokens` | **Created** for forgot password (`0101_password_reset.sql`), with a new sensitive permission `user.reset_password` for FIKIRHANE_ADMIN and TECH_ADMIN. Only token hashes are stored. |
| `needs`, `offers` | **Created** minimally (free text + status), because `bookings` references them. |
| `stock_counts`, `stock_count_items` | **Created** minimally, because `stock_movements` references them. |
| `PRICING_RULES`, `EVENT_QUOTAS`, `EVENT_INTERESTS`, `EVENT_SKILLS`, `CLUB_INTERESTS`, `FINANCIAL_CENTER_USERS`, `USER_PHONES`, `USER_ADDRESSES`, `ORGANIZATION_EMAILS/PHONES/ADDRESSES`, `SERIES_ENROLLMENTS` | **Deferred.** Nothing in V1 requires them. V1 pricing is base price + option adjustment − membership discount, which is the docs' own V1 model. |

## Business-rule choices — Confirm

| # | Assumption | Where to change |
|---|---|---|
| C-01 | Plans are shown as **Basic** (code `MEMBER`) and **Plus** (code `PREMIUM`) since `0111`; the codes stay so existing memberships, applications and bookings keep their rows. **Plus** (Premium): 20% discount, 14-day booking window, 4 active bookings. Seat selection is open to everyone since `0104` (as on fikirhane.co; `VISITOR_SEAT_SELECTION`, `membership_types.seat_selection_enabled` can close it again). The docs give "7 or more / 2 or more" in one table and 14 / 4 elsewhere. **Member**: 15%, 7 days, 2 bookings. | `membership_types` rows |
| C-02 | **Visitor** (no membership): 7-day window, 2 active bookings, no discount. The docs leave this unspecified. | `VISITOR_*` env vars |
| C-03 | **Payment**: there is no payment provider yet, so priced bookings are `confirmed` with `payment_status = unpaid` (pay at the venue). `PAYMENT_MODE=online` switches to 10-minute `pending_payment` holds once a provider is integrated. | `PAYMENT_MODE` |
| C-04 | Approved memberships run 12 months from the approval date. | `MEMBERSHIP_PERIOD_MONTHS` |
| C-05 | New accounts have `networking_enabled = false` (opt-in, privacy by default) and `profile_visibility = community`. | `users` defaults |
| C-06 | Users may cancel until 24 h before the start; inside that window only staff with `booking.cancel` can. A timely cancellation returns a used freepass; a no-show keeps it consumed. | `CANCELLATION_LOCK_HOURS` |
| C-07 | A user holds at most one active booking per event. `waitlisted` counts toward that rule but not toward capacity or the active-booking limit. Waitlist promotion is manual for now. | `services/bookings.ts` |
| C-08 | ~~ACCOUNTING does not get `transaction.post` / `transaction.reverse`.~~ Superseded by C-13. | `role_permissions` |
| C-09 | Club leads and co-leads may create events for their own club. These events are created as `submitted` and need `event.publish` (Fikirhane admin) to go live. | `services/authz.ts` |
| C-10 | The financial category seed is the doc's later ~20-item list (section 34). Codes and groups were assigned where the doc gave none. | `0100_reference_data.sql` |
| C-11 | The "Working Club" and "Community Workspace" financial center are one center (`WORKING_CLUB`), as the doc recommends when they are the same service. | `seeds/demo.sql` |
| C-12 | A `creative` club type was added for the Creative Writing Club, which the doc's type list could not express. | `0007_clubs.sql` |
| C-13 | The ROLES.md bundles left 26 permissions with no holder, so nobody could post documents or payments, define items or approve stock counts. `0102_operational_permissions.sql` gives ACCOUNTING posting/cancel/reverse and account, center and category management; KITCHEN_STAFF item definition and count completion; FIKIRHANE_ADMIN stock adjustment and count approval/posting; MARKETING acquisition correction. Overrides (negative stock, freepass/sponsorship limits), `user.view_sensitive`, `transaction.adjust` and pricing rules stay unassigned. | `role_permissions`, or the admin shell (Rol yetkileri) with `role.update` |
| C-14 | Admin forms follow per-table rules extracted from the 48 documents (`backend/src/services/admin-meta.json`): who may create/edit, fixed and system-managed fields, lifecycle actions. Where no permission code existed the closest one was used: skills/interests → `system_settings.update`; venues, setups, tables, seats → `event.update_location`; club member roles → `club_members.manage`; membership types → `membership.update`. | `admin-meta.json` |
| C-15 | "Tur planla" needs somewhere for a visit request to land, and none of the 48 documents covers it. | New table `tour_requests` (`0110_tour_requests.sql`): name, e-mail or phone, a weekday within the next month, morning or afternoon, interests, note, a status staff move through (new → contacted → scheduled → visited / cancelled). Anyone may send one (`POST /api/tours`, rate-limited per network, with a honeypot field); staff with `tour.view` / `tour.manage` (FIKIRHANE_ADMIN, MARKETING) follow up in the host shell (Üyeler → Tur talepleri). | `tour_requests`, `role_permissions` |
| C-16 | Plus brings a friend free once a month; no document covers it. | `membership_types.monthly_guest_passes` (Plus 1, Basic 0). Each month (Istanbul calendar month) the member gets one `freepasses` row of type `guest` with `granted_to_user_id` = the member, created on first look (`GET /api/me/guest-pass`). It is spent either way, from the same `usage_limit`: the member adds a friend to their own confirmed booking (`POST /api/me/bookings/:id/guest`: a guest booking with no account, booked by the member, free, with its own QR, seated at the member's table when a seat is free), or hands over the code and the friend books with it as a freepass. The member cannot use the code for themselves; the pass is never claimed by whoever uses it, so a right returned by a timely cancellation can go to another friend; codes stop working when the member no longer holds a plan with guest passes; unused rights do not carry over. Cancelling the member's own booking does not cancel the friend's. | `membership_types`, `freepasses`, `src/services/guest-pass.ts` |
| C-17 | The Creative Writing Club became the Spanish Club. | Renamed in place (`0114_spanish_club.sql`): club and financial-center codes are fixed, so the club keeps `club_code` WRITING and its `WRITING_CLUB` center, with members, events and finance history; name, type (`language`) and description change. The site uses the id `spanish` for it. |
| C-18 | Members order from the cafeteria themselves; no document covers self-service. | The member area's Kafeterya (`member/#mutfak`, `GET /api/me/kitchen`) is open to every signed-in account, booking or not. It lists the whole cafeteria menu (the same items as the host counter: active, sellable, priced, on a cafeteria center); a product is picked from it or found by its barcode. Picks go onto one draft sale receipt per person (the tab), paid online or closed at the desk; a tab from an earlier day must be paid before anything new is added. |
| C-19 | The site's "İletişim" link pointed at the old fikirhane.co page; a message needs somewhere to land. | New table `contact_messages` (`0117_contact_messages.sql`): name, e-mail or phone, a topic (general, membership, meeting room, event space, partnership) and the message, with a status staff move through (new → answered or closed) and an optional staff note. `POST /api/contact` is public, rate-limited per network (`CONTACT_MESSAGES_PER_HOUR`, 5) with a honeypot field; staff with `contact.view` / `contact.manage` (admin, marketing) read and mark them in the host shell (Üyeler → İletişim mesajları). |
