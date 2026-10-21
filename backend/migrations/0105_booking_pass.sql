-- Entry pass for each booking (QR). A supporting column, not in BOOKINGS.md: an unguessable token the QR carries; the
-- server reads date, session window and status from the booking itself, so a QR is only accepted for its own session.
alter table bookings add column checkin_token text;
update bookings set checkin_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') where checkin_token is null;
alter table bookings alter column checkin_token set default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
alter table bookings alter column checkin_token set not null;
create unique index bookings_checkin_token_uq on bookings (checkin_token);
