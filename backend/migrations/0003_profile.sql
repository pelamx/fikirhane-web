-- Profile taxonomies and junctions (SKILLS, USER_SKILLS, INTERESTS, USER_INTERESTS).
-- NEEDS / OFFERS are referenced by BOOKINGS but undocumented; minimal free-text versions are defined here.

create table skills (
  id_skill uuid primary key default gen_random_uuid(),
  skill_code text not null unique check (skill_code ~ '^[A-Z0-9_]+$'),
  skill_name text not null unique,
  category text not null check (category in
    ('Technology', 'Business', 'Finance', 'Creative', 'Language', 'Communication', 'Operations', 'Management', 'Data', 'Marketing')),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table user_skills (
  id_user_skill uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  id_skill uuid not null references skills,
  skill_level text check (skill_level in
    ('beginner', 'intermediate', 'advanced', 'expert', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native')),
  priority int check (priority > 0),
  is_verified boolean not null default false,
  verified_by_user_id uuid references users,
  verified_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (not is_verified or (verified_by_user_id is not null and verified_at is not null))
);
create unique index user_skills_active_uq on user_skills (id_user, id_skill) where status = 'active';
create index user_skills_skill_idx on user_skills (id_skill);

create table interests (
  id_interest uuid primary key default gen_random_uuid(),
  interest_code text not null unique check (interest_code ~ '^[A-Z0-9_]+$'),
  interest_name text not null unique,
  category text not null check (category in
    ('Technology', 'Business', 'Creative', 'Finance', 'Lifestyle', 'Languages', 'Science', 'Society', 'Professional')),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table user_interests (
  id_user_interest uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  id_interest uuid not null references interests,
  priority int check (priority > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);
create unique index user_interests_active_uq on user_interests (id_user, id_interest) where status = 'active';
create index user_interests_interest_idx on user_interests (id_interest);

-- New selections must reference active taxonomy rows (USKL-D03, UINT-D03).
create function user_skills_require_active() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from skills where id_skill = new.id_skill and status = 'active') then
    raise exception 'Skill is not active' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create function user_interests_require_active() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from interests where id_interest = new.id_interest and status = 'active') then
    raise exception 'Interest is not active' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger user_skills_active_skill before insert on user_skills for each row execute function user_skills_require_active();
create trigger user_interests_active_interest before insert on user_interests for each row execute function user_interests_require_active();

create table needs (
  id_need uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  need_text text not null check (btrim(need_text) <> ''),
  status text not null default 'active' check (status in ('active', 'resolved', 'archived')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);
create index needs_user_idx on needs (id_user);

create table offers (
  id_offer uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  offer_text text not null check (btrim(offer_text) <> ''),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);
create index offers_user_idx on offers (id_user);

create trigger skills_no_delete before delete on skills for each row execute function forbid_delete();
create trigger interests_no_delete before delete on interests for each row execute function forbid_delete();

select attach_updated_at_triggers();
