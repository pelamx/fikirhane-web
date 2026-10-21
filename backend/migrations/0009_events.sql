-- Events (EVENT_SERIES, EVENTS, EVENT_OPTIONS, EVENT_CLUBS, EVENT_ORGANIZATIONS, EVENT_USERS).
-- EVENT_LOCATIONS is intentionally not created: EVENT_OPTIONS carries the event-location relation.
-- CLUB_EVENTS.md / ORGANIZATION_EVENTS.md are implemented under the names their docs prefer.

create table event_series (
  id_event_series uuid primary key default gen_random_uuid(),
  series_code text not null unique,
  series_name text not null,
  description text,
  series_type text check (series_type in ('course', 'workshop_series', 'training_program', 'masterclass_series')),
  cover_image text,
  status text not null default 'draft' check (status in ('draft', 'published', 'active', 'completed', 'cancelled', 'archived')),
  start_date date,
  end_date date,
  expected_event_count int check (expected_event_count >= 0),
  booking_mode text not null default 'event' check (booking_mode in ('event', 'series', 'mixed')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table events (
  id_event uuid primary key default gen_random_uuid(),
  id_event_series uuid references event_series,
  event_code text unique,
  event_type text not null check (event_type in ('workspace', 'meetup', 'workshop', 'talk', 'class', 'social')),
  event_title text not null check (btrim(event_title) <> ''),
  event_description text,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  timezone text not null default 'Europe/Istanbul',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'published', 'cancelled', 'completed', 'archived')),
  base_price numeric(12,2) check (base_price >= 0),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  minimum_attendees int check (minimum_attendees >= 0),
  networking_enabled boolean not null default false,
  show_interests boolean not null default false,
  show_skills boolean not null default false,
  enable_need boolean not null default false,
  enable_offer boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_datetime > start_datetime),
  check (base_price is null or currency_code is not null)
);
create index events_start_idx on events (status, start_datetime);

create table event_options (
  id_event_option uuid primary key default gen_random_uuid(),
  id_event uuid not null references events,
  id_location uuid not null references locations,
  id_space_setup uuid not null,
  option_code text not null,
  option_name text,
  capacity int not null check (capacity > 0),
  booking_unit text not null check (booking_unit in ('location', 'table', 'seat')),
  price_adjustment numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'cancelled', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  unique (id_event, option_code),
  unique (id_event_option, id_event),
  -- EOPT-D03: the setup must belong to the option's location.
  foreign key (id_space_setup, id_location) references space_setups (id_space_setup, id_location)
);
create unique index event_options_active_place_uq on event_options (id_event, id_location, id_space_setup) where status = 'active';

-- EOPT-D05/D06 and LOC-D04 / SETUP-D05 on new options; EOPT-D12 once bookings exist (checked in 0011).
create function event_options_validate() returns trigger language plpgsql as $$
declare setup_capacity int; setup_status text; location_status text;
begin
  select s.capacity, s.status, l.status into setup_capacity, setup_status, location_status
    from space_setups s join locations l using (id_location) where s.id_space_setup = new.id_space_setup;
  if new.capacity > setup_capacity then
    raise exception 'Option capacity % exceeds setup capacity %', new.capacity, setup_capacity using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and (setup_status <> 'active' or location_status <> 'active') then
    raise exception 'Location and setup must be active for a new event option' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger event_options_validate before insert or update of capacity, id_space_setup, id_location on event_options
  for each row execute function event_options_validate();

create table event_clubs (
  id_event_club uuid primary key default gen_random_uuid(),
  id_club uuid not null references clubs,
  id_event uuid not null references events,
  club_event_role text not null check (club_event_role in ('organizer', 'co_organizer', 'partner')),
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled', 'ended')),
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (not is_primary or club_event_role = 'organizer')
);
create unique index event_clubs_active_uq on event_clubs (id_club, id_event) where status = 'active';
create unique index event_clubs_primary_uq on event_clubs (id_event) where is_primary and status = 'active';

create table event_organizations (
  id_event_organization uuid primary key default gen_random_uuid(),
  id_event uuid not null references events,
  id_organization uuid not null references organizations,
  organization_event_role text not null check (organization_event_role in
    ('organizer', 'co_organizer', 'partner', 'sponsor', 'content_partner', 'venue_partner')),
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled', 'ended')),
  is_primary boolean not null default false,
  start_at timestamptz,
  end_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_at is null or start_at is null or end_at >= start_at)
);
create unique index event_organizations_active_uq on event_organizations (id_event, id_organization, organization_event_role) where status = 'active';
create unique index event_organizations_primary_uq on event_organizations (id_event, organization_event_role) where is_primary and status = 'active';

create table event_users (
  id_event_user uuid primary key default gen_random_uuid(),
  id_event uuid not null references events,
  id_user uuid not null references users,
  event_user_role text not null check (event_user_role in ('tutor', 'speaker', 'moderator', 'host', 'facilitator', 'staff')),
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled', 'ended')),
  is_primary boolean,
  start_at timestamptz,
  end_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_at is null or start_at is null or end_at >= start_at)
);
create unique index event_users_active_uq on event_users (id_event, id_user, event_user_role) where status = 'active';

create trigger event_series_no_delete before delete on event_series for each row execute function forbid_delete();
create trigger events_no_delete before delete on events for each row execute function forbid_delete();
create trigger event_options_no_delete before delete on event_options for each row execute function forbid_delete();
create trigger event_organizations_no_delete before delete on event_organizations for each row execute function forbid_delete();
create trigger event_users_no_delete before delete on event_users for each row execute function forbid_delete();

-- Draft-stage event_clubs mistakes may be deleted; once the event is published they are history (CLEVT rule 11).
create function event_clubs_delete_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from events where id_event = old.id_event and status <> 'draft') then
    raise exception 'Club relations of a non-draft event cannot be deleted' using errcode = 'restrict_violation';
  end if;
  return old;
end $$;
create trigger event_clubs_delete_guard before delete on event_clubs for each row execute function event_clubs_delete_guard();

select attach_updated_at_triggers();
