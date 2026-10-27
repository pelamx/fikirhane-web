import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { runJobs } from '../src/services/jobs.ts';
import { Client, grantRole, makeEvent, ORIGIN, registered, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup({ kitchenPayment: 'test' }); });
after(async () => { await env?.stop(); });
const one = async <T>(q: Promise<T[]>) => (await q)[0];

/** A signed-in person with a booking for a session today (moved to today's noon, Istanbul, after booking it): someone at the venue. */
async function guestToday() {
  const u = await registered(env);
  const { eventId } = await makeEvent(env.sql, { hoursFromNow: 2 });
  const res = await u.client.post('/api/bookings', { event_id: eventId });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  await env.sql`update events set start_datetime = (now() at time zone 'Europe/Istanbul')::date + time '12:00' at time zone 'Europe/Istanbul',
    end_datetime = (now() at time zone 'Europe/Istanbul')::date + time '14:00' at time zone 'Europe/Istanbul' where id_event = ${eventId}`;
  return u;
}

/** Follows the checkout to the test card page and answers it; returns where the person lands. */
async function pay(client: Client, outcome: 'ok' | 'fail') {
  const start = await client.post('/api/me/kitchen/checkout');
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const path = new URL(start.json.page_url).pathname;
  assert.equal((await env.app.request(ORIGIN + path)).status, 200);
  const res = await env.app.request(ORIGIN + path, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }, body: `outcome=${outcome}` });
  assert.equal(res.status, 303);
  // The card page sends the person to the return address, which says how it went.
  const returned = await env.app.request(ORIGIN + res.headers.get('location')!);
  assert.equal(returned.status, 303);
  return { location: returned.headers.get('location')!, token: path.split('/').pop()! };
}
const form = (fields: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

describe('kitchen tab', () => {
  test('every signed-in member sees the cafeteria menu and can open a tab, no booking needed', async () => {
    assert.equal((await new Client(env).get('/api/me/kitchen')).status, 401);

    const member = await registered(env);
    const state = (await member.client.get('/api/me/kitchen')).json;
    assert.deepEqual([state.online_payment, state.tab], [true, null]);
    const water = (await member.client.get('/api/me/kitchen/barcode/8690000000005')).json;
    assert.deepEqual([water.item_code, water.price], ['WATER_500ML', '22.00'], 'a barcode finds its product, price with 10% tax');
    assert.equal((await member.client.get('/api/me/kitchen/barcode/8690000000012')).status, 404, 'an unknown barcode');
    assert.equal((await member.client.get('/api/me/kitchen/barcode/TEA')).status, 404, 'barcodes are digits');
    const menu = state.menu.map((i: { item_code: string }) => i.item_code);
    assert.ok(menu.includes('TEA') && menu.includes('WATER_500ML'), 'the menu is everything the counter sells, with or without a barcode');
    assert.ok(!menu.includes('COFFEE_BEANS'), 'ingredients are not sold');

    const added = await member.client.post('/api/me/kitchen/lines', { item_code: 'WATER_500ML' });
    assert.equal(added.status, 201, JSON.stringify(added.json));
    assert.deepEqual(added.json.tab.lines.map((l: { item_code: string; quantity: number }) => [l.item_code, l.quantity]), [['WATER_500ML', 1]]);
  });

  test('scans add lines, quantities change and lines come off', async () => {
    const guest = await guestToday();
    await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' });
    await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' });
    const added = await guest.client.post('/api/me/kitchen/lines', { item_code: 'WATER_500ML' });
    assert.equal(added.status, 201, JSON.stringify(added.json));
    const tab = added.json.tab;
    assert.deepEqual(tab.lines.map((l: { item_code: string; quantity: number }) => [l.item_code, l.quantity]), [['TEA', 2], ['WATER_500ML', 1]]);
    assert.equal(tab.grand_total, '77.00', '2 × 27.50 + 22.00');

    const tea = tab.lines[0].id_document_item;
    assert.equal((await guest.client.patch(`/api/me/kitchen/lines/${tea}`, { quantity: 1 })).json.tab.grand_total, '49.50');
    const removed = (await guest.client.patch(`/api/me/kitchen/lines/${tea}`, { quantity: 0 })).json.tab;
    assert.deepEqual([removed.lines.length, removed.grand_total], [1, '22.00']);
    const other = await guestToday();
    assert.equal((await other.client.patch(`/api/me/kitchen/lines/${tab.lines[1].id_document_item}`, { quantity: 5 })).status, 404, 'only your own tab');
    const audit = await env.sql`select action from audit_log where entity_id = ${tab.id_document}::text and action = 'kitchen.line_remove'`;
    assert.equal(audit.length, 2, 'taking things off is recorded');
  });

  test('paying online posts the tab, takes the stock out and allocates the payment', async () => {
    const guest = await guestToday();
    await guest.client.post('/api/me/kitchen/lines', { item_code: 'WATER_500ML' });
    const { id_document } = (await guest.client.post('/api/me/kitchen/lines', { item_code: 'CHEESE_TOAST' })).json.tab;

    const start = await guest.client.post('/api/me/kitchen/checkout');
    const token = new URL(start.json.page_url).pathname.split('/').pop()!;
    assert.equal((await guest.client.get('/api/me/kitchen')).json.tab.locked, true);
    assert.equal((await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' })).json.error.code, 'tab_locked', 'no changes while paying');
    assert.equal((await guest.client.post('/api/me/kitchen/checkout/cancel')).json.tab.locked, false, 'going back unlocks it');

    const stock = Number((await one(env.sql`select current_stock::text as s from items where item_code = 'WATER_500ML'`)).s);
    const { location } = await pay(guest.client, 'ok');
    assert.match(location, /^\/member\/\?odeme=ok&fis=SA-\d{4}-\d{5}#mutfak$/);
    const doc = await one(env.sql`select status, grand_total::text, id_user::text from documents where id_document = ${id_document}`);
    assert.deepEqual({ ...doc }, { status: 'posted', grand_total: '143.00', id_user: guest.userId });
    assert.equal(Number((await one(env.sql`select current_stock::text as s from items where item_code = 'WATER_500ML'`)).s), stock - 1);
    const paid = await env.sql`select t.status, t.payment_method, t.provider_name, t.provider_transaction_id, a.account_code
      from transaction_allocations x join transactions t using (id_transaction) join accounts a on a.id_account = t.to_account_id where x.id_document = ${id_document}`;
    assert.equal(paid.length, 1);
    assert.deepEqual([paid[0].status, paid[0].payment_method, paid[0].provider_name, paid[0].account_code], ['posted', 'online_payment', 'test', 'ONLINE_PAYMENTS']);
    assert.match(paid[0].provider_transaction_id, /^TEST-/);
    const cancelled = await one(env.sql`select t.status from kitchen_checkouts k join transactions t using (id_transaction) where k.provider_token = ${token}`);
    assert.equal(cancelled.status, 'cancelled', 'the abandoned attempt keeps no pending money');

    assert.equal((await guest.client.get('/api/me/kitchen')).json.tab, null, 'a new tab starts with the next scan');
  });

  test('PayTR: only a correctly signed notification settles the tab, once', async () => {
    const guest = await guestToday();
    const { id_document } = (await guest.client.post('/api/me/kitchen/lines', { item_code: 'CHEESE_TOAST' })).json.tab;
    await guest.client.post('/api/me/kitchen/checkout');
    // The attempt as PayTR would have it: the test page started it, PayTR answers it.
    const [{ ref }] = await env.sql`update kitchen_checkouts set provider = 'paytr' where id_document = ${id_document} and status = 'open' returning provider_token as ref`;
    const keys = { merchantId: '123456', merchantKey: 'test-key', merchantSalt: 'test-salt', testMode: true };
    const hash = (oid: string, status: string, total: string) => createHmac('sha256', keys.merchantKey).update(oid + keys.merchantSalt + status + total).digest('base64');
    Object.assign(env.config, { kitchenPayment: 'paytr', paytr: keys });
    try {
      const notify = (fields: Record<string, string>) => env.app.request(ORIGIN + '/api/kitchen/notify', form(fields));
      const forged = await notify({ merchant_oid: ref, status: 'success', total_amount: '12100', hash: hash(ref, 'success', '99') });
      assert.equal(forged.status, 400, 'a wrong signature is refused');
      assert.equal((await one(env.sql`select status from documents where id_document = ${id_document}`)).status, 'draft');

      const waiting = await env.app.request(`${ORIGIN}/api/kitchen/return?ref=${ref}`);
      assert.equal(waiting.headers.get('location'), '/member/?odeme=bekliyor#mutfak', 'back before the notification: still being confirmed');

      const signed = { merchant_oid: ref, status: 'success', total_amount: '12100', payment_amount: '12100', hash: hash(ref, 'success', '12100') };
      const res = await notify(signed);
      assert.deepEqual([res.status, await res.text()], [200, 'OK']);
      assert.equal((await notify(signed)).status, 200, 'PayTR may repeat it');
      const paid = await env.sql`select t.provider_name, t.provider_transaction_id, x.allocated_amount::text from transaction_allocations x join transactions t using (id_transaction) where x.id_document = ${id_document}`;
      assert.deepEqual(paid.map(p => [p.provider_name, p.provider_transaction_id, p.allocated_amount]), [['paytr', `paytr-${ref}`, '121.00']], 'posted once');
      const back = await env.app.request(`${ORIGIN}/api/kitchen/return?ref=${ref}`);
      assert.match(back.headers.get('location')!, /^\/member\/\?odeme=ok&fis=SA-/);
    } finally { Object.assign(env.config, { kitchenPayment: 'test', paytr: null }); }
  });

  test('a failed or abandoned payment leaves the tab open', async () => {
    const guest = await guestToday();
    await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' });
    const { location } = await pay(guest.client, 'fail');
    assert.match(location, /^\/member\/\?odeme=hata.*#mutfak$/);
    const tab = (await guest.client.get('/api/me/kitchen')).json.tab;
    assert.deepEqual([tab.locked, tab.lines.length], [false, 1]);

    await guest.client.post('/api/me/kitchen/checkout');
    await env.sql`update kitchen_checkouts set expires_at = now() - interval '1 minute' where id_document = ${tab.id_document} and status = 'open'`;
    assert.equal((await guest.client.get('/api/me/kitchen')).json.tab.locked, false, 'an expired attempt no longer locks');
    assert.ok((await runJobs(env.sql)).expiredKitchenCheckouts >= 1);
    const pending = await env.sql`select 1 from kitchen_checkouts k join transactions t using (id_transaction) where k.id_document = ${tab.id_document} and t.status = 'pending'`;
    assert.equal(pending.length, 0);
  });

  test('staff see open tabs and close one at the desk', async () => {
    const guest = await guestToday();
    const { id_document } = (await guest.client.post('/api/me/kitchen/lines', { item_code: 'TURKISH_COFFEE' })).json.tab;
    const staff = await registered(env);
    await grantRole(env.sql, staff.userId, 'KITCHEN_STAFF');
    assert.equal((await guest.client.get('/api/host/kitchen/tabs')).status, 403);
    const tabs = (await staff.client.get('/api/host/kitchen/tabs')).json.items;
    assert.ok(tabs.some((t: { id_document: string; grand_total: string }) => t.id_document === id_document && t.grand_total === '66.00'));
    const closed = await staff.client.post(`/api/host/kitchen/tabs/${id_document}/close`, { payment_method: 'cash' });
    assert.equal(closed.status, 200, JSON.stringify(closed.json));
    assert.equal(closed.json.account, 'Fikirhane Cash');
    assert.equal((await staff.client.post(`/api/host/kitchen/tabs/${id_document}/close`, { payment_method: 'cash' })).status, 404, 'only open tabs');

  });

  test('with online payment off the tab is paid at the desk', async () => {
    const guest = await guestToday();
    assert.equal((await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' })).status, 201, 'tabs keep opening after the statement is prepared');
    env.config.kitchenPayment = 'off';
    try {
      assert.equal((await guest.client.get('/api/me/kitchen')).json.online_payment, false);
      assert.equal((await guest.client.post('/api/me/kitchen/checkout')).json.error.code, 'payment_unavailable');
    } finally { env.config.kitchenPayment = 'test'; }
  });
});
