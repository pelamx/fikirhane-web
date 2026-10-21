# EVENT_LOCATIONS

## Purpose
DECISION: DO NOT CREATE THIS TABLE. The Event–Location relationship is fully represented by EVENT_OPTIONS (ID_Event + ID_Location + ID_SpaceSetup, plus capacity, booking_unit, price_adjustment, status). A separate EVENT_LOCATIONS would store the same business fact twice. An event's locations are derived as "the Locations of the EventOptions linked to the Event". Data dictionary note (verbatim intent): "EVENT_LOCATIONS is not used as a separate table. The Event–Location relationship is built via EVENT_OPTIONS, because this relationship also carries booking attributes beyond Location such as Setup, Capacity, Booking Unit and Pricing Adjustment."

## Final fields
None — table is not created.

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| (none) | | | | | Use EVENT_OPTIONS.ID_Event / EVENT_OPTIONS.ID_Location. |

## Enums / allowed values
None.

## Constraints & indexes
None (table not created).

## Relationships
Keep in ER diagram (remove EVENT_LOCATIONS):
- EVENTS 1:N EVENT_OPTIONS
- LOCATIONS 1:N EVENT_OPTIONS
- SPACE_SETUPS 1:N EVENT_OPTIONS
EVENT_OPTIONS = EVENT + LOCATION + SETUP, adding capacity, booking_unit, price_adjustment.

## Business rules / data rules
1. Event locations are derived from EVENT_OPTIONS (e.g. Working Club PM options Fikirhane/Cowork V1/16 and Atolye/Focus V1/12 -> locations Fikirhane, Atolye).
2. The same business fact must not be held in two places (risk example: EVENT_LOCATIONS says Event 100 -> Fikirhane, EVENT_OPTIONS says Event 100 -> Atolye: contradiction).
3. EVENT_OPTIONS is conceptually "the EventLocation relationship that gained booking/commercial attributes"; the name EVENT_OPTIONS is preferred because the user selects location + setup + capacity + price + booking behaviour, i.e. an event booking option.
4. Single-location events still get 1 EVENT_OPTION (e.g. English Meetup -> only Atolye, U-Shape, 10 people, Seat), so the same architecture serves single- and multi-location events.

## Superseded / rejected ideas
- EVENT_LOCATIONS (ID_Event, ID_Location) junction — rejected (redundant with EVENT_OPTIONS). Would only make sense if each location had no setup/capacity/booking unit/price adjustment of its own (simple venue mapping).

## Open questions
- Future, non-booking event places (`broadcast_location`, `meeting_point`, `parking_location`, `external_venue`) might need a separate entity, likely named EVENT_PLACES or EVENT_VENUES — not in current model.

## Example row
None (table not created). Equivalent data lives in EVENT_OPTIONS rows.
