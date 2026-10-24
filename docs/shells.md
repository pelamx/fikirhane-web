# Fikirhane shells

The site has four layers. Each one is a set of screens; what someone may read or change inside a screen is still decided
per API endpoint by permissions.

| Shell | Who enters | What it is for | Where |
| --- | --- | --- | --- |
| Visitor | Everyone, signed in or not | Discover Fikirhane: clubs, program, spaces, sign-up | `/`, `/kulupler/`, `/coworking/` and the other space pages, `/uyelik/`, `/rezervasyon/` (booking asks for sign-in) |
| Member | Every signed-in account (from sign-up on; the Basic and Plus plans change prices, booking window and active bookings, and Plus adds a monthly free guest) | Personal home, clubs, bookings, profile, membership application | `/member/` |
| Host | Staff roles holding `shell.host` (FIKIRHANE_ADMIN, KITCHEN_STAFF, ACCOUNTING, MARKETING), plus club leads, co-leads and moderators and event hosts/tutors/facilitators/moderators/staff for their own clubs and upcoming events | Daily work: today, program, door check, membership applications, each staff role's own records, "Sorumluluklarım" | `/host/` |
| Admin | Roles holding `shell.admin` (FIKIRHANE_ADMIN, TECH_ADMIN) | The back office: every table and relation the role may see, roles and permissions, system settings, audit log | `/admin/` |

How it is decided:

- The server computes the shells in `GET /api/me` → `shells` (`backend/src/services/shells.ts`); visitor needs nothing and is not listed.
- `shell.host` and `shell.admin` are ordinary permissions (`migrations/0108_shells.sql`), so who gets which shell can be changed per role in Yönetim → Sistem → Rol yetkileri.
- Scoped host access comes from `club_users` with a managing club role and active `event_users` rows on events that have not ended. `GET /api/host/scope` lists those clubs and events; `GET /api/host/clubs/:id/members` needs `club_members.view` in that club.

How people move between them:

- One top menu (`scripts/topnav.js`) on every page: the current shell's areas inline, and one Hesabım drop-down with the other shells this account has and the account; it folds under ☰ on phones and whenever the links do not fit beside the logo.
- Host and admin are the same app (`scripts/admin.js`) with different areas. Daily-work screens opened in admin (`#basvurular`, `#etkinlikler`, `#kontrol`, …) move to host; back-office tables opened in host move to admin when the account has it. Without the other shell the screen says where it lives instead.
- A booking's QR opens `/host/#kontrol`; older QR codes pointing at `/admin/#kontrol` are forwarded.
- Opening host or admin while signed out goes to sign-in and returns to the same screen; an account without that shell is told so, with links to the shells it has.

## Routes

