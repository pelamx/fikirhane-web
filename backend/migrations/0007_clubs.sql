-- Clubs (CLUB_MEMBER_ROLES, CLUBS, CLUB_USERS).

create table club_member_roles (
  id_club_member_role uuid primary key default gen_random_uuid(),
  role_code text not null unique check (role_code ~ '^[A-Z_]+$'),
  role_name text not null,
  description text,
  role_rank int,
  is_management_role boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table clubs (
  id_club uuid primary key default gen_random_uuid(),
  club_code text not null unique check (club_code ~ '^[A-Z0-9_]+$'),
  club_name text not null,
  club_description text,
  club_type text check (club_type in ('workspace', 'language', 'technology', 'education', 'professional', 'social', 'creative')),
  cover_image text,
  logo text,
  id_financial_center uuid not null unique references financial_centers,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);
create trigger clubs_code_fixed before update on clubs for each row execute function forbid_code_change('club_code');

create table club_users (
  id_club_user uuid primary key default gen_random_uuid(),
  id_club uuid not null references clubs,
  id_user uuid not null references users,
  id_club_member_role uuid not null references club_member_roles,
  club_level text check (club_level in ('new', 'regular', 'active', 'core')),
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended', 'ended')),
  start_date date not null default current_date,
  end_date date,
  joined_source text check (joined_source in ('self_join', 'admin_added', 'invitation', 'event_conversion', 'sponsor_nomination')),
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_date is null or status <> 'active'),
  check (end_date is null or end_date >= start_date)
);
-- CLU-D02: one active relation per user + club (one role per relation in V1).
create unique index club_users_active_uq on club_users (id_user, id_club) where status = 'active';
create index club_users_club_idx on club_users (id_club, status);

-- New club relations need an active (or draft, for set-up) club and an active role (CLU-D10, CMR-D03).
create function club_users_validate() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.id_club_member_role <> old.id_club_member_role then
    if not exists (select 1 from club_member_roles where id_club_member_role = new.id_club_member_role and status = 'active') then
      raise exception 'Club member role is not active' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from clubs where id_club = new.id_club and status in ('active', 'draft')) then
    raise exception 'Club is not open for new members' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger club_users_validate before insert or update on club_users for each row execute function club_users_validate();

create trigger club_member_roles_no_delete before delete on club_member_roles for each row execute function forbid_delete();
create trigger clubs_no_delete before delete on clubs for each row execute function forbid_delete();
create trigger club_users_no_delete before delete on club_users for each row execute function forbid_delete();

select attach_updated_at_triggers();
