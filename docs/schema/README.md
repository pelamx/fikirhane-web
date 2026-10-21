# Data dictionary

English summaries of the 48 Fikirhane table design documents (originally Turkish). Each file has the final field set, value lists, constraints,
relationships, business rules (with the doc rule IDs, e.g. `BOOK-D06`), rejected ideas, open questions and an example row.
How conflicts between documents were resolved: [backend-decisions.md](../backend-decisions.md). Implementation: [`backend/migrations`](../../backend/migrations).

## Identity & access

| Document | Table | Purpose |
|---|---|---|
| [USERS](USERS.md) | `users` | One row = one real person who has an identity in the Fikirhane system (the master person record) |
| [ROLES](ROLES.md) | `roles` | Master table of the global permission bundles ("global role / authority packages") defined in Fikirhane |
| [PERMISSIONS](PERMISSIONS.md) | `permissions` | Master table of the individual (atomic) permissions defined in Fikirhane |
| [ROLE_PERMISSIONS](ROLE_PERMISSIONS.md) | `role_permissions` | N:M junction between ROLES and PERMISSIONS |
| [USER_ROLES](USER_ROLES.md) | `user_roles` | Assignment table between USERS and global system ROLES |
| [AUDIT_LOG](AUDIT_LOG.md) | `audit_log` | Immutable, append-only history of important changes: who changed what, when, on which record, how and why |

## Profile

