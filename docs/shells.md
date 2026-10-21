# Fikirhane shells — phase 1

| Shell | Purpose | Phase 1 |
| --- | --- | --- |
| Public | Discover clubs, understand Fikirhane, view the program, enter membership flow | Implemented |
| Member | Personal home, club discovery/details, followed clubs, personal program, profile | Implemented as an interactive browser-local prototype |
| Host | Club operations and event hosting | Deferred |
| Admin | Platform and permission management | Deferred |

## Routes

- `/`: public introduction/discovery.
- `/uyelik/`: clearly labeled prototype onboarding/resume, no password or email collected.
- `/member/#anasayfa`: personal home.
- `/member/#kesfet`: all clubs, search/category filter.
- `/member/#kulup/work` (also language, writing): club details.
- `/member/#kuluplerim`: followed clubs, including empty state.
- `/member/#bulusmalar`: sourced program, personal plan, cancel/save.
- `/member/#profil`: name/bio editing, session exit, delete preview.

Relative URLs work under the GitHub Pages project prefix. A guest visiting a member route is directed to onboarding; the intended club/view is restored after entry. An active preview can return to the public area and enter member again. This client-side navigation gate is UX, not an access-control boundary.

## Shared layers

- `scripts/catalog.js`: club/event data shared across shells; source snapshot dated 2026-10-21.
- `scripts/shared.js`: theme, navigation, safe HTML interpolation.
- `scripts/session.js`: browser-local preview adapter and state validation.
- `app.js`: public behavior and membership entry links.
- `scripts/onboarding.js`: prototype entry/resume.
- `scripts/member.js`: member navigation, views and actions.
- `style.css`: brand tokens/public styling; `shells.css`: onboarding/member layout.

No host/admin interface, endpoints or pretend role switches are exposed.

## Before real membership

GitHub Pages is static hosting. This repository does not create accounts, verify identity, register actual event attendance, synchronize users, or protect private data. Preview state is explicitly labeled and stays in the current browser. No passwords or tokens are stored.

Production requires an authentication backend, server-validated sessions, verified account creation/login, persistent database records, server-side authorization for member/host/admin, and real club/event APIs. Replace `session.js` with an API-backed adapter; do not treat localStorage state or hidden routes as authorization. Every privileged server endpoint must validate identity, permission and ownership. Public registration must only create a member; host/admin elevation belongs to a separate authorized workflow.
