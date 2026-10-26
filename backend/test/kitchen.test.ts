import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { runJobs } from '../src/services/jobs.ts';
import { Client, grantRole, makeEvent, ORIGIN, registered, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup({ kitchenPayment: 'test' }); });
after(async () => { await env?.stop(); });
const one = async <T>(q: Promise<T[]>) => (await q)[0];

/** A signed-in person with a booking for a session today (moved to today's noon, Istanbul, after booking it). */
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
  return { location: res.headers.get('location')!, token: path.split('/').pop()! };
}

describe('kitchen tab', () => {
  test('only people with a booking today can open a tab', async () => {
    const stranger = await registered(env);
    assert.equal((await stranger.client.get('/api/me/kitchen')).json.eligible, false);
    assert.equal((await stranger.client.post('/api/me/kitchen/lines', { item_code: 'TEA' })).json.error.code, 'kitchen_closed');
    assert.equal((await new Client(env).get('/api/me/kitchen')).status, 401);

    const guest = await guestToday();
    const state = (await guest.client.get('/api/me/kitchen')).json;
    assert.deepEqual([state.eligible, state.online_payment, state.tab], [true, true, null]);
    assert.equal((await guest.client.get('/api/me/kitchen/items/TEA')).json.price, '27.50', '25 + 10% tax');
    assert.equal((await guest.client.get('/api/me/kitchen/items/COFFEE_BEANS')).status, 404, 'ingredients are not sold');
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
    assert.match(location, /^\/mutfak\/\?odeme=ok&fis=SA-\d{4}-\d{5}$/);
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

    // A repeated callback answers with the same receipt and posts nothing twice.
    const [{ provider_token }] = await env.sql`select provider_token from kitchen_checkouts where id_document = ${id_document} and status = 'paid'`;
    const again = await env.app.request(ORIGIN + '/api/kitchen/callback', { method: 'POST', headers: { origin: 'https://sandbox-api.iyzipay.com', 'content-type': 'application/x-www-form-urlencoded' }, body: `token=${provider_token}` });
    assert.equal(again.status, 303, 'the provider may post from its own origin');
    assert.equal(again.headers.get('location'), location);
    assert.equal((await env.sql`select 1 from transaction_allocations where id_document = ${id_document}`).length, 1);
    assert.equal((await guest.client.get('/api/me/kitchen')).json.tab, null, 'a new tab starts with the next scan');
  });

  test('a failed or abandoned payment leaves the tab open', async () => {
    const guest = await guestToday();
    await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' });
    const { location } = await pay(guest.client, 'fail');
    assert.match(location, /^\/mutfak\/\?odeme=hata/);
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

    const labels = (await staff.client.get('/api/host/kitchen/labels')).json.items;
    const tea = labels.find((l: { item_code: string }) => l.item_code === 'TEA');
    assert.equal(tea.url, `${ORIGIN}/mutfak/?urun=TEA`);
    assert.match(tea.qr_svg, /^<svg/);
  });

  test('with online payment off the tab is paid at the desk', async () => {
    const guest = await guestToday();
    await guest.client.post('/api/me/kitchen/lines', { item_code: 'TEA' });
    env.config.kitchenPayment = 'off';
    try {
      assert.equal((await guest.client.get('/api/me/kitchen')).json.online_payment, false);
      assert.equal((await guest.client.post('/api/me/kitchen/checkout')).json.error.code, 'payment_unavailable');
    } finally { env.config.kitchenPayment = 'test'; }
  });
});
