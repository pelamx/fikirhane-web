import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { RULES } from '../src/errors.ts';
import { migrate } from '../src/migrate.ts';
import { quote } from '../src/services/pricing.ts';
import { setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (err: Error) => pattern.test(err.message));
}

describe('migrations', () => {
  test('are idempotent and create every documented table', async () => {
    assert.deepEqual(await migrate(env.sql), []);
    const tables = (await env.sql<{ table_name: string }[]>`select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`).map(t => t.table_name);
    for (const t of ['users', 'roles', 'permissions', 'role_permissions', 'user_roles', 'audit_log', 'invitations', 'user_acquisitions',
      'skills', 'user_skills', 'interests', 'user_interests', 'membership_types', 'user_memberships', 'membership_applications',
      'freepasses', 'freepass_redemptions', 'campaigns', 'club_sponsorships', 'sponsorship_plans', 'sponsorship_usage',
      'clubs', 'club_users', 'club_member_roles', 'event_clubs', 'organizations', 'organization_users', 'organization_roles',
      'event_organizations', 'events', 'event_series', 'event_options', 'event_users', 'locations', 'space_setups', 'tables', 'seats',
      'bookings', 'accounts', 'financial_centers', 'financial_categories', 'transactions', 'transaction_allocations',
      'items', 'stock_movements', 'documents', 'document_items']) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
    assert.ok(!tables.includes('event_locations'), 'EVENT_LOCATIONS must not exist');
  });

  test('reference data is consistent', async () => {
    const [{ n }] = await env.sql<{ n: number }[]>`select count(*)::int as n from seats s join space_setups ss using (id_space_setup)
      where ss.setup_code = 'FIKIRHANE_COWORK_V1' and s.reservable`;
    assert.equal(n, 16);
    const missing = await env.sql`select r.role_code from roles r where not exists (select 1 from role_permissions rp where rp.id_role = r.id_role)`;
    assert.equal(missing.length, 0, 'every role has permissions');
  });

  test('every rule that ties columns together has a field and a Turkish message', async () => {
    const rules = (await env.sql<{ name: string }[]>`select conname as name from pg_constraint
      where connamespace = 'public'::regnamespace and (contype = 'x' or (contype = 'c' and cardinality(conkey) > 1))`).map(r => r.name);
    assert.deepEqual(rules.filter(r => !RULES[r]).sort(), [], 'add these to RULES in src/errors.ts');
    assert.deepEqual(Object.keys(RULES).filter(r => !rules.includes(r)).sort(), [], 'RULES names a rule the database does not have');
  });
});

