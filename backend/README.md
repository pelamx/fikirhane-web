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

Against your own database: copy `.env.example` to `.env`, export it, then run `npm run migrate`, optionally `npm run seed:demo`, and `npm start`.
The server migrates on start unless `MIGRATE_ON_START=false`, and runs the expiry jobs every `JOB_INTERVAL_SECONDS`.

## Tests

```sh
npm run typecheck
npm test           # 29 tests against a real, throwaway PostgreSQL (embedded-postgres)
```

They cover schema guards (no hard delete, append-only ledgers, document/allocation/stock rules, sponsor exclusivity), pricing,
auth, CSRF/CORS, static file allow-listing, booking rules (reservation window, active-booking limit, 24 h cancellation lock,
Premium seat selection), **parallel booking against capacity**, **parallel freepass redemption**, the membership approval/upgrade
flow, admin event publish conflicts and cascade cancellation, and the expiry jobs.

## Deploy

Any host that runs a container and gives you PostgreSQL ≥ 13 (Render, Railway, Fly.io, a VPS with managed Postgres...):

```sh
docker build -f backend/Dockerfile -t fikirhane .     # from the repository root
docker run -p 8080:8080 -e DATABASE_URL=... -e CORS_ORIGINS=https://pelamx.github.io fikirhane
```

- Same origin (recommended): point the domain at the container. The site and API are served together with `COOKIE_SAMESITE=Lax`.
- Keeping the GitHub Pages frontend: set `PAGES_API_URL` in `scripts/config.js` to `https://<api-host>/api`, and run the API with
  `CORS_ORIGINS=https://pelamx.github.io COOKIE_SAMESITE=None COOKIE_SECURE=true`. Until then, Pages keeps running the browser-only preview.
- Behind a reverse proxy, set `TRUST_PROXY=true` so rate limiting sees real client IPs.

## API

All paths are under `/api`. JSON in and out. Errors look like `{ "error": { "code", "message" } }`; the frontend localizes them by `code`.
Browsers authenticate with the httpOnly `fh_session` cookie; other clients can send `Authorization: Bearer <token>`, where the token comes from login/register.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | |
| POST | `/auth/register` | `first_name, last_name, email, password, club_codes?, interest_codes?, acquisition?` → USER role only |
| POST | `/auth/login`, `/auth/logout` | rate limited |
| GET / PATCH | `/me` | profile, membership rights, roles, permissions, clubs, active bookings |
| GET / PUT | `/me/interests`, `/me/skills` | replace the active set (max 10 / 12) |
| GET | `/me/bookings`, `/me/freepasses`, `/me/membership` | |
| POST | `/me/bookings/:id/cancel` | 24 h lock for owners |
| POST | `/me/membership-applications`, `/me/membership-applications/:id/withdraw` | |
| GET | `/clubs`, `/clubs/:code`, `/events`, `/events/:id`, `/interests`, `/skills`, `/membership-types` | public; prices are personalized when signed in |
| PUT / DELETE | `/clubs/:code/membership` | join / leave as MEMBER |
| POST | `/bookings` | `event_id, event_option_id?, seat_id?, table_id?, freepass_code?, join_waitlist?, need_text?, offer_text?` |
| GET | `/admin/membership-applications` | `membership.view` |
| POST | `/admin/membership-applications/:id/decision` | `under_review / approved / waitlisted / declined` |
| POST | `/admin/events` | `event.create`, or club lead → `submitted` |
| POST | `/admin/events/:id/publish`, `/admin/events/:id/cancel` | publish checks pricing, options, seats, location conflicts; cancel cascades |
| GET | `/admin/events/:id/participants` | global or event/club-scoped permission |
| POST | `/admin/bookings/:id/checkin` | |
| POST / DELETE | `/admin/users/:id/roles[/:role]` | `role.assign` / `role.revoke`, audited |

Finance (documents, transactions, allocations), stock, campaigns, invitations and sponsorships are fully modelled and guarded
in the database. Their API endpoints are the next phase.
