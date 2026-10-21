-- Identity, authentication, global RBAC and audit (USERS, ROLES, PERMISSIONS, ROLE_PERMISSIONS, USER_ROLES, AUDIT_LOG).
-- USER_EMAILS, AUTH_IDENTITIES and USER_SESSIONS are referenced by USERS.md but undocumented; minimal versions
-- are defined here (see docs/backend-decisions.md).

create table users (
  id_user uuid primary key default gen_random_uuid(),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  profile_photo text,
  headline text,
  bio text,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'inactive', 'deleted')),
  networking_enabled boolean not null default false,
  profile_visibility text not null default 'community'
    check (profile_visibility in ('private', 'community')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

-- Contact emails (USR-D07). One primary email per user; an email belongs to at most one active owner.
create table user_emails (
  id_user_email uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  email_type text not null default 'personal' check (email_type in ('personal', 'work', 'other')),
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  verified_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);
create unique index user_emails_active_email_uq on user_emails (email) where status = 'active';
create unique index user_emails_primary_uq on user_emails (id_user) where is_primary and status = 'active';

-- Login identities; secrets never live on USERS (USR-D08). V1 provider: password (subject = normalized email).
create table auth_identities (
  id_auth_identity uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  provider text not null check (provider in ('password', 'google', 'apple')),
  provider_subject text not null,
  secret_hash text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider <> 'password' or secret_hash is not null)
);
create unique index auth_identities_subject_uq on auth_identities (provider, provider_subject) where status = 'active';
create index auth_identities_user_idx on auth_identities (id_user);

-- Opaque bearer sessions; only the SHA-256 of the token is stored.
create table user_sessions (
  id_user_session uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  user_agent text
);
create index user_sessions_user_idx on user_sessions (id_user);

create table roles (
  id_role uuid primary key default gen_random_uuid(),
  role_code text not null unique,
  role_name text not null,
  description text,
  role_type text not null default 'system' check (role_type in ('system', 'service', 'technical')),
  is_system_role boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table permissions (
  id_permission uuid primary key default gen_random_uuid(),
  permission_code text not null unique check (permission_code ~ '^[a-z_]+\.[a-z_]+$'),
  resource text not null,
  action text not null,
  sub_action text,
  permission_group text,
  description text not null,
  is_sensitive boolean not null default false,
  is_system_permission boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  sort_order int,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users
);

create table role_permissions (
  id_role_permission uuid primary key default gen_random_uuid(),
  id_role uuid not null references roles,
  id_permission uuid not null references permissions,
  status text not null default 'active' check (status in ('active', 'inactive', 'revoked')),
  granted_at timestamptz not null default now(),
  granted_by_user_id uuid references users,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'revoked' or revoked_at is not null)
);
create unique index role_permissions_active_uq on role_permissions (id_role, id_permission) where status = 'active';

create table user_roles (
  id_user_role uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  id_role uuid not null references roles,
  status text not null default 'active' check (status in ('active', 'inactive', 'revoked', 'expired')),
  assigned_at timestamptz not null default now(),
  assigned_by_user_id uuid references users,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references users,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'revoked' or revoked_at is not null)
);
create unique index user_roles_active_uq on user_roles (id_user, id_role) where status = 'active';

-- Inactive/archived roles cannot be newly assigned (ROLE-D08).
create function user_roles_require_active_role() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from roles where id_role = new.id_role and status = 'active') then
    raise exception 'Role is not active' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger user_roles_active_role before insert on user_roles
  for each row execute function user_roles_require_active_role();

create table audit_log (
  id_audit_log uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references users,
  actor_type text not null check (actor_type in ('user', 'system', 'integration', 'job')),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  change_data jsonb,
  reason text,
  source text check (source in ('admin_web', 'mobile_app', 'public_web', 'api', 'system_job', 'integration')),
  request_id text,
  metadata jsonb,
  check (actor_type <> 'user' or actor_user_id is not null)
);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_idx on audit_log (actor_user_id);
create index audit_log_occurred_idx on audit_log (occurred_at);
create index audit_log_request_idx on audit_log (request_id);
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function forbid_change();

create trigger users_no_delete before delete on users for each row execute function forbid_delete();
create trigger roles_no_delete before delete on roles for each row execute function forbid_delete();
create trigger permissions_no_delete before delete on permissions for each row execute function forbid_delete();
create trigger role_permissions_no_delete before delete on role_permissions for each row execute function forbid_delete();
create trigger user_roles_no_delete before delete on user_roles for each row execute function forbid_delete();

select attach_updated_at_triggers();
