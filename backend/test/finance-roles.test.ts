import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { csv } from '../src/services/reports.ts';
import { giveMembership, grantRole, registered, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

async function withRole(role: string) {
  const u = await registered(env);
  await grantRole(env.sql, u.userId, role);
  return u;
}
/** A role holding exactly these permissions. */
async function withPermissions(codes: string[]) {
  const u = await registered(env);
  const code = `TEST_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await env.sql`insert into roles (role_code, role_name) values (${code}, ${code})`;
  await env.sql`insert into role_permissions (id_role, id_permission)
    select r.id_role, p.id_permission from roles r, permissions p where r.role_code = ${code} and p.permission_code = any(${codes})`;
  await grantRole(env.sql, u.userId, code);
  return u;
}
const one = async <T>(q: Promise<T[]>) => (await q)[0];

describe('cancel and archive go through their own permission', () => {
  test('a membership is cancelled with membership.cancel and a reason; editing the status is refused', async () => {
    const member = await registered(env);
    await giveMembership(env.sql, member.userId, 'MEMBER');
    const { id } = await one(env.sql<{ id: string }[]>`select id_user_membership::text as id from user_memberships where id_user = ${member.userId} and status = 'active'`);
    const editor = await withPermissions(['membership.view', 'membership.update']);
    assert.equal((await editor.client.patch(`/api/admin/data/user_memberships/${id}`, { values: { status: 'cancelled' } })).json.error.code, 'use_action');
    assert.equal((await editor.client.post(`/api/admin/data/user_memberships/${id}/actions/cancel`, { reason: 'Talep üzerine' })).status, 403);

    const admin = await withRole('FIKIRHANE_ADMIN');
    assert.equal((await admin.client.post(`/api/admin/data/user_memberships/${id}/actions/cancel`, {})).json.error.code, 'reason_required');
    const done = await admin.client.post(`/api/admin/data/user_memberships/${id}/actions/cancel`, { reason: 'Talep üzerine' });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    const row = await one(env.sql`select status, cancelled_at, cancelled_by_user_id::text, cancellation_reason from user_memberships where id_user_membership = ${id}`);
    assert.equal(row.status, 'cancelled');
    assert.ok(row.cancelled_at);
    assert.equal(row.cancelled_by_user_id, admin.userId);
    assert.equal(row.cancellation_reason, 'Talep üzerine');
  });

  test('clubs, organizations and campaigns are archived with their archive permission', async () => {
    const admin = await withRole('FIKIRHANE_ADMIN');
    const fc = await one(env.sql<{ id: string }[]>`select id_financial_center::text as id from financial_centers where center_code = 'GENERAL'`);
    const club = (await admin.client.post('/api/admin/data/clubs', { values: { club_code: 'ARCHIVE_ME', club_name: 'Arşiv', club_type: 'social', id_financial_center: fc.id } })).json.id;
    const editor = await withPermissions(['club.view', 'club.update', 'club_members.view']);
    assert.equal((await editor.client.patch(`/api/admin/data/clubs/${club}`, { values: { status: 'archived' } })).json.error.code, 'use_action');
    assert.equal((await editor.client.post(`/api/admin/data/clubs/${club}/actions/archive`, {})).status, 403);
    assert.equal((await admin.client.post(`/api/admin/data/clubs/${club}/actions/archive`, {})).status, 200);
    assert.equal((await one(env.sql`select status from clubs where id_club = ${club}`)).status, 'archived');

    const org = (await admin.client.post('/api/admin/data/organizations', { values: { organization_name: 'Arşiv A.Ş.', organization_type: 'company' } }));
    assert.equal(org.status, 201, JSON.stringify(org.json));
    assert.equal((await admin.client.post(`/api/admin/data/organizations/${org.json.id}/actions/archive`, {})).status, 200);

    const marketer = await withRole('MARKETING');
    const camp = await marketer.client.post('/api/admin/data/campaigns', { values: { campaign_code: 'ARCHIVE_CAMP', campaign_name: 'Arşiv kampanyası', campaign_type: 'referral' } });
    assert.equal(camp.status, 201, JSON.stringify(camp.json));
    assert.equal((await admin.client.post(`/api/admin/data/campaigns/${camp.json.id}/actions/archive`, {})).json.error.code, 'invalid_transition', 'only completed or cancelled campaigns');
    await env.sql`update campaigns set status = 'completed' where id_campaign = ${camp.json.id}`;
    assert.equal((await marketer.client.post(`/api/admin/data/campaigns/${camp.json.id}/actions/archive`, {})).status, 403, 'marketing has no campaign.archive');
    assert.equal((await admin.client.post(`/api/admin/data/campaigns/${camp.json.id}/actions/archive`, {})).status, 200);
  });
});

describe('cafeteria counter', () => {
  test('a sale posts a receipt, takes the stock out, collects the money and allocates it', async () => {
    const kitchen = await withRole('KITCHEN_STAFF');
    assert.equal((await (await withRole('MARKETING')).client.get('/api/host/cafeteria')).status, 403);
    const counter = (await kitchen.client.get('/api/host/cafeteria')).json;
    const water = counter.items.find((i: { item_code: string }) => i.item_code === 'WATER_500ML');
    assert.ok(water, 'sellable cafeteria items are on the counter');
    assert.ok(!counter.items.some((i: { item_code: string }) => i.item_code === 'COFFEE_BEANS'), 'ingredients are not sold');
    assert.equal(counter.payment.cash, 'Fikirhane Cash');

    const cash = await one(env.sql<{ id: string; balance: string }[]>`select id_account::text as id, coalesce(current_balance, opening_balance)::text as balance from accounts where account_code = 'CASH_TRY'`);
    const sale = await kitchen.client.post('/api/host/cafeteria/sales', { payment_method: 'cash', lines: [{ id_item: water.id_item, quantity: 2 }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.json));
    assert.match(sale.json.document_number, /^SA-\d{4}-\d{5}$/);
    assert.equal(sale.json.grand_total, '44.00', '2 × 20 + 10% tax');

    const doc = await one(env.sql`select status, document_type, grand_total::text from documents where id_document = ${sale.json.id_document}`);
    assert.deepEqual({ ...doc }, { status: 'posted', document_type: 'receipt', grand_total: '44.00' });
    const stock = await one(env.sql`select sum(m.quantity)::text as q from stock_movements m join document_items l using (id_document_item) where l.id_document = ${sale.json.id_document}`);
    assert.equal(Number(stock.q), -2);
    const paid = await one(env.sql`select t.status, t.payment_method, a.allocated_amount::text from transaction_allocations a join transactions t using (id_transaction) where a.id_document = ${sale.json.id_document}`);
    assert.deepEqual({ ...paid }, { status: 'posted', payment_method: 'cash', allocated_amount: '44.00' });
    const after = await one(env.sql<{ balance: string }[]>`select current_balance::text as balance from accounts where id_account = ${cash.id}`);
    assert.equal(Number(after.balance) - Number(cash.balance), 44);
    assert.equal((await kitchen.client.get('/api/host/cafeteria')).json.today[0].document_number, sale.json.document_number);

    const card = await kitchen.client.post('/api/host/cafeteria/sales', { payment_method: 'card', lines: [{ id_item: water.id_item, quantity: 1 }] });
    assert.equal(card.json.account, 'Bank Account TRY (demo)', 'cards land in the bank account when there is no POS account');
    const beans = await one(env.sql<{ id: string }[]>`select id_item::text as id from items where item_code = 'COFFEE_BEANS'`);
    assert.equal((await kitchen.client.post('/api/host/cafeteria/sales', { payment_method: 'cash', lines: [{ id_item: beans.id, quantity: 1 }] })).status, 400);
  });

  test('posting a purchase brings stock in; cancelling it takes the movement back', async () => {
    const fin = await withPermissions(['document.view', 'document.create', 'document.update', 'document.post', 'document.cancel', 'item.view']);
    const beans = await one(env.sql<{ id: string; stock: string }[]>`select id_item::text as id, coalesce(current_stock, 0)::text as stock from items where item_code = 'COFFEE_BEANS'`);
    const doc = (await fin.client.post('/api/admin/data/documents', { values: { direction: 'purchase', document_type: 'invoice', currency_code: 'TRY' } })).json.id;
    const line = await fin.client.post('/api/admin/data/document_items', { values: { id_document: doc, id_item: beans.id, quantity: '3', unit_price: '400' } });
    assert.equal(line.status, 201, JSON.stringify(line.json));
    assert.equal((await fin.client.post(`/api/admin/data/documents/${doc}/actions/post`, {})).status, 200);
    const stock = async () => Number((await one(env.sql`select current_stock::text as s from items where id_item = ${beans.id}`)).s);
    assert.equal(await stock(), Number(beans.stock) + 3);
    assert.equal((await fin.client.post(`/api/admin/data/documents/${doc}/actions/cancel`, { reason: 'Yanlış fatura' })).status, 200);
    assert.equal(await stock(), Number(beans.stock));
    assert.equal((await one(env.sql`select cancellation_reason from documents where id_document = ${doc}`)).cancellation_reason, 'Yanlış fatura');
  });
});

describe('finance reports, exports, balances and reconciliation', () => {
  test('reports need report.view, balances need account_balance.view, downloads need their export permission', async () => {
    const accounting = await withRole('ACCOUNTING');
    const admin = await withRole('FIKIRHANE_ADMIN');
    const marketer = await withRole('MARKETING');
    assert.equal((await marketer.client.get('/api/admin/reports/finance')).status, 403);

    const full = (await accounting.client.get('/api/admin/reports/finance')).json;
    assert.ok(Array.isArray(full.balances), 'accounting sees balances');
    assert.ok(full.centers.some((c: { name: string }) => c.name === 'Cafeteria'), 'cafeteria sales count as income');
    const partial = (await admin.client.get('/api/admin/reports/finance')).json;
    assert.equal(partial.balances, undefined, 'the business admin reads the report without balances');
    assert.equal((await accounting.client.get('/api/admin/reports/finance?from=2026-05-01&to=2026-04-01')).status, 400);

    const report = await accounting.client.get('/api/admin/reports/finance.csv');
    assert.equal(report.status, 200);
    assert.match(report.headers.get('content-type') ?? '', /text\/csv/);
    assert.ok(report.json.startsWith('Bölüm'), 'a Turkish header');
    assert.equal((await admin.client.get('/api/admin/reports/finance.csv')).status, 403);
    const docs = await accounting.client.get('/api/admin/export/documents.csv');
    assert.match(docs.json, /Kafeterya satışı/);
    assert.match(docs.json.split('\r\n')[0], /^Tarih;Belge no;Yön/);
    assert.equal((await accounting.client.get('/api/admin/export/transactions.csv')).status, 200);
    assert.equal((await admin.client.get('/api/admin/export/transactions.csv')).status, 403);
  });

  test('CSV opens cleanly in Turkish Excel: BOM, semicolons, comma decimals, quoted text', () => {
    assert.equal(csv(['Ad', 'Tutar'], [['Su; 500 ml', '44.50'], ['"Kahve"', 3.5]]), '\uFEFFAd;Tutar\r\n"Su; 500 ml";44,50\r\n"""Kahve""";3,5\r\n');
  });

  test('an account balance is masked without account_balance.view', async () => {
    const admin = await withRole('FIKIRHANE_ADMIN');
    const accounting = await withRole('ACCOUNTING');
    const masked = (await admin.client.get('/api/admin/data/accounts?account_code=CASH_TRY')).json.items[0];
    assert.equal(masked.current_balance, '•••');
    const shown = (await accounting.client.get('/api/admin/data/accounts?account_code=CASH_TRY')).json.items[0];
    assert.match(String(shown.current_balance), /^\d+(\.\d+)?$/);
    assert.equal((await admin.client.get('/api/admin/data/accounts?current_balance=0')).status, 403, 'no filtering on a hidden value');
  });

  test('a posted movement is reconciled and un-reconciled with account.reconcile', async () => {
    const accounting = await withRole('ACCOUNTING');
    const bank = await one(env.sql<{ id: string }[]>`select id_account::text as id from accounts where account_code = 'BANK_TRY'`);
    const t = (await accounting.client.post('/api/admin/data/transactions', { values: { transaction_type: 'collection', to_account_id: bank.id, amount: '75', currency_code: 'TRY', payment_method: 'bank_transfer' } })).json.id;
    assert.equal((await accounting.client.post(`/api/admin/data/transactions/${t}/actions/reconcile`, {})).json.error.code, 'invalid_transition', 'pending cannot be reconciled');
    await accounting.client.post(`/api/admin/data/transactions/${t}/actions/post`, {});
    assert.equal((await (await withRole('FIKIRHANE_ADMIN')).client.post(`/api/admin/data/transactions/${t}/actions/reconcile`, {})).status, 403);
    assert.equal((await accounting.client.post(`/api/admin/data/transactions/${t}/actions/reconcile`, {})).status, 200);
    let row = await one(env.sql`select reconciliation_status, reconciled_at, reconciled_by_user_id::text from transactions where id_transaction = ${t}`);
    assert.equal(row.reconciliation_status, 'reconciled');
    assert.equal(row.reconciled_by_user_id, accounting.userId);
    const balances = (await accounting.client.get('/api/admin/reports/finance')).json.balances;
    assert.ok(balances.some((b: { name: string; reconciled: string }) => b.name === 'Bank Account TRY (demo)' && Number(b.reconciled) >= 75));
    assert.equal((await accounting.client.post(`/api/admin/data/transactions/${t}/actions/unreconcile`, {})).status, 200);
    row = await one(env.sql`select reconciliation_status, reconciled_at from transactions where id_transaction = ${t}`);
    assert.deepEqual({ ...row }, { reconciliation_status: 'unreconciled', reconciled_at: null });
  });
});

describe('permission lists', () => {
  test('say which rights are not tied to a feature and which every signed-in account has', async () => {
    const tech = await withRole('TECH_ADMIN');
    const list = (await tech.client.get('/api/admin/data/permissions?limit=200')).json;
    const byCode = Object.fromEntries(list.items.map((p: { permission_code: string; id_permission: string }) => [p.permission_code, list.wiring[p.id_permission] ?? null]));
    assert.equal(byCode['integration.manage'], 'unwired');
    assert.equal(byCode['booking.create'], 'signed_in');
    assert.equal(byCode['cafeteria_sale.create'], null);
    const rp = (await tech.client.get('/api/admin/data/role_permissions?limit=200')).json;
    assert.ok(Object.values(rp.wiring).includes('signed_in'));
  });
});
