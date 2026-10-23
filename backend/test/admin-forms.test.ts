import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { makeEvent, registered, setup, type Client, type TestEnv } from './helpers.ts';

let env: TestEnv;
let admin: Client;
before(async () => {
  env = await setup();
  const u = await registered(env);
  await env.sql`insert into roles (role_code, role_name) values ('FORMS_ALL', 'FORMS_ALL')`;
  await env.sql`insert into role_permissions (id_role, id_permission) select r.id_role, p.id_permission from roles r, permissions p where r.role_code = 'FORMS_ALL'`;
  await env.sql`insert into user_roles (id_user, id_role) select ${u.userId}, id_role from roles where role_code = 'FORMS_ALL'`;
  admin = u.client;
});
after(async () => { await env?.stop(); });

interface Col { name: string; type: string; nullable: boolean; hasDefault: boolean; ref: { table: string } | null; options: string[] | null; pattern: string | null }
interface Table {
  name: string; pk: string; columns: Col[];
  write: { can_create: boolean; create_columns: string[]; required: string[]; dependent_options: Record<string, { on: string; options: Record<string, string[]> }>;
    conditional: { on: string; cases: Record<string, { hide?: string[]; require?: string[] }> } | null };
}

const later = /^end_|_until$|^expires_at$/;
const sample = (t: Table, c: Col, n: number): unknown => {
  if (c.name === 'currency_code') return 'TRY';
  if (c.options) return c.options.includes('active') ? 'active' : c.options[0];
  if (/int/.test(c.type)) return 1;
  if (/numeric|double|real/.test(c.type)) return '1';
  if (c.type === 'boolean') return false;
  if (c.type === 'date') return later.test(c.name) ? '2030-12-31' : '2030-01-01';
  if (/timestamp/.test(c.type)) return later.test(c.name) ? '2030-01-02T12:00:00Z' : '2030-01-01T10:00:00Z';
  if (/json/.test(c.type)) return {};
  if (/(^|_)email$/.test(c.name)) return `form${n}@example.com`;
  const letters = n.toString(26).split('').map(d => String.fromCharCode(65 + parseInt(d, 26))).join('');
  const candidates = [`FORM_${t.name.toUpperCase()}_${letters}`, `form_${t.name}.view`, `Form ${t.name} ${n}`];
  return candidates.find(v => !c.pattern || new RegExp(c.pattern).test(v)) ?? candidates[0];
};

