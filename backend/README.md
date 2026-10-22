# Fikirhane backend

PostgreSQL schema plus a TypeScript API (Hono on Node ≥ 24, with type stripping, so there is no build step). It also serves the static site, so
frontend and API share one origin.

- Schema: 47 documented tables + 7 supporting tables, in `migrations/`. Field-level docs: [`../docs/schema`](../docs/schema/README.md).
- Decisions and assumptions to confirm: [`../docs/backend-decisions.md`](../docs/backend-decisions.md).

## Run locally

```sh
cd backend
npm install
npm run dev        # embedded PostgreSQL in backend/.data + migrations + demo data, site + API on http://localhost:8080
```

No Docker or system PostgreSQL is needed. To get an admin account:

```sh
ADMIN_PASSWORD='<at least 10 chars>' DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/fikirhane \
  npm run create-admin -- you@example.com Ad Soyad            # default role FIKIRHANE_ADMIN; pass other role codes to add more
```

Forgot password: `/uyelik/sifre/` emails a one-time link (60 minutes) through [Resend](https://resend.com) when
`RESEND_API_KEY` and `MAIL_FROM` are set; in development the email is printed to the server log instead. Staff with
`user.reset_password` can also create a 24-hour link on a user's page in the admin panel and hand it over themselves
(never for accounts that hold a staff role). From a terminal, this sets a password directly and signs the account out everywhere:

```sh
NEW_PASSWORD='<at least 10 chars>' DATABASE_URL=... npm run reset-password -- you@example.com
```

Against your own database: copy `.env.example` to `.env`, export it, then run `npm run migrate`, optionally `npm run seed:demo`, and `npm start`.
The server migrates on start unless `MIGRATE_ON_START=false`, and runs the expiry jobs every `JOB_INTERVAL_SECONDS`.

## Tests

```sh
npm run typecheck
npm test           # 42 tests against a real, throwaway PostgreSQL (embedded-postgres)
```

They cover schema guards (no hard delete, append-only ledgers, document/allocation/stock rules, sponsor exclusivity), pricing,
auth, CSRF/CORS, static file allow-listing, booking rules (reservation window, active-booking limit, 24 h cancellation lock,
Premium seat selection), **parallel booking against capacity**, **parallel freepass redemption**, the membership approval/upgrade
flow, admin event publish conflicts and cascade cancellation, and the expiry jobs.

## Deploy

### Render

[`render.yaml`](../render.yaml) at the repository root is a Render Blueprint: a PostgreSQL 18 database (`fikirhane-db`) and a
Docker web service (`fikirhane`) built from `backend/Dockerfile`, both in Frankfurt. The service serves the site and the API on one
origin (`https://<service>.onrender.com`), with `TRUST_PROXY=true` and Lax, Secure cookies.

1. Render dashboard → **New → Blueprint** → pick this repository. Fill in `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`
   (at least 10 characters) for the first admin, leave `RESEND_API_KEY` empty unless you have one, then **Apply**.
2. The first deploy migrates the database and, with `SEED_DEMO=true`, loads the clubs and the next week's coworking sessions. The seed is
   idempotent and runs on every start, so restarts keep the sessions rolling forward. Set `SEED_DEMO=false` once real events are entered.
3. Admin account: created on start from `BOOTSTRAP_ADMIN_EMAIL` if it does not exist (an existing account keeps its password and only
   gets `FIKIRHANE_ADMIN`). Once you have signed in you can delete `BOOTSTRAP_ADMIN_PASSWORD` from the service's environment.
   To add more staff without a shell, the database only accepts Render's internal network (`ipAllowList: []`): in the database's
   **Networking** settings add your IP, copy the **External Database URL**, then from `backend/`:

   ```sh
   ADMIN_PASSWORD='<at least 10 chars>' DATABASE_URL='<external url>?sslmode=require' npm run create-admin -- you@example.com Ad Soyad
   ```

   Remove your IP afterwards. On a paid instance you can instead run the same command in the service's **Shell** with the internal URL
   already in `DATABASE_URL`.

Deploys follow `main` after the backend workflow passes (`autoDeployTrigger: checksPass`). Both are on free plans: the free database
expires after 30 days and the free service sleeps after 15 idle minutes (the first request then takes about a minute, and the expiry
jobs only run while it is awake). For real use switch `plan` to `basic-256mb` (database) and `starter` (service).

The GitHub Pages copy stays in browser-only preview mode. Pointing it at Render (`PAGES_API_URL`) would need cross-site cookies
(`COOKIE_SAMESITE=None`), which Safari and other browsers that block third-party cookies refuse, so use the Render address or a custom
domain on the Render service instead.

### Other hosts

Any host that runs a container and gives you PostgreSQL ≥ 13 (Render, Railway, Fly.io, a VPS with managed Postgres...):

```sh
docker build -f backend/Dockerfile -t fikirhane .     # from the repository root
docker run -p 8080:8080 -e DATABASE_URL=... -e CORS_ORIGINS=https://pelamx.github.io fikirhane
```

- Same origin (recommended): point the domain at the container. The site and API are served together with `COOKIE_SAMESITE=Lax`.
- Keeping the GitHub Pages frontend: set `PAGES_API_URL` in `scripts/config.js` to `https://<api-host>/api`, and run the API with
  `CORS_ORIGINS=https://pelamx.github.io COOKIE_SAMESITE=None COOKIE_SECURE=true`. Until then, Pages keeps running the browser-only preview.
- Behind a reverse proxy, set `TRUST_PROXY=true` so rate limiting sees real client IPs and same-origin HTTPS requests pass the origin check.

## API

All paths are under `/api`. JSON in and out. Errors look like `{ "error": { "code", "message" } }`; the frontend localizes them by `code`.
Browsers authenticate with the httpOnly `fh_session` cookie; other clients can send `Authorization: Bearer <token>`, where the token comes from login/register.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | |
| POST | `/auth/register` | `first_name, last_name, email, password, club_codes?, interest_codes?, acquisition?` → USER role only |
| POST | `/auth/login`, `/auth/logout` | rate limited |
| GET | `/auth/password-reset` | `{ email_enabled }` |
| POST | `/auth/password-reset/request` | `email` → always 202, same answer for unknown emails; rate limited |
| POST | `/auth/password-reset/confirm` | `token, password` → signs out every session of the account |
| GET / PATCH | `/me` | profile, membership rights, roles, permissions, clubs, active bookings |
| GET / PUT | `/me/interests`, `/me/skills` | replace the active set (max 10 / 12) |
| GET | `/me/bookings`, `/me/freepasses`, `/me/membership` | |
| POST | `/me/bookings/:id/cancel` | 24 h lock for owners |
| GET | `/me/bookings/:id/pass`, `/me/bookings/:id/qr.svg`, `/me/bookings/:id/qr.png` | entry pass of a confirmed booking: date, session, place; QR as SVG, or PNG download named `fikirhane-qr-<date>-<start>-<end>.png` |
| POST | `/me/membership-applications`, `/me/membership-applications/:id/withdraw` | |
| GET | `/clubs`, `/clubs/:code`, `/events`, `/events/:id`, `/interests`, `/skills`, `/membership-types` | public; prices are personalized when signed in |
| PUT / DELETE | `/clubs/:code/membership` | join / leave as MEMBER |
| POST | `/bookings` | `event_id, event_option_id?, seat_id?, table_id?, freepass_code?, join_waitlist?, need_text?, offer_text?` |
| GET | `/admin/schema` | tables the caller may read, with columns, foreign keys and incoming relations; 403 for non-staff |
| GET | `/admin/overview` | counts, only for the caller's permissions |
| GET | `/admin/data/:table` | `q`, `limit`, `offset`, and `<column>=<value>` filters (empty value = null); foreign keys come with display labels |
| GET | `/admin/data/:table/:id` | one record, its references, and the first rows of every table that points at it |
| POST | `/admin/data/:table` | `{ values }` → create, if the table document allows it and you hold its create permission |
| PATCH | `/admin/data/:table/:id` | `{ values }` → edit; fixed and system-managed fields are refused, status changes follow the lifecycle |
| POST | `/admin/data/:table/:id/actions/:action` | `{ reason? }` → lifecycle step defined by the document (post, cancel, reverse, approve, suspend...) |
| DELETE | `/admin/data/:table/:id` | only where the documents allow it: draft documents and their lines, pending transactions |
| GET | `/admin/events` | `when=upcoming/past/all`, `status`; includes drafts, capacity, bookings |
| GET | `/admin/membership-applications` | `membership.view` |
| POST | `/admin/membership-applications/:id/decision` | `under_review / approved / waitlisted / declined` |
| POST | `/admin/events` | `event.create`, or club lead → `submitted` |
| POST | `/admin/events/:id/publish`, `/admin/events/:id/cancel` | publish checks pricing, options, seats, location conflicts; cancel cascades |
| GET | `/admin/events/:id/participants` | global or event/club-scoped permission |
| POST | `/admin/bookings/:id/checkin` | |
| POST | `/admin/users/:id/password-reset-link` | `user.reset_password`; refused for staff accounts; audited |
| GET / POST | `/admin/pass?k=`, `/admin/pass/checkin` | door check of a scanned QR; valid only from `CHECKIN_EARLY_MINUTES` (15) before the session start until its end; `booking.checkin` or the event's attendance role |
| POST / DELETE | `/admin/users/:id/roles[/:role]` | `role.assign` / `role.revoke`, audited |

Writes through `/admin/data` follow `src/services/admin-meta.json`: per table, extracted from the 48 table documents, who may
create or edit, which fields are fixed after creation or managed by the system, Turkish help texts and value names, and the
lifecycle actions. Table-specific steps live in `src/services/admin-write.ts` (document line amounts and totals, document
numbering on posting, account balances, reversing a payment's allocations, stock signs and counter-movements, stock count
posting, signing out a suspended user). Every write is audited with old and new values. Reads are as before: Each table opens with one of the permissions listed in `src/services/admin-data.ts`;
`auth_identities` and `user_sessions` are never exposed, and guest emails/phones are masked without `user.view_contact`.
Finance (documents, transactions, allocations), stock, campaigns, invitations and sponsorships are fully modelled and guarded
in the database and readable in the admin shell (`/admin/`). Their write endpoints are the next phase.