describe('guards', () => {
  test('users cannot be hard deleted and audit log is append-only', async () => {
    const [u] = await env.sql<{ id_user: string }[]>`insert into users (first_name, last_name) values ('A', 'B') returning id_user`;
    await rejects(env.sql`delete from users where id_user = ${u.id_user}`, /Hard delete is not allowed/);
    await env.sql`insert into audit_log (actor_type, action, entity_type, entity_id) values ('system', 'test', 'user', ${u.id_user})`;
    await rejects(env.sql`update audit_log set action = 'x'`, /append-only/);
    await rejects(env.sql`delete from audit_log`, /append-only/);
  });

  test('membership type cannot change in place and only one active membership', async () => {
    const [u] = await env.sql<{ id_user: string }[]>`insert into users (first_name, last_name) values ('M', 'T') returning id_user`;
    const [m] = await env.sql<{ id_user_membership: string }[]>`insert into user_memberships (id_user, id_membership_type, start_date)
      select ${u.id_user}, id_membership_type, current_date from membership_types where membership_type_code = 'MEMBER' returning id_user_membership`;
    await rejects(env.sql`update user_memberships set id_membership_type = (select id_membership_type from membership_types where membership_type_code = 'PREMIUM')
      where id_user_membership = ${m.id_user_membership}`, /Close the membership/);
    await rejects(env.sql`insert into user_memberships (id_user, id_membership_type, start_date)
      select ${u.id_user}, id_membership_type, current_date from membership_types where membership_type_code = 'PREMIUM'`, /user_memberships_active_uq/);
  });

  test('event option capacity cannot exceed setup capacity and setup must match location', async () => {
    const [e] = await env.sql<{ id_event: string }[]>`insert into events (event_type, event_title, start_datetime, end_datetime)
      values ('talk', 'Cap', now() + interval '1 day', now() + interval '1 day 1 hour') returning id_event`;
    await rejects(env.sql`insert into event_options (id_event, id_location, id_space_setup, option_code, capacity, booking_unit, status)
      select ${e.id_event}, id_location, id_space_setup, 'X', 99, 'seat', 'active' from space_setups where setup_code = 'ATOLYE_COWORK_V1'`, /exceeds setup capacity/);
    await rejects(env.sql`insert into event_options (id_event, id_location, id_space_setup, option_code, capacity, booking_unit, status)
      select ${e.id_event}, (select id_location from locations where location_code = 'FIKIRHANE'), id_space_setup, 'Y', 5, 'seat', 'active'
      from space_setups where setup_code = 'ATOLYE_COWORK_V1'`, /foreign key/);
  });

  test('money ledger rules', async () => {
    const [acc] = await env.sql<{ id_account: string }[]>`select id_account from accounts where account_code = 'BANK_TRY'`;
    await rejects(env.sql`insert into transactions (transaction_type, from_account_id, amount, currency_code) values ('collection', ${acc.id_account}, 10, 'TRY')`, /check constraint/);
    await rejects(env.sql`insert into transactions (transaction_type, to_account_id, amount, currency_code) values ('collection', ${acc.id_account}, 10, 'USD')`, /transaction currency/);
    const [t] = await env.sql<{ id_transaction: string }[]>`insert into transactions (transaction_type, to_account_id, amount, currency_code, status, posted_at)
      values ('collection', ${acc.id_account}, 100, 'TRY', 'posted', now()) returning id_transaction`;
    await rejects(env.sql`update transactions set amount = 50 where id_transaction = ${t.id_transaction}`, /cannot be edited/);
    await rejects(env.sql`delete from transactions where id_transaction = ${t.id_transaction}`, /Only pending/);

    // Documents: no posting without lines; allocations cannot exceed document total.
    const [d] = await env.sql<{ id_document: string }[]>`insert into documents (direction, document_type, currency_code) values ('sale', 'receipt', 'TRY') returning id_document`;
    await rejects(env.sql`update documents set status = 'posted', posted_at = now(), document_number = 'SALE-T-1' where id_document = ${d.id_document}`, /without lines/);
    await env.sql`insert into document_items (id_document, line_no, id_financial_center, id_financial_category, description, quantity, unit_price, gross_amount, net_amount, line_total)
      select ${d.id_document}, 1, (select id_financial_center from financial_centers where center_code = 'CAFETERIA'), id_financial_category, 'Coffee', 2, 40, 80, 80, 80
      from financial_categories where category_code = 'CAFETERIA_SALES'`;
    await rejects(env.sql`insert into document_items (id_document, line_no, id_financial_center, id_financial_category, description, quantity, unit_price, gross_amount, net_amount, line_total)
      select ${d.id_document}, 2, (select id_financial_center from financial_centers where center_code = 'CAFETERIA'), id_financial_category, 'Wrong', 1, 1, 1, 1, 1
      from financial_categories where category_code = 'RENT'`, /direction/);
    await env.sql`update documents set subtotal_amount = 80, grand_total = 80, status = 'posted', posted_at = now(), document_number = 'SALE-T-1' where id_document = ${d.id_document}`;
    await rejects(env.sql`update document_items set quantity = 3 where id_document = ${d.id_document}`, /cannot be changed/);
    await env.sql`insert into transaction_allocations (id_transaction, id_document, allocated_amount) values (${t.id_transaction}, ${d.id_document}, 80)`;
    const [t2] = await env.sql<{ id_transaction: string }[]>`insert into transactions (transaction_type, to_account_id, amount, currency_code, status, posted_at)
      values ('collection', ${acc.id_account}, 100, 'TRY', 'posted', now()) returning id_transaction`;
    await rejects(env.sql`insert into transaction_allocations (id_transaction, id_document, allocated_amount) values (${t2.id_transaction}, ${d.id_document}, 1)`, /exceed document total/);
  });

  test('stock ledger enforces signs, tracked items and keeps the cache', async () => {
    const [item] = await env.sql<{ id_item: string }[]>`insert into items (item_code, item_name, item_type, unit, is_stock_tracked)
      values ('WATER_TEST', 'Water', 'stock_item', 'piece', true) returning id_item`;
    await env.sql`insert into stock_movements (id_item, movement_type, quantity) values (${item.id_item}, 'opening_balance', 48)`;
    await env.sql`insert into stock_movements (id_item, movement_type, quantity) values (${item.id_item}, 'sale', -3)`;
    await rejects(env.sql`insert into stock_movements (id_item, movement_type, quantity) values (${item.id_item}, 'sale', 2)`, /check constraint/);
    await rejects(env.sql`insert into stock_movements (id_item, movement_type, quantity) values (${item.id_item}, 'waste', -1)`, /check constraint/);
    const [{ current_stock }] = await env.sql<{ current_stock: string }[]>`select current_stock from items where id_item = ${item.id_item}`;
    assert.equal(Number(current_stock), 45);
    await rejects(env.sql`update stock_movements set quantity = 1`, /append-only/);
    const [svc] = await env.sql<{ id_item: string }[]>`insert into items (item_code, item_name, item_type, unit) values ('SVC_TEST', 'Svc', 'service', 'session') returning id_item`;
    await rejects(env.sql`insert into stock_movements (id_item, movement_type, quantity) values (${svc.id_item}, 'opening_balance', 1)`, /stock-tracked/);
  });

  test('only one active primary sponsor per club per period', async () => {
    const [org] = await env.sql<{ id_organization: string }[]>`insert into organizations (organization_name, organization_type) values ('ABC', 'company') returning id_organization`;
    const ins = (start: string, end: string) => env.sql`insert into club_sponsorships (id_club, id_organization, start_date, end_date, status, is_primary_sponsor)
      select id_club, ${org.id_organization}, ${start}, ${end}, 'active', true from clubs where club_code = 'ENGLISH'`;
    await ins('2027-01-01', '2027-12-31');
    await rejects(ins('2027-06-01', '2028-05-31'), /conflicting key value violates exclusion constraint/);
    await ins('2028-01-01', '2028-12-31');
  });
});

describe('pricing', () => {
  test('docs example: 500 base, -50 location, Member 15% = 382.50', () => {
    assert.deepEqual(quote({ basePrice: '500.00', priceAdjustment: '-50.00', currency: 'TRY', discountRate: '15.00', freepass: false }),
      { listAmount: '450.00', discountAmount: '67.50', finalPrice: '382.50', currency: 'TRY', reason: 'membership' });
  });
  test('freepass keeps list price and discounts everything', () => {
    assert.deepEqual(quote({ basePrice: '500.00', priceAdjustment: '0', currency: 'TRY', discountRate: '20.00', freepass: true }),
      { listAmount: '500.00', discountAmount: '500.00', finalPrice: '0.00', currency: 'TRY', reason: 'freepass' });
  });
  test('no base price means not bookable', () => {
    assert.equal(quote({ basePrice: null, priceAdjustment: '0', currency: 'TRY', discountRate: null, freepass: false }), null);
  });
});
