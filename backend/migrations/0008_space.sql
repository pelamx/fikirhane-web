-- Physical space (LOCATIONS -> SPACE_SETUPS -> TABLES / SEATS).
-- Map coordinates are normalized 0..1 on the whole setup canvas; x/y is the object's CENTER point.

create table locations (
  id_location uuid primary key default gen_random_uuid(),
  location_code text not null unique check (location_code ~ '^[A-Z0-9_]+$'),
  location_name text not null,
  location_type text check (location_type in ('workspace', 'meeting_room', 'event_space', 'cafeteria', 'terrace', 'support_area')),
  description text,
  max_capacity int not null check (max_capacity > 0),
  floor text,
  indoor_outdoor text check (indoor_outdoor in ('indoor', 'outdoor', 'semi_outdoor')),
  reservable boolean not null default true,
  default_price_adjustment numeric(12,2),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'inactive', 'maintenance', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table space_setups (
  id_space_setup uuid primary key default gen_random_uuid(),
  id_location uuid not null references locations,
  setup_code text not null unique check (setup_code ~ '^[A-Z0-9_]+$'),
  setup_name text not null,
  setup_type text check (setup_type in ('cowork', 'classroom', 'u_shape', 'boardroom', 'chairs_only', 'standing', 'custom')),
  description text,
  capacity int not null check (capacity > 0),
  default_booking_unit text check (default_booking_unit in ('seat', 'table', 'location')),
  map_image text,
  map_aspect_ratio numeric(6,2) check (map_aspect_ratio > 0),
  version_no int not null default 1 check (version_no > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  unique (id_space_setup, id_location)
);

-- SETUP-D04: setup capacity <= location max capacity.
create function space_setups_capacity_check() returns trigger language plpgsql as $$
begin
  if new.capacity > (select max_capacity from locations where id_location = new.id_location) then
    raise exception 'Setup capacity exceeds location max capacity' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger space_setups_capacity before insert or update of capacity, id_location on space_setups
  for each row execute function space_setups_capacity_check();

create table tables (
  id_table uuid primary key default gen_random_uuid(),
  id_space_setup uuid not null references space_setups,
  table_code text not null,
  table_name text not null,
  seat_capacity int check (seat_capacity >= 0),
  reservable boolean not null default false,
  position_x numeric(4,3) check (position_x between 0 and 1),
  position_y numeric(4,3) check (position_y between 0 and 1),
  width numeric(4,3) check (width between 0 and 1),
  height numeric(4,3) check (height between 0 and 1),
  rotation numeric(6,2) default 0,
  shape text check (shape in ('rectangle', 'round', 'oval', 'square', 'custom')),
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  unique (id_space_setup, table_code),
  unique (id_table, id_space_setup)
);

create table seats (
  id_seat uuid primary key default gen_random_uuid(),
  id_space_setup uuid not null references space_setups,
  id_table uuid,
  seat_code text not null,
  seat_name text not null,
  seat_type text check (seat_type in ('standard', 'accessible', 'high_stool', 'window')),
  reservable boolean not null default true,
  position_x numeric(4,3) check (position_x between 0 and 1),
  position_y numeric(4,3) check (position_y between 0 and 1),
  rotation numeric(6,2),
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  unique (id_space_setup, seat_code),
  -- SEAT-D02: a seat's table must belong to the same setup.
  foreign key (id_table, id_space_setup) references tables (id_table, id_space_setup)
);

create trigger locations_no_delete before delete on locations for each row execute function forbid_delete();
create trigger space_setups_no_delete before delete on space_setups for each row execute function forbid_delete();
create trigger tables_no_delete before delete on tables for each row execute function forbid_delete();
create trigger seats_no_delete before delete on seats for each row execute function forbid_delete();

select attach_updated_at_triggers();
