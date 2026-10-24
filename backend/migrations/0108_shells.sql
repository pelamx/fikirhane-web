-- The site has four shells: visitor (everyone), member (signed in), host (daily operations) and admin (the back office).
-- Opening the host and admin shells is itself a permission, so who gets which shell is managed per role in Rol yetkileri.
-- Club leads and event hosts also reach the host shell without these permissions, scoped to their own clubs and events.

insert into permissions (permission_code, resource, action, sub_action, permission_group, description, is_sensitive, is_system_permission, sort_order) values
  ('shell.host', 'shell', 'host', null, 'System Administration', 'Open the host shell: daily operations, door check, program, applications and own work records.', false, true, 5),
  ('shell.admin', 'shell', 'admin', null, 'System Administration', 'Open the admin shell: every table and relation the role may see, roles and permissions, system settings.', true, true, 6);

insert into role_permissions (id_role, id_permission, notes)
select r.id_role, p.id_permission, 'Shell access (0108)'
from (values
  ('FIKIRHANE_ADMIN', array['shell.host', 'shell.admin']),
  ('KITCHEN_STAFF', array['shell.host']),
  ('ACCOUNTING', array['shell.host']),
  ('MARKETING', array['shell.host']),
  ('TECH_ADMIN', array['shell.admin'])
) as g(role_code, codes)
join roles r using (role_code)
join permissions p on p.permission_code = any (g.codes);
