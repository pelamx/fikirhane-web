-- "İletişim" (iletisim/): anyone can write to the team. The message waits for staff in the host shell (İletişim
-- mesajları), who answer by e-mail or phone and mark it. Not one of the 48 documented tables; see docs/backend-decisions.md (C-19).
create table contact_messages (
  id_contact_message uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 1 and 120),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  topic text not null default 'general' check (topic in ('general', 'membership', 'meeting_room', 'event_space', 'partnership')),
  message text not null check (length(message) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  staff_note text check (staff_note is null or length(staff_note) <= 1000),
  id_user uuid references users,
  handled_by_user_id uuid references users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_messages_contact_required check (contact_email is not null or contact_phone is not null)
);
create index contact_messages_open_idx on contact_messages (created_at) where status = 'new';

insert into permissions (permission_code, resource, action, sub_action, permission_group, description, is_sensitive, is_system_permission, sort_order) values
  ('contact.view', 'contact', 'view', null, 'Membership', 'See messages sent from the İletişim page with the sender''s contact details.', true, true, 82),
  ('contact.manage', 'contact', 'manage', null, 'Membership', 'Mark messages from the İletişim page as answered or closed.', false, true, 83);

insert into role_permissions (id_role, id_permission, notes)
select r.id_role, p.id_permission, 'Contact messages (0117)'
from (values ('FIKIRHANE_ADMIN', array['contact.view', 'contact.manage']), ('MARKETING', array['contact.view', 'contact.manage'])) as g(role_code, codes)
join roles r using (role_code)
join permissions p on p.permission_code = any (g.codes);

select attach_updated_at_triggers();
