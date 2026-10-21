-- Organizations (ORGANIZATIONS, ORGANIZATION_USERS, ORGANIZATION_ROLES).

create table organizations (
  id_organization uuid primary key default gen_random_uuid(),
  organization_name text not null,
  legal_name text,
  organization_type text not null check (organization_type in
    ('company', 'university', 'ngo', 'community', 'government', 'agency', 'other')),
  tax_number text,
  tax_office text,
  registration_number text,
  website text,
  logo text,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);
-- ORG-D02: one row per real institution; tax number is the natural dedupe key when present.
create unique index organizations_tax_number_uq on organizations (tax_number) where tax_number is not null;

create table organization_users (
  id_organization_user uuid primary key default gen_random_uuid(),
  id_organization uuid not null references organizations,
  id_user uuid not null references users,
  organization_role text not null check (organization_role in ('admin', 'manager', 'member', 'representative', 'billing_contact')),
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended', 'ended')),
  start_date date not null default current_date,
  end_date date,
  is_primary boolean,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_date is null or status <> 'active'),
  check (end_date is null or end_date >= start_date)
);
create unique index organization_users_active_uq on organization_users (id_user, id_organization) where status = 'active';

create table organization_roles (
  id_organization_role uuid primary key default gen_random_uuid(),
  id_organization uuid not null references organizations,
  role_type text not null check (role_type in ('supplier', 'customer', 'sponsor', 'partner', 'club_partner', 'event_partner')),
  status text not null default 'active' check (status in ('active', 'inactive', 'ended')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index organization_roles_active_uq on organization_roles (id_organization, role_type) where status = 'active';

create trigger organizations_no_delete before delete on organizations for each row execute function forbid_delete();
create trigger organization_users_no_delete before delete on organization_users for each row execute function forbid_delete();
create trigger organization_roles_no_delete before delete on organization_roles for each row execute function forbid_delete();

select attach_updated_at_triggers();
