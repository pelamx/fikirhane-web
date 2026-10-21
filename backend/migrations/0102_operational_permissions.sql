-- Operational permissions the ROLES.md bundles left with no holder. Without them no one could post a document, post or
-- reverse a payment, define an item, or approve a stock count. Assignment follows each role's described job; exception
-- rights (negative stock, limit overrides, sensitive personal data, pricing rules) stay unassigned on purpose.
-- Supersedes decision C-08. Confirm with the business; TECH_ADMIN can change bundles in the admin shell (role.update).
insert into role_permissions (id_role, id_permission, notes)
select r.id_role, p.id_permission, 'Operational bundle (0102)'
from (values
  ('ACCOUNTING', array['document.post', 'document.cancel', 'transaction.post', 'transaction.reverse',
                       'account.create', 'account.update', 'account.close', 'financial_center.update', 'financial_category.update']),
  ('KITCHEN_STAFF', array['item.create', 'item.update', 'item.archive', 'stock_count.complete']),
  ('FIKIRHANE_ADMIN', array['stock.adjust', 'stock_count.approve', 'stock_count.post']),
  ('MARKETING', array['acquisition.update'])
) as b(role_code, codes)
cross join lateral unnest(b.codes) as c(code)
join roles r on r.role_code = b.role_code
join permissions p on p.permission_code = c.code
where not exists (select 1 from role_permissions x where x.id_role = r.id_role and x.id_permission = p.id_permission and x.status = 'active');
