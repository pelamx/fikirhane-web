# Fikirhane shells — phase 1

| Shell | Purpose | Phase 1 |
| --- | --- | --- |
| Public | Discover clubs, understand Fikirhane, view the program, enter membership flow | Implemented |
| Member | Personal home, club discovery/details, joined clubs, bookings, profile, membership application | Implemented against the API; browser-local preview when no API is reachable |
| Host | Club operations and event hosting | Deferred |
| Admin | Back office: membership decisions, events, check-in, roles, and every documented table with its relations | Implemented against the API (no preview mode) |

## Routes

- `/`: public introduction/discovery.
- `/uyelik/`: account sign-up / login in API mode; in preview mode the labeled prototype onboarding (no password or email collected).
- `/uyelik/sifre/`: forgot password; `#t=<token>` sets a new password from an emailed or staff-created link.
- `/member/#anasayfa`: personal home.
- `/member/#kesfet`: all clubs, search/category filter.
- `/member/#kulup/work` (also language, writing): club details.
- `/member/#kuluplerim`: followed clubs, including empty state.
- `/member/#bulusmalar`: sourced program, personal plan, cancel/save.
- `/member/#profil`: name/bio editing, session exit, delete preview.
- `/admin/#genel`: overview counts and the business areas the signed-in staff member can use.
- `/admin/#m/<area>`: business areas in the top menu — Üyeler, Kulüpler, Etkinlikler, Mekânlar, Kurumlar ve sponsorluk, Büyüme, Finans, Stok, Sistem. Each area has a tab per screen/table (e.g. Finans: Belgeler, Belge satırları, Para hareketleri, Ödeme eşleştirmeleri, Hesaplar, Finans merkezleri, Finans kategorileri); a tab opens `#veri/<table>`.
- `/admin/#basvurular`: membership applications; approve, review, waitlist, decline.
- `/admin/#etkinlikler`, `#etkinlik/<id>`, `#yeni-etkinlik`: events incl. drafts; create, publish, cancel, participants, check-in.
- `/admin/#veri`, `#veri/<table>?<column>=<value>`, `#kayit/<table>/<id>`: every documented table with its relations. A record shows its outgoing references, every table that points at it, and the edit / lifecycle buttons its document allows.
- `/admin/#yeni/<table>?<column>=<value>`, `#duzenle/<table>/<id>`: create and edit forms generated from the schema and the table document (value lists, references, help texts, fixed fields).

Relative URLs work under the GitHub Pages project prefix. A guest visiting a member route is directed to onboarding; the intended club/view is restored after entry. An active preview can return to the public area and enter member again. This client-side navigation gate is UX, not an access-control boundary.

## Shared layers

- `scripts/catalog.js`: club/event data shared across shells; source snapshot dated 2026-10-21.
- `scripts/shared.js`: theme, navigation, safe HTML interpolation.
- `scripts/config.js`: API location (same origin when served by the backend; `PAGES_API_URL` for GitHub Pages).
- `scripts/api.js`: fetch wrapper (cookie session, Turkish error messages by error code).
- `scripts/session.js`: session adapter; API mode (accounts, clubs, bookings, membership) or the browser-local preview.
- `app.js`: public behavior and membership entry links.
- `scripts/onboarding.js`: prototype entry/resume.
- `scripts/member.js`: member navigation, views and actions.
- `scripts/admin.js`: admin navigation, views and actions; menu items follow the permissions returned by `/api/admin/schema`.
- `style.css`: brand tokens/public styling; `shells.css`: onboarding/member layout.

The admin shell is linked from the member sidebar only for accounts with a role beyond `USER`. Hiding links is UX: every admin endpoint re-checks permissions on the server. There are no pretend role switches.

## Real membership

The backend in [`backend/`](../backend/README.md) provides email + password sign-up and login (httpOnly cookie sessions; email verification is not built yet), server-side authorization (global roles, plus club/event-scoped roles), and persistent clubs, events and bookings. Public registration only ever creates a `USER`; admin roles are granted by `npm run create-admin` or by an admin holding `role.assign`. Client-side routing remains UX only: every API endpoint re-checks identity, permission and ownership.

The host interface is still deferred. Records that only change through their own flows (bookings, membership applications, invitations, redemptions, user profiles) are shown read-only in the data browser.
