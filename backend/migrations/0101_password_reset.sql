-- Password reset links. Like user_sessions this is a supporting table, not one of the documented 48: only the SHA-256 of
-- the one-time token is stored. Numbered after 0100 because it extends the permission reference data.

create table password_reset_tokens (
  id_password_reset_token uuid primary key default gen_random_uuid(),
  id_user uuid not null references users,
  token_hash text not null unique,
  -- email: requested by the person on the login page; admin_link: created by staff and handed over by hand.
  channel text not null check (channel in ('email', 'admin_link')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check (channel <> 'admin_link' or created_by_user_id is not null)
);
create index password_reset_tokens_user_idx on password_reset_tokens (id_user);

insert into permissions (permission_code, resource, action, sub_action, permission_group, description, is_sensitive, is_system_permission, sort_order)
values ('user.reset_password', 'user', 'reset', 'password', 'User Management', 'Create a password reset link for another user.', true, true, 75);

insert into role_permissions (id_role, id_permission, notes)
select r.id_role, p.id_permission, 'Password reset links'
from roles r join permissions p on p.permission_code = 'user.reset_password'
where r.role_code in ('FIKIRHANE_ADMIN', 'TECH_ADMIN');
