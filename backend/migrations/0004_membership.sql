-- Commercial membership (MEMBERSHIP_TYPES, MEMBERSHIP_APPLICATIONS, USER_MEMBERSHIPS).
-- Visitor is not a type: it is a user with no active USER_MEMBERSHIPS row (MTYPE-D03).

create table membership_types (
  id_membership_type uuid primary key default gen_random_uuid(),
  membership_type_code text not null unique check (membership_type_code ~ '^[A-Z_]+$' and membership_type_code <> 'VISITOR'),
  membership_type_name text not null,
  description text,
  discount_rate numeric(5,2) not null check (discount_rate between 0 and 100),
  reservation_window_days int not null check (reservation_window_days >= 0),
  max_active_bookings int not null check (max_active_bookings >= 0),
  booking_priority int not null default 0,
  seat_selection_enabled boolean not null default false,
  priority_booking_enabled boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table membership_applications (
  id_membership_application uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  id_membership_type uuid not null references membership_types,
  status text not null default 'draft' check (status in
    ('draft', 'submitted', 'under_review', 'approved', 'waitlisted', 'declined', 'withdrawn', 'expired')),
  motivation_text text,
  offer_text text,
  need_text text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references users,
  decision_note text,
  decision_reason text check (decision_reason in
    ('approved_profile_fit', 'approved_active_participation', 'waitlist_capacity', 'declined_incomplete_profile', 'declined_policy', 'other')),
  waitlist_until date,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (status = 'draft' or submitted_at is not null),
  check (status not in ('approved', 'waitlisted', 'declined') or (reviewed_at is not null and reviewed_by_user_id is not null))
);
-- MAPP-D03: one open application per user + type.
create unique index membership_applications_open_uq on membership_applications (id_user, id_membership_type)
  where status in ('draft', 'submitted', 'under_review', 'waitlisted');

create table user_memberships (
  id_user_membership uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  id_membership_type uuid not null references membership_types,
  id_membership_application uuid references membership_applications,
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'cancelled', 'suspended', 'ended')),
  start_date date not null,
  end_date date,
  approved_at timestamptz,
  approved_by_user_id uuid references users,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references users,
  cancellation_reason text,
  source text check (source in ('admin_grant', 'application', 'campaign', 'conversion', 'manual', 'system')),
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_date is null or end_date >= start_date),
  check (status <> 'cancelled' or cancelled_at is not null)
);
-- UMEM-D02: at most one active membership per user.
create unique index user_memberships_active_uq on user_memberships (id_user) where status = 'active';
create unique index user_memberships_application_uq on user_memberships (id_membership_application) where id_membership_application is not null;
create index user_memberships_expiry_idx on user_memberships (status, end_date);

-- New applications and memberships require an active membership type (MAPP-D02, UMEM-D06).
create function require_active_membership_type() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from membership_types where id_membership_type = new.id_membership_type and status = 'active') then
    raise exception 'Membership type is not active' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger membership_applications_active_type before insert on membership_applications
  for each row execute function require_active_membership_type();
create trigger user_memberships_active_type before insert on user_memberships
  for each row execute function require_active_membership_type();

-- Upgrade/downgrade never mutates the type of an existing membership (UMEM-D05).
create function user_memberships_type_immutable() returns trigger language plpgsql as $$
begin
  if new.id_membership_type <> old.id_membership_type or new.id_user <> old.id_user then
    raise exception 'Close the membership and create a new one instead of changing its type or user'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger user_memberships_immutable_type before update on user_memberships
  for each row execute function user_memberships_type_immutable();

create trigger membership_types_no_delete before delete on membership_types for each row execute function forbid_delete();
create trigger membership_applications_no_delete before delete on membership_applications for each row execute function forbid_delete();
create trigger user_memberships_no_delete before delete on user_memberships for each row execute function forbid_delete();

select attach_updated_at_triggers();
