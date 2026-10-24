-- "Tur planla": someone asks to visit before joining. The request waits for staff in the host shell (Turlar), who get in
-- touch to agree on a time. Not one of the 48 documented tables; see docs/backend-decisions.md (C-15).
create table tour_requests (
  id_tour_request uuid primary key default gen_random_uuid(),
  first_name text not null check (length(first_name) between 1 and 60),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  preferred_date date not null,
  preferred_slot text not null check (preferred_slot in ('morning', 'afternoon')),
  interests text[] not null default '{}' check (interests <@ array['coworking', 'meeting_room', 'event_space', 'clubs']::text[]),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'visited', 'cancelled')),
  staff_note text check (staff_note is null or length(staff_note) <= 1000),
  id_user uuid references users,
  handled_by_user_id uuid references users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tour_requests_contact_required check (contact_email is not null or contact_phone is not null)
);
create index tour_requests_open_idx on tour_requests (preferred_date) where status in ('new', 'contacted', 'scheduled');

insert into permissions (permission_code, resource, action, sub_action, permission_group, description, is_sensitive, is_system_permission, sort_order) values
  ('tour.view', 'tour', 'view', null, 'Membership', 'See visit requests (Tur planla) with the visitor''s contact details.', true, true, 80),
  ('tour.manage', 'tour', 'manage', null, 'Membership', 'Update the status of visit requests.', false, true, 81);

insert into role_permissions (id_role, id_permission, notes)
select r.id_role, p.id_permission, 'Visit requests (0110)'
from (values ('FIKIRHANE_ADMIN', array['tour.view', 'tour.manage']), ('MARKETING', array['tour.view', 'tour.manage'])) as g(role_code, codes)
join roles r using (role_code)
join permissions p on p.permission_code = any (g.codes);

select attach_updated_at_triggers();