| Document | Table | Purpose |
|---|---|---|
| [SKILLS](SKILLS.md) | `skills` | SKILLS is the system-wide, admin-curated controlled taxonomy (master dictionary) of competencies/skills that users can claim to "know / can do / be ex |
| [USER_SKILLS](USER_SKILLS.md) | `user_skills` | USER_SKILLS is the N:N junction between USERS and SKILLS: one row = "this user has this controlled skill", plus user-specific attributes (optional lev |
| [INTERESTS](INTERESTS.md) | `interests` | INTERESTS is the system-wide, admin-curated controlled taxonomy (master dictionary) of topics users can say they are "interested in / want to learn /  |
| [USER_INTERESTS](USER_INTERESTS.md) | `user_interests` | USER_INTERESTS is the N:N junction between USERS and INTERESTS: one row = "this user has selected this controlled interest", optionally ranked by prio |

## Membership

| Document | Table | Purpose |
|---|---|---|
| [MEMBERSHIP_TYPES](MEMBERSHIP_TYPES.md) | `membership_types` | MEMBERSHIP_TYPES is the master list of Fikirhane's commercial membership packages (V1: Member, Premium) and their DEFAULT entitlements (discount rate, |
| [USER_MEMBERSHIPS](USER_MEMBERSHIPS.md) | `user_memberships` | USER_MEMBERSHIPS is the historical lifecycle table that actually assigns a membership package to a user: one row = one user holding one MEMBERSHIP_TYP |
| [MEMBERSHIP_APPLICATIONS](MEMBERSHIP_APPLICATIONS.md) | `membership_applications` | MEMBERSHIP_APPLICATIONS stores a user's application for a Fikirhane membership type and its review/decision lifecycle: one row = one application by on |

## Clubs & organizations

| Document | Table | Purpose |
|---|---|---|
| [CLUBS](CLUBS.md) | `clubs` | Master table of Fikirhane's permanent communities / interest / working groups (e |
| [CLUB_USERS](CLUB_USERS.md) | `club_users` | N:N junction between USERS and CLUBS |
| [CLUB_MEMBER_ROLES](CLUB_MEMBER_ROLES.md) | `club_member_roles` | Master dictionary of role types a user can hold inside a Club; the same list applies to every Club |
| [CLUB_EVENTS](CLUB_EVENTS.md) | `event_clubs` | N:N junction between CLUBS and EVENTS (author prefers the name **EVENT_CLUBS** for consistency with the event-centric model; CLUB_EVENTS is acceptable |
| [ORGANIZATIONS](ORGANIZATIONS.md) | `organizations` | Master record of legal/institutional entities in Fikirhane (Company, University, NGO, Community, Government Institution, Agency, Partner/Sponsor Organ |
| [ORGANIZATION_USERS](ORGANIZATION_USERS.md) | `organization_users` | N:N junction between USERS and ORGANIZATIONS |
| [ORGANIZATION_ROLES](ORGANIZATION_ROLES.md) | `organization_roles` | Child table of ORGANIZATIONS recording in which functional/commercial capacities an Organization relates to Fikirhane ("What does this institution act |
| [ORGANIZATION_EVENTS](ORGANIZATION_EVENTS.md) | `event_organizations` | N:N junction between EVENTS and ORGANIZATIONS |

## Growth & sponsorship

| Document | Table | Purpose |
|---|---|---|
| [CAMPAIGNS](CAMPAIGNS.md) | `campaigns` | One row = the umbrella identity of an acquisition / invitation / freepass / promotion / community-growth program (e |
| [INVITATIONS](INVITATIONS.md) | `invitations` | Operational table: one row = one invitation sent to a specific person (existing User or guest), by a User or an Organization, optionally within a Camp |
| [FREEPASSES](FREEPASSES.md) | `freepasses` | One row = a free-usage entitlement ("freepass") granted to a registered User or to a not-yet-registered person (guest): who holds it, its scope (event |
| [FREEPASS_REDEMPTIONS](FREEPASS_REDEMPTIONS.md) | `freepass_redemptions` | One row = one actual use of a FREEPASS entitlement against a specific BOOKING (when, and whether that use is still valid) |
| [USER_ACQUISITIONS](USER_ACQUISITIONS.md) | `user_acquisitions` | Attribution table: one row = the primary / first-touch acquisition snapshot of one User — the first identifiable source, channel, campaign, invitation |
| [SPONSORSHIP_PLANS](SPONSORSHIP_PLANS.md) | `sponsorship_plans` | One row = a standard, reusable sponsorship package template (e |
| [CLUB_SPONSORSHIPS](CLUB_SPONSORSHIPS.md) | `club_sponsorships` | One row = a dated, commercial sponsorship agreement/relationship between one Organization and one Club (who sponsors which Club, for which period, und |
| [SPONSORSHIP_USAGE](SPONSORSHIP_USAGE.md) | `sponsorship_usage` | One row = a single consumption movement of a right defined in a Club Sponsorship (how much of which right was used, when, in what context) |

## Events & space

| Document | Table | Purpose |
|---|---|---|
| [EVENT_SERIES](EVENT_SERIES.md) | `event_series` | One row = one program/series (e |
| [EVENTS](EVENTS.md) | `events` | One row = one real, dated/timed event occurrence (e |
| [EVENT_OPTIONS](EVENT_OPTIONS.md) | `event_options` | One row = one concrete, bookable variant of an EVENT: a Location + SpaceSetup + capacity + booking unit combination (e |
| [EVENT_USERS](EVENT_USERS.md) | `event_users` | One row = one duty/organization role a User holds in a specific Event (tutor, speaker, moderator, host, facilitator, staff) — an N:N event-scoped rela |
| [EVENT_LOCATIONS](EVENT_LOCATIONS.md) | `— (not created)` | DECISION: DO NOT CREATE THIS TABLE |
| [LOCATIONS](LOCATIONS.md) | `locations` | One row = one permanent physical space / bookable area of Fikirhane (e |
| [SPACE_SETUPS](SPACE_SETUPS.md) | `space_setups` | One row = one physical seating/table layout (and version) of a LOCATION (e |
| [TABLES](TABLES.md) | `tables` | One row = one physical/map table object inside a specific SPACE_SETUP (e |
| [SEATS](SEATS.md) | `seats` | One row = one individual bookable seat/sitting position inside a specific SPACE_SETUP, optionally grouped under a TABLE, with its seat-map position |
| [BOOKINGS](BOOKINGS.md) | `bookings` | One row = one physical participant's actual reservation for a specific Event AND a specific EventOption (location/setup choice), optionally at seat or |

## Finance & stock

| Document | Table | Purpose |
|---|---|---|
| [ACCOUNTS](ACCOUNTS.md) | `accounts` | Master table of Fikirhane's own financial accounts where money is held or passes through ("where is the money?"): bank accounts, cash boxes, POS, and  |
| [FINANCIAL_CENTERS](FINANCIAL_CENTERS.md) | `financial_centers` | Master table of Fikirhane's business units / revenue-expense responsibility centers ("which part of the business does this income or expense belong to |
| [FINANCIAL_CATEGORIES](FINANCIAL_CATEGORIES.md) | `financial_categories` | Master table classifying the economic nature of Fikirhane's income and expenses ("what was this income/expense for?"), e |
| [DOCUMENTS](DOCUMENTS.md) | `documents` | Header record of a commercial document (sale or purchase) in Fikirhane: one row = one document with its direction, counterparty, date, currency, total |
| [DOCUMENT_ITEMS](DOCUMENT_ITEMS.md) | `document_items` | Individual commercial lines of a DOCUMENT: one row = one sold/purchased line with its item/booking link, Financial Center and Financial Category attri |
| [TRANSACTIONS](TRANSACTIONS.md) | `transactions` | The money ledger: one row = one real money movement ("when, how much, from which account to which account did money actually move?") - customer POS co |
| [TRANSACTION_ALLOCATIONS](TRANSACTION_ALLOCATIONS.md) | `transaction_allocations` | N:N junction/distribution table: one row = the portion of one real money TRANSACTION applied to one commercial DOCUMENT ("which document was this paym |
| [ITEMS](ITEMS.md) | `items` | Master catalog of products and services that Fikirhane sells, purchases, or tracks in stock (e |
| [STOCK_MOVEMENTS](STOCK_MOVEMENTS.md) | `stock_movements` | Immutable stock ledger: one row = one physical increase or decrease of a stock-tracked Item's quantity, recorded as a signed quantity (purchase receip |