describe('admin forms', () => {
  test('every table with a "new record" form saves a record built only from what the form offers', async () => {
    const schema: Table[] = (await admin.get('/api/admin/schema')).json.tables;
    const forms = schema.filter(t => t.write.can_create);
    assert.ok(forms.length >= 39, `expected the admin to reach every form, got ${forms.length}`);
    // Parents before children, so a line points at the document this test just created (as an admin would).
    const order: Table[] = [];
    const visit = (t: Table, seen = new Set<string>()) => {
      if (order.includes(t) || seen.has(t.name)) return;
      seen.add(t.name);
      for (const c of t.columns) if (c.ref && t.write.create_columns.includes(c.name)) { const p = forms.find(f => f.name === c.ref!.table); if (p) visit(p, seen); }
      order.push(t);
    };
    forms.forEach(t => visit(t));

    const created = new Map<string, string>();
    const sql = env.sql;
    const one = async (q: Promise<{ id: string }[]>) => (await q)[0]?.id;
    // Choices an admin would make where the newest record is not the sensible one.
    const pickRef: Record<string, () => Promise<string | undefined>> = {
      'club_users.id_club': () => one(sql`select id_club::text as id from clubs where status = 'active' order by club_code limit 1`),
      'stock_movements.id_item': () => one(sql`select id_item::text as id from items where item_code = 'WATER_500ML'`),
      'event_options.id_location': () => one(sql`select id_location::text as id from space_setups where setup_code = 'ATOLYE_COWORK_V1'`),
      'event_options.id_space_setup': () => one(sql`select id_space_setup::text as id from space_setups where setup_code = 'ATOLYE_COWORK_V1'`),
    };
    // One-of rules the form cannot mark as required: an invitation needs someone to invite.
    const extra: Record<string, Record<string, unknown>> = { invitations: { guest_email: 'davetli@example.com' } };
    const failures: string[] = [];
    let n = 0;
    for (const t of order) {
      if (t.name === 'transaction_allocations') {
        // Only posted documents and payments can be matched, so post the ones made above first.
        for (const [table, id] of [['documents', created.get('documents')], ['transactions', created.get('transactions')]]) {
          const r = await admin.post(`/api/admin/data/${table}/${id}/actions/post`, {});
          assert.equal(r.status, 200, `post ${table}: ${JSON.stringify(r.json)}`);
        }
      }
      const values: Record<string, unknown> = {};
      const rule = t.write.conditional;
      const typeCol = rule ? t.columns.find(c => c.name === rule.on) : null;
      const kind = typeCol ? String(sample(t, typeCol, ++n)) : '';
      for (const name of t.write.create_columns) {
        const c = t.columns.find(x => x.name === name)!;
        const needed = (!c.nullable && !c.hasDefault) || t.write.required.includes(name) || !!rule?.cases[kind]?.require?.includes(name);
        if (!needed || rule?.cases[kind]?.hide?.includes(name)) continue;
        const dep = t.write.dependent_options[name];
        if (dep) { values[name] = dep.options[String(values[dep.on])]?.[0]; continue; }
        if (c.ref) {
          values[name] = await (pickRef[`${t.name}.${name}`]?.() ?? created.get(c.ref.table)
            ?? (await admin.get(`/api/admin/data/${c.ref.table}?limit=1`)).json.items[0]?.[schema.find(s => s.name === c.ref!.table)!.pk]);
          continue;
        }
        values[name] = c.name === rule?.on ? kind : sample(t, c, ++n);
      }
      Object.assign(values, extra[t.name]);
      const res = await admin.post(`/api/admin/data/${t.name}`, { values });
      if (res.status === 201) created.set(t.name, res.json.id);
      else failures.push(`${t.name}: ${res.status} ${JSON.stringify(res.json?.error)} ← ${JSON.stringify(values)}`);
    }
    assert.deepEqual(failures, []);
  });

  test('freepasses and invitations get a generated code; a freepass from the form can be redeemed', async () => {
    const fp = await admin.post('/api/admin/data/freepasses', { values: {
      freepass_type: 'trial', valid_from: new Date(Date.now() - 3600_000).toISOString(), valid_until: new Date(Date.now() + 10 * 86400_000).toISOString(), usage_limit: 1 } });
    assert.equal(fp.status, 201, JSON.stringify(fp.json));
    assert.match(fp.json.row.freepass_code, /^[A-HJ-NP-Z2-9]{10}$/);
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 50 });
    const guest = await registered(env);
    const booking = await guest.client.post('/api/bookings', { event_id: eventId, freepass_code: fp.json.row.freepass_code.toLowerCase() });
    assert.equal(booking.status, 201, JSON.stringify(booking.json));
    assert.equal(booking.json.booking.final_price, '0.00');

    const inv = await admin.post('/api/admin/data/invitations', { values: { invitation_type: 'general', guest_email: '  Misafir@Example.com ' } });
    assert.equal(inv.status, 201, JSON.stringify(inv.json));
    assert.match(inv.json.row.invitation_code, /^[A-HJ-NP-Z2-9]{10}$/);
    assert.equal(inv.json.row.guest_email, 'misafir@example.com', 'e-mail is stored the way the database requires');
    const [row] = await env.sql`select invited_by_user_id from invitations where id_invitation = ${inv.json.id}`;
    assert.ok(row.invited_by_user_id, 'staff issuing an invitation are its inviter');
    assert.equal((await admin.post(`/api/admin/data/invitations/${inv.json.id}/actions/send`, {})).status, 200);
    const accepted = await admin.patch(`/api/admin/data/invitations/${inv.json.id}`, { values: { status: 'accepted' } });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
    const [stamped] = await env.sql`select sent_at, accepted_at from invitations where id_invitation = ${inv.json.id}`;
    assert.ok(stamped.sent_at && stamped.accepted_at, 'status changes stamp their time');
    assert.equal((await admin.patch(`/api/admin/data/invitations/${inv.json.id}`, { values: { status: 'cancelled' } })).json.error.code, 'invalid_transition');
    const noOne = await admin.post('/api/admin/data/invitations', { values: { invitation_type: 'general' } });
    assert.equal(noOne.json.error.details[0].path, 'invited_user_id');
  });

  test('broken rules name the field and say what is wrong in Turkish', async () => {
    const event = await admin.post('/api/admin/data/events', { values: {
      event_type: 'meetup', event_title: 'Ters', start_datetime: '2030-01-01T12:00:00Z', end_datetime: '2030-01-01T10:00:00Z' } });
    assert.equal(event.status, 422);
    assert.deepEqual(event.json.error.details.map((d: { path: string }) => d.path), ['end_datetime']);
    assert.match(event.json.error.message, /Bitiş/);

    const group = await admin.post('/api/admin/data/financial_categories', { values: {
      category_code: 'WRONG_GROUP', category_name: 'x', direction: 'income', category_group: 'marketing' } });
    assert.equal(group.json.error.details[0].path, 'category_group');
    const schema: Table[] = (await admin.get('/api/admin/schema')).json.tables;
    const fc = schema.find(t => t.name === 'financial_categories')!;
    assert.deepEqual(fc.write.dependent_options.category_group.options.expense.includes('marketing'), true);

    const bank = (await env.sql`select id_account::text as id from accounts where account_code = 'BANK_TRY'`)[0].id;
    const both = await admin.post('/api/admin/data/transactions', { values: {
      transaction_type: 'collection', from_account_id: bank, to_account_id: null, amount: '5', currency_code: 'TRY' } });
    assert.deepEqual(both.json.error.details.map((d: { path: string }) => d.path).sort(), ['from_account_id', 'to_account_id']);

    const code = await admin.post('/api/admin/data/clubs', { values: { club_code: 'kucuk harf', club_name: 'x' } });
    assert.equal(code.json.error.details[0].path, 'club_code');
  });
});
