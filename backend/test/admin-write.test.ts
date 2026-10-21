import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { grantRole, registered, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

/** A role holding exactly these permissions, for flows no seeded role covers yet (e.g. posting documents). */
async function withPermissions(codes: string[]) {
  const u = await registered(env);
  const code = `TEST_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await env.sql`insert into roles (role_code, role_name) values (${code}, ${code})`;
  await env.sql`insert into role_permissions (id_role, id_permission)
    select r.id_role, p.id_permission from roles r, permissions p where r.role_code = ${code} and p.permission_code = any(${codes})`;
  await grantRole(env.sql, u.userId, code);
  return u;
}
const id = async (q: Promise<{ id: string }[]>) => (await q)[0].id;

describe('admin writes', () => {
  test('create and edit follow the table rules: permissions, value lists, fixed fields, audit', async () => {
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const plain = await registered(env);
    const fc = await id(env.sql`select id_financial_center::text as id from financial_centers where center_code = 'GENERAL'`);
    const values = { club_code: 'TEST_CLUB', club_name: 'Deneme Kulübü', club_type: 'social', id_financial_center: fc };

    assert.equal((await plain.client.post('/api/admin/data/clubs', { values })).status, 403);
    const badType = await admin.client.post('/api/admin/data/clubs', { values: { ...values, club_type: 'nope' } });
    assert.equal(badType.status, 400);
    assert.equal(badType.json.error.details[0].path, 'club_type');
    const missing = await admin.client.post('/api/admin/data/clubs', { values: { club_name: 'Eksik' } });
    assert.deepEqual(missing.json.error.details.map((d: { path: string }) => d.path).sort(), ['club_code', 'id_financial_center']);

    const created = await admin.client.post('/api/admin/data/clubs', { values });
    assert.equal(created.status, 201);
    const clubId = created.json.id;
    assert.equal((await admin.client.patch(`/api/admin/data/clubs/${clubId}`, { values: { club_code: 'OTHER' } })).status, 400, 'code is fixed');
    const renamed = await admin.client.patch(`/api/admin/data/clubs/${clubId}`, { values: { club_name: 'Yeni Ad' } });
    assert.deepEqual(renamed.json.changed, ['club_name']);
    const [entry] = await env.sql`select change_data, actor_user_id from audit_log where action = 'clubs.update' and entity_id = ${clubId}`;
    assert.deepEqual(entry.change_data, { club_name: { old: 'Deneme Kulübü', new: 'Yeni Ad' } });
    assert.equal(entry.actor_user_id, admin.userId);

    // Workflow tables are not written through generic forms; ledgers are never edited.
    assert.equal((await admin.client.post('/api/admin/data/bookings', { values: {} })).json.error.code, 'not_editable');
    assert.equal((await admin.client.patch(`/api/admin/data/sponsorship_usage/${clubId}`, { values: { notes: 'x' } })).json.error.code, 'not_editable');
    const schema = (await admin.client.get('/api/admin/schema')).json.tables;
    const clubs = schema.find((t: { name: string }) => t.name === 'clubs');
    assert.equal(clubs.write.can_create, true);
    assert.ok(!clubs.write.update_columns.includes('club_code'));
    assert.ok(clubs.write.purpose, 'purpose text from the table document');
  });

  test('documents: lines compute their amounts, posting numbers and locks the document; payments move balances', async () => {
    const fin = await withPermissions(['document.view', 'document.create', 'document.update', 'document.post', 'transaction.view',
      'transaction.create', 'transaction.post', 'transaction.reverse', 'account.view', 'item.view']);
    const doc = await fin.client.post('/api/admin/data/documents', { values: { direction: 'sale', document_type: 'invoice', currency_code: 'TRY' } });
    assert.equal(doc.status, 201);
    const docId = doc.json.id;
    const item = await id(env.sql`select id_item::text as id from items where item_code = 'WORKSPACE_SESSION'`);
    const fc = await id(env.sql`select id_financial_center::text as id from financial_centers where center_code = 'WORKING_CLUB'`);
    const line = await fin.client.post('/api/admin/data/document_items', { values: {
      id_document: docId, id_item: item, id_financial_center: fc, quantity: '2', unit_price: '500', tax_rate: '20' } });
    assert.equal(line.status, 201, JSON.stringify(line.json));
    assert.equal(line.json.row.line_total, '1200.00');
    assert.equal(line.json.row.description, 'Community Workspace Session', 'description defaults from the item');
    let [d] = await env.sql`select grand_total, document_number from documents where id_document = ${docId}`;
    assert.equal(d.grand_total, '1200.00');

    const posted = await fin.client.post(`/api/admin/data/documents/${docId}/actions/post`, {});
    assert.equal(posted.status, 200, JSON.stringify(posted.json));
    [d] = await env.sql`select status, document_number, posted_at from documents where id_document = ${docId}`;
    assert.equal(d.status, 'posted');
    assert.match(d.document_number, /^SA-\d{4}-\d{5}$/);
    const locked = await fin.client.patch(`/api/admin/data/document_items/${line.json.id}`, { values: { quantity: '3' } });
    assert.equal(locked.json.error.code, 'rule_violation');

    const bank = await id(env.sql`select id_account::text as id from accounts where account_code = 'BANK_TRY'`);
    const [{ current_balance: start }] = await env.sql`select coalesce(current_balance, opening_balance) as current_balance from accounts where id_account = ${bank}`;
    const pay = await fin.client.post('/api/admin/data/transactions', { values: { transaction_type: 'collection', to_account_id: bank, amount: '1200', currency_code: 'TRY', payment_method: 'bank_transfer' } });
    assert.equal(pay.status, 201, JSON.stringify(pay.json));
    await fin.client.post(`/api/admin/data/transactions/${pay.json.id}/actions/post`, {});
    const [{ current_balance: afterPost }] = await env.sql`select current_balance from accounts where id_account = ${bank}`;
    assert.equal(Number(afterPost) - Number(start), 1200);
    const alloc = await fin.client.post('/api/admin/data/transaction_allocations', { values: { id_transaction: pay.json.id, id_document: docId, allocated_amount: '1200' } });
    assert.equal(alloc.status, 201, JSON.stringify(alloc.json));
    assert.equal((await fin.client.post(`/api/admin/data/transactions/${pay.json.id}/actions/reverse`, {})).json.error.code, 'reason_required');
    assert.equal((await fin.client.post(`/api/admin/data/transactions/${pay.json.id}/actions/reverse`, { reason: 'Yanlış hesap' })).status, 200);
    const [a] = await env.sql`select status from transaction_allocations where id_transaction_allocation = ${alloc.json.id}`;
    assert.equal(a.status, 'reversed', 'reversing a payment reverses its allocations');
    const [{ current_balance: afterReverse }] = await env.sql`select current_balance from accounts where id_account = ${bank}`;
    assert.equal(Number(afterReverse), Number(start));
  });

  test('stock: the sign follows the movement type, mistakes are reversed by a counter-movement once', async () => {
    const kitchen = await registered(env);
    await grantRole(env.sql, kitchen.userId, 'KITCHEN_STAFF');
    const [item] = await env.sql`insert into items (item_code, item_name, item_type, unit, is_stock_tracked) values ('TEST_WATER', 'Su', 'stock_item', 'piece', true) returning id_item::text as id`;
    const used = await kitchen.client.post('/api/admin/data/stock_movements', { values: { id_item: item.id, movement_type: 'consumption', quantity: '3' } });
    assert.equal(used.status, 201, JSON.stringify(used.json));
    assert.equal(used.json.row.quantity, '-3.000');
    assert.equal((await kitchen.client.post('/api/admin/data/stock_movements', { values: { id_item: item.id, movement_type: 'manual_adjustment', quantity: '1', reason_code: 'other' } })).status, 403, 'adjustments need stock.adjust');
    const fixer = await withPermissions(['stock.view', 'item.view', 'stock.adjust']);
    const rev = await fixer.client.post(`/api/admin/data/stock_movements/${used.json.id}/actions/reverse`, { reason: 'Yanlış girildi' });
    assert.equal(rev.status, 200, JSON.stringify(rev.json));
    const [{ current_stock }] = await env.sql`select current_stock from items where id_item = ${item.id}`;
    assert.equal(Number(current_stock), 0);
    assert.equal((await fixer.client.post(`/api/admin/data/stock_movements/${used.json.id}/actions/reverse`, { reason: 'Tekrar' })).json.error.code, 'invalid_transition');
  });

  test('suspending an account signs it out', async () => {
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const member = await registered(env);
    const res = await admin.client.post(`/api/admin/data/users/${member.userId}/actions/suspend`, { reason: 'Kural ihlali' });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal((await member.client.get('/api/me')).status, 401);
    assert.equal((await admin.client.post(`/api/admin/data/users/${member.userId}/actions/reactivate`, {})).status, 200);
  });
});
