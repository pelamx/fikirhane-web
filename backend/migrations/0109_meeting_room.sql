-- The meeting room is booked whole: one booking takes the room for its slot (booking unit `location`, see seeds/demo.sql for
-- the weekday evening slots). Capacity follows the public page: 4–6 people around one table.
insert into space_setups (id_location, setup_code, setup_name, setup_type, description, capacity, default_booking_unit, status, sort_order)
select l.id_location, 'MEETING_ROOM_V1', 'Toplantı odası — tek masa', 'boardroom',
       'One table for 4–6 people, a screen for presentations and online calls, a whiteboard.', 6, 'location', 'active', 30
from locations l where l.location_code = 'MEETING_ROOM';
