# EVENT_SERIES

## Purpose
One row = one program/series (e.g. "Borsa Okuryazarligi", a 5-week program) that groups multiple dated EVENTS (sessions) under one parent identity. EVENT_SERIES = program identity; EVENTS = real dated sessions. A series is NOT a bookable/dated unit: booking, attendance, location and operations stay at EVENTS level. Series-level package enrollment/pricing would go to a separate SERIES_ENROLLMENTS (or SERIES_OFFERS) table (not in V1); completion/certificate belong to the user-series relation, not here.

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_EventSeries | uuid | NOT NULL | gen | PK | Unique, immutable. Example `series_001`, `series_STOCK_LITERACY_2026`. Referenced by EVENTS.ID_EventSeries. |
| series_code | text | NOT NULL | | | Fixed technical code, e.g. `STOCK_MARKET_LITERACY_2026_01`; should be unique. |
| series_name | text | NOT NULL | | | UI name, e.g. "Borsa Okuryazarligi", "AI for Business", "Business English Program". |
| description | text | NULL | | | Program description. |
| series_type | enum/text | NULL | | | Program classification; not required in V1 (event type lives on child events). (V2/optional) |
| cover_image | text (file ref/URL) | NULL | | (file ref, e.g. `file_series_001`) | Listing/detail cover image. |
| status | enum | NOT NULL | 'draft' (implied) | | Program lifecycle; independent from child events' status. |
| start_date | date | NULL | | | Overall start; derivable from first event — V1 treats as derivable (optional planning/snapshot field). |
| end_date | date | NULL | | | Overall end; derivable from last event; not required. |
| expected_event_count | int | NULL | | | Planned number of events; may differ from actual (e.g. plan 5, +1 extra added). |
| booking_mode | enum | NOT NULL | 'event' | | Event-based vs series-based booking. V1 default `event`. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | -> USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | -> USERS.ID_User | |

## Enums / allowed values
- series_type (optional): `course`, `workshop_series`, `training_program`, `masterclass_series`.
- status: `draft` (in preparation), `published` (visible to users), `active` (program started and ongoing), `completed` (all events completed), `cancelled` (program cancelled), `archived` (past record).
- booking_mode: `event` (each event booked separately — V1 default), `series` (user enrolls in whole program), `mixed` (both package and single-event booking possible).

## Constraints & indexes
- PK ID_EventSeries (unique, immutable).
- UNIQUE series_code (recommended: "should be unique").
- EVENTS.ID_EventSeries is a single nullable FK (an event has max one series).

## Relationships
- EVENT_SERIES 1 -> 0..N EVENTS.
- Club relation derived: EVENT_SERIES -> EVENTS -> EVENT_CLUBS -> CLUBS (no SERIES_CLUBS in V1).
- Future: EVENT_SERIES 1 -> N SERIES_ENROLLMENTS (not V1).

## Business rules / data rules
1. ESER-D01: ID_EventSeries unique and immutable.
2. ESER-D02: A series may contain zero or more events.
3. ESER-D03: An event belongs to at most one series.
4. ESER-D04: A series must not substitute booking/attendance records.
5. ESER-D05: Normal booking model stays event-based.
6. ESER-D06: If series package enrollment is needed, use a separate SERIES_ENROLLMENTS table.
7. ESER-D07: Series status may be managed as a lifecycle independent of child event statuses.
8. ESER-D08: Archived/cancelled series must not delete past event records.
9. Not every event needs a series (EVENTS.ID_EventSeries nullable; e.g. standalone "Networking Night").
10. No hard delete; use status = archived (linked event history may exist).
11. Attendance is tracked at event level (user can attend Event 1, miss Event 2...); series completion rate derived from event attendances.
12. No series price in default model; pricing is per Event / EventOption.
13. start_date/end_date are derivable from first/last event; V1 treats them as derivable.

## Superseded / rejected ideas
- An event linked to two series (M:N) — rejected; single FK.
- SERIES_CLUBS junction — not in V1; derive via events.
- series_price single field — rejected; use enrollment/package structure (SERIES_ENROLLMENTS / SERIES_OFFERS) if ever needed.
- SERIES_ENROLLMENTS — not in V1 (sketch: ID_SeriesEnrollment, ID_EventSeries, ID_User, status, price, ...; child bookings could be auto-created).
- completion_status / certificate_eligible on EVENT_SERIES — rejected; belong on user-series relation (SERIES_ENROLLMENTS).
- Series-level attendance — rejected.
- Hard delete — rejected.

## Open questions
- start_date/end_date: computed vs stored snapshot/planning field (V1 leans derivable, but they appear in field list and example).
- series_type enum vs text; whether used at all in V1.
- booking_mode `series`/`mixed` support depends on future SERIES_ENROLLMENTS.

## Example row
ID_EventSeries=series_STOCK_LITERACY_2026, series_code=STOCK_LITERACY_2026, series_name="Borsa Okuryazarligi", description="5 haftalik temel yatirim ve finansal okuryazarlik programi.", series_type=course, cover_image=file_series_001, status=published, start_date=2026-10-01, end_date=2026-10-29, expected_event_count=5, booking_mode=event, created_at=updated_at=2026-09-15 10:00, created_by/updated_by=usr_ADMIN.