- `/`: public introduction/discovery.
- `/coworking/`, `/toplanti-odasi/`, `/etkinlik-alani/`, `/language-meetup/`: one page per space, linked from the home page's Mekân & topluluk list; facts from fikirhane.co/ng (24 October 2026); each page is built around its use (session times, room plan, seating layouts, questions about the meetup); `scripts/space.js` for theme, menu and membership links.
- `/kulupler/`: Kulüpler — every club with its art, what it is, its next meetings (API mode, linking into the reservation flow) and Kulübe katıl (member area for members, sign-up for visitors); the top menu's Kulüpler and the home page's club links open it; `scripts/clubs.js`.
- `/tur/`: Tur planla — a visit request written as a short note (name, a weekday, morning or afternoon, interests, e-mail or phone); it lands in the host shell.
- `/uyelik/`: account sign-up / login in API mode; in preview mode the labeled prototype onboarding (no password or email collected).
- `/uyelik/sifre/`: forgot password; `#t=<token>` sets a new password from an emailed or staff-created link.
- `/rezervasyon/?tarih&seans&adim&salon&koltuk`: reservation flow — Seans (week strip, day's sessions with personal price and availability) → Koltuk (rooms and seat plans drawn over `assets/plans/*.png`; seat picking for members whose membership allows it, otherwise the first free seat is assigned) → Bilgiler (need/offer, freepass; sign-in returns to the same step) → Onay. The member area's "Yer ayırt" opens it.
- `/member/#anasayfa`: personal home.
- `/member/#kesfet`: all clubs, search/category filter.
- `/member/#kulup/work` (also language, writing): club details.
- `/member/#kuluplerim`: followed clubs, including empty state.
- `/member/#bulusmalar`: sourced program, personal plan, cancel/save.
- `/member/#profil`: name/bio editing, session exit, delete preview.
- `/host/#genel`: Bugün — counts for daily work, the signed-in person's upcoming events, and the areas they can use.
- `/host/#m/<area>`: host areas in the top menu — Program, Sorumluluklarım, Üyeler, Kafeterya ve stok, Finans, Büyüme; each shows only the screens and tables the account may use.
- `/host/#basvurular`: membership applications; approve, review, waitlist, decline.
- `/host/#turlar`: visit requests from Tur planla; contact details, and the status staff set (contacted, time agreed, visited, cancelled) with an optional note.
- `/host/#etkinlikler`, `#etkinlik/<id>`, `#yeni-etkinlik`: events incl. drafts; create, publish, cancel, participants, check-in.
- `/host/#kontrol?k=<token>&tarih&seans`: door check opened by scanning a booking's QR; green with "Girişi onayla" only during that session (from 15 minutes before the start), red with the reason otherwise.
- `/host/#kuluplerim`, `#etkinliklerim`: what a club lead or event host runs — their clubs with members, and their upcoming events with participants and check-in.
- `/admin/#genel`: overview counts and the back-office areas the signed-in account can use.
- `/admin/#m/<area>`: back-office areas in the top menu — Üyeler, Kulüpler, Etkinlikler, Mekânlar, Kurumlar ve sponsorluk, Büyüme, Finans, Stok, Sistem. Each area has a tab per table (e.g. Finans: Belgeler, Belge satırları, Para hareketleri, Ödeme eşleştirmeleri, Hesaplar, Finans merkezleri, Finans kategorileri); a tab opens `#veri/<table>`.
- `/admin/#veri`, `#veri/<table>?<column>=<value>`, `#kayit/<table>/<id>`: every documented table with its relations. A record shows its outgoing references, every table that points at it, and the edit / lifecycle buttons its document allows. Host areas reuse these screens for their own tables.
- `/admin/#yeni/<table>?<column>=<value>`, `#duzenle/<table>/<id>`: create and edit forms generated from the schema and the table document (value lists, references, help texts, fixed fields).

Relative URLs work under the GitHub Pages project prefix. A guest visiting a member route is directed to onboarding; the intended club/view is restored after entry. An active preview can return to the public area and enter member again. This client-side navigation gate is UX, not an access-control boundary.

## Shared layers

- `scripts/catalog.js`: club/event data shared across shells; source snapshot dated 2026-10-21.
- `scripts/shared.js`: theme, navigation, safe HTML interpolation.
- `scripts/topnav.js`: the one top menu beside the logo on every page — the current shell's links inline, one Hesabım drop-down to switch shells (Keşfet, Üye alanım, Host paneli, Yönetim as the account allows) and for the account; it folds under ☰ on narrow screens and whenever the links do not fit. There are no side menus.
- `scripts/config.js`: API location (same origin when served by the backend; `PAGES_API_URL` for GitHub Pages).
- `scripts/api.js`: fetch wrapper (cookie session, Turkish error messages by error code).
- `scripts/session.js`: session adapter; API mode (accounts, clubs, bookings, membership) or the browser-local preview.
- `app.js`: public behavior and membership entry links.
- `scripts/space.js`: the space pages' theme, menu and membership entry links.
- `scripts/onboarding.js`: prototype entry/resume.
- `scripts/member.js`: member navigation, views and actions.
- `scripts/admin.js`: host and admin shells (`body[data-shell]`), views and actions; areas follow the permissions returned by `/api/admin/schema` and, in host, the scope from `/api/host/scope`.
- `style.css`: brand tokens/public styling; `shells.css`: onboarding/member layout.

The host and admin shells appear in the top menu only for accounts that have them (`/api/me` → `shells`). Hiding links is UX: every endpoint re-checks permissions on the server. There are no pretend role switches.

## Real membership

The backend in [`backend/`](../backend/README.md) provides email + password sign-up and login (httpOnly cookie sessions; email verification is not built yet), server-side authorization (global roles, plus club/event-scoped roles), and persistent clubs, events and bookings. Public registration only ever creates a `USER`; admin roles are granted by `npm run create-admin` or by an admin holding `role.assign`. Client-side routing remains UX only: every API endpoint re-checks identity, permission and ownership.

Records that only change through their own flows (bookings, membership applications, invitations, redemptions, user profiles) are shown read-only in the data browser.
