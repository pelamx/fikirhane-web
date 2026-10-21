-- Bookings and freepass redemptions (BOOKINGS, FREEPASS_REDEMPTIONS).
-- Capacity-consuming booking statuses: pending_payment, confirmed, checked_in (EOPT rule 19).
-- "Active" for the one-booking-per-user-per-event rule additionally includes waitlisted.

create table bookings (
  id_booking uuid primary key default gen_random_uuid(),
  id_event uuid not null,
  id_event_option uuid not null,
  id_user uuid references users,
  booked_by_user_id uuid references users,
  id_invitation uuid references invitations,
  id_freepass uuid references freepasses,
  id_membership_type_at_booking uuid references membership_types,
  booking_status text not null check (booking_status in
    ('pending_payment', 'confirmed', 'waitlisted', 'checked_in', 'completed', 'cancelled', 'expired', 'no_show')),
  booking_source text not null check (booking_source in ('web', 'mobile_app', 'staff', 'phone', 'whatsapp', 'walk_in', 'invitation', 'freepass')),
  booked_at timestamptz not null default now(),
  expires_at timestamptz,
  booking_unit text not null check (booking_unit in ('location', 'table', 'seat')),
  id_table uuid references tables,
  id_seat uuid references seats,
  id_need uuid references needs,
  need_text_snapshot text,
  id_offer uuid references offers,
  offer_text_snapshot text,
  price_list_amount numeric(12,2) check (price_list_amount >= 0),
  discount_amount numeric(12,2) check (discount_amount >= 0),
  final_price numeric(12,2) not null check (final_price >= 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  payment_status text not null check (payment_status in
    ('unpaid', 'pending', 'paid', 'partially_paid', 'refunded', 'partially_refunded', 'waived')),
  checkin_at timestamptz,
  checkout_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references users,
  cancellation_reason text check (cancellation_reason in ('user_request', 'event_cancelled', 'payment_failed', 'duplicate', 'admin_override', 'other')),
  is_manual_booking boolean not null default false,
  override_reason text,
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_phone text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  -- BOOK-D02: the booking's event must be the option's event.
  foreign key (id_event_option, id_event) references event_options (id_event_option, id_event),
  -- Seat/table are required once a place is allocated; waitlisted bookings hold no place yet.
  check (booking_status = 'waitlisted' or booking_unit <> 'seat' or id_seat is not null),
  check (booking_status = 'waitlisted' or booking_unit <> 'table' or id_table is not null),
  check (booking_unit = 'seat' or id_seat is null),
  check (booking_unit = 'table' or id_table is null),
  -- BOOK-D05: registered user or sufficient guest identity.
  check (id_user is not null or (guest_first_name is not null and (guest_email is not null or guest_phone is not null))),
  check (booking_status <> 'cancelled' or cancelled_at is not null),
  check (booking_status <> 'waitlisted' or (id_seat is null and id_table is null)),
  check (price_list_amount is null or discount_amount is null or final_price = price_list_amount - discount_amount)
);
-- BOOK-D06: one active booking per user per event.
create unique index bookings_user_event_active_uq on bookings (id_user, id_event)
  where id_user is not null and booking_status in ('pending_payment', 'confirmed', 'checked_in', 'waitlisted');
-- BOOK-D08 / SEAT-D06: no double-booked seat in an option.
create unique index bookings_seat_active_uq on bookings (id_event_option, id_seat)
  where id_seat is not null and booking_status in ('pending_payment', 'confirmed', 'checked_in');
-- TABLE-D10: no double-booked whole table in an option.
create unique index bookings_table_active_uq on bookings (id_event_option, id_table)
  where id_table is not null and booking_status in ('pending_payment', 'confirmed', 'checked_in');
create index bookings_option_status_idx on bookings (id_event_option, booking_status);
create index bookings_user_idx on bookings (id_user, booking_status);
create index bookings_pending_expiry_idx on bookings (expires_at) where booking_status = 'pending_payment';

-- Seats/tables must belong to the option's setup and be bookable (SEAT-D05/D07, TABLE-D05/D09).
create function bookings_validate_unit() returns trigger language plpgsql as $$
declare opt record;
begin
  if tg_op = 'UPDATE' and new.id_seat is not distinct from old.id_seat and new.id_table is not distinct from old.id_table then
    return new;
  end if;
  select id_space_setup, booking_unit into opt from event_options where id_event_option = new.id_event_option;
  if new.booking_unit <> opt.booking_unit then
    raise exception 'Booking unit must match the event option (%)', opt.booking_unit using errcode = 'check_violation';
  end if;
  if new.id_seat is not null and not exists (
      select 1 from seats where id_seat = new.id_seat and id_space_setup = opt.id_space_setup and status = 'active' and reservable) then
    raise exception 'Seat is not bookable for this option' using errcode = 'check_violation';
  end if;
  if new.id_table is not null and not exists (
      select 1 from tables where id_table = new.id_table and id_space_setup = opt.id_space_setup and status = 'active' and reservable) then
    raise exception 'Table is not bookable for this option' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger bookings_validate_unit before insert or update of id_seat, id_table, booking_unit on bookings
  for each row execute function bookings_validate_unit();

-- EOPT-D12: once bookings exist, location / setup / booking unit of an option are frozen.
create function event_options_freeze_booked() returns trigger language plpgsql as $$
begin
  if (new.id_location, new.id_space_setup, new.booking_unit) is distinct from (old.id_location, old.id_space_setup, old.booking_unit)
     and exists (select 1 from bookings where id_event_option = old.id_event_option) then
    raise exception 'Option has bookings; create a new option instead of changing location, setup or booking unit'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger event_options_freeze_booked before update on event_options for each row execute function event_options_freeze_booked();

create table freepass_redemptions (
  id_freepass_redemption uuid primary key default gen_random_uuid(),
  id_freepass uuid not null references freepasses,
  id_booking uuid not null references bookings,
  redeemed_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'reversed', 'cancelled')),
  reversed_at timestamptz,
  reversed_by_user_id uuid references users,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (status <> 'reversed' or reversed_at is not null)
);
create unique index freepass_redemptions_booking_active_uq on freepass_redemptions (id_booking) where status = 'active';
create index freepass_redemptions_freepass_idx on freepass_redemptions (id_freepass, status);

-- FPRED-D03 last line of defense (the service also locks the freepass row): active uses <= usage_limit.
create function freepass_redemptions_limit() returns trigger language plpgsql as $$
declare lim int; used int;
begin
  if new.status <> 'active' then return new; end if;
  select usage_limit into lim from freepasses where id_freepass = new.id_freepass for update;
  select count(*) into used from freepass_redemptions
    where id_freepass = new.id_freepass and status = 'active' and id_freepass_redemption <> new.id_freepass_redemption;
  if used >= lim then
    raise exception 'Freepass usage limit reached' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger freepass_redemptions_limit before insert or update of status on freepass_redemptions
  for each row execute function freepass_redemptions_limit();

create trigger bookings_no_delete before delete on bookings for each row execute function forbid_delete();
create trigger freepass_redemptions_no_delete before delete on freepass_redemptions for each row execute function forbid_delete();

select attach_updated_at_triggers();
