import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { runJobs } from '../src/services/jobs.ts';
import { Client, giveMembership, grantRole, makeEvent, ORIGIN, registered, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

describe('auth', () => {
  test('register, me, logout, login', async () => {
    const { client, email } = await registered(env, { club_codes: ['ENGLISH'], interest_codes: ['ARTIFICIAL_INTELLIGENCE', 'WRITING'] });
    assert.match(client.cookie, /^fh_session=/);
    const me = await client.get('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, email);
    assert.deepEqual(me.json.roles, ['USER']);
    assert.equal(me.json.membership.code, null, 'new users are Visitors');
    assert.ok(me.json.permissions.includes('booking.create'));
    assert.ok(!me.json.permissions.includes('event.publish'));
    assert.deepEqual(me.json.clubs.map((c: any) => c.club_code), ['ENGLISH']);
    const interests = await client.get('/api/me/interests');
    assert.deepEqual(interests.json.items.map((i: any) => i.code), ['ARTIFICIAL_INTELLIGENCE', 'WRITING']);
    const [acq] = await env.sql`select source from user_acquisitions where id_user = ${me.json.user.id_user}`;
    assert.equal(acq.source, 'organic');

    assert.equal((await client.post('/api/auth/logout')).status, 204);
    assert.equal((await client.get('/api/me')).status, 401);
    const bad = await client.post('/api/auth/login', { email, password: 'wrong-password' });
    assert.equal(bad.status, 401);
    assert.equal(bad.json.error.code, 'invalid_credentials');
    assert.equal((await client.post('/api/auth/login', { email: email.toUpperCase(), password: 'correct-horse-1' })).status, 200);
    assert.equal((await client.get('/api/me')).status, 200);
  });

  test('duplicate email, weak password and elevation attempts are rejected', async () => {
    const { email } = await registered(env);
    const c = new Client(env);
    assert.equal((await c.post('/api/auth/register', { first_name: 'X', last_name: 'Y', email, password: 'correct-horse-1' })).json.error.code, 'email_taken');
    assert.equal((await c.post('/api/auth/register', { first_name: 'X', last_name: 'Y', email: 'n@example.com', password: 'short' })).status, 400);
    const r = await registered(env);
    const patch = await r.client.patch('/api/me', { account_status: 'active', roles: ['FIKIRHANE_ADMIN'] });
    assert.equal(patch.status, 400, 'unknown profile fields are refused');
  });

  test('profile update', async () => {
    const { client } = await registered(env);
    const res = await client.patch('/api/me', { first_name: 'Zeynep', bio: 'Yazmayı seviyorum.', networking_enabled: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.first_name, 'Zeynep');
    assert.equal(res.json.user.networking_enabled, true);
  });
});

describe('security', () => {
  test('cookie writes from foreign origins are refused; allowed origins get CORS', async () => {
    const { client } = await registered(env);
    const evil = await client.call('PATCH', '/api/me', { bio: 'x' }, { origin: 'https://evil.example' });
    assert.equal(evil.status, 403);
    assert.equal(evil.json.error.code, 'bad_origin');
    const pages = await client.call('PATCH', '/api/me', { bio: 'x' }, { origin: 'https://pelamx.github.io' });
    assert.equal(pages.status, 200);
    assert.equal(pages.headers.get('access-control-allow-origin'), 'https://pelamx.github.io');
  });

  test('behind a TLS-terminating proxy, same-origin https writes are accepted only when the proxy is trusted', async () => {
    const proxied = { origin: 'https://localhost', 'x-forwarded-proto': 'https' };
    const body = { email: 'nobody@example.com', password: 'wrong-password-1' };
    const direct = await new Client(env).call('POST', '/api/auth/login', body, proxied);
    assert.equal(direct.json.error.code, 'bad_origin');
    const trusted = { ...env, app: createApp({ sql: env.sql, config: { ...env.config, trustProxy: true } }) };
    const res = await new Client(trusted).call('POST', '/api/auth/login', body, proxied);
    assert.equal(res.json.error.code, 'invalid_credentials');
  });

  test('admin endpoints require permissions', async () => {
    const { client } = await registered(env);
    assert.equal((await client.get('/api/admin/membership-applications')).status, 403);
    assert.equal((await new Client(env).get('/api/admin/membership-applications')).status, 401);
  });

  test('the site is served but backend files are not', async () => {
    const c = new Client(env);
    assert.equal((await c.get('/')).status, 200);
    const script = await c.get('/scripts/session.js');
    assert.equal(script.status, 200);
    assert.equal(script.headers.get('cache-control'), 'no-cache', 'code is revalidated so deploys need no hard refresh');
    const again = await c.call('GET', '/scripts/session.js', undefined, { 'if-modified-since': script.headers.get('last-modified')! });
    assert.equal(again.status, 304);
    for (const p of ['/%E0%A4%A', '/backend/package.json', '/backend/.env', '/.git/config', '/docs/backend-decisions.md', '/scripts/../backend/src/app.ts']) {
      assert.equal((await c.get(p)).status, 404, p);
    }
  });
});

describe('clubs and events', () => {
  test('join and leave a club', async () => {
    const { client } = await registered(env);
    assert.equal((await client.put('/api/clubs/WRITING/membership')).status, 204);
    assert.equal((await client.put('/api/clubs/WRITING/membership')).status, 204, 'idempotent');
    let clubs = (await client.get('/api/clubs')).json.items;
    assert.equal(clubs.find((c: any) => c.club_code === 'WRITING').is_member, true);
    assert.equal((await client.del('/api/clubs/WRITING/membership')).status, 204);
    clubs = (await client.get('/api/clubs')).json.items;
    assert.equal(clubs.find((c: any) => c.club_code === 'WRITING').is_member, false);
    const rows = await env.sql`select cu.status from club_users cu join clubs c using (id_club) where c.club_code = 'WRITING' order by cu.created_at`;
    assert.ok(rows.some(r => r.status === 'ended'), 'leaving closes the relation instead of deleting it');
  });

  test('events list shows options, availability and personal price', async () => {
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 72, club: 'WORKING' });
    const visitor = await registered(env);
    const member = await registered(env);
    await giveMembership(env.sql, member.userId, 'MEMBER');
    const find = (items: any[]) => items.find(e => e.id_event === eventId);
    const v = find((await visitor.client.get('/api/events')).json.items);
    assert.equal(v.options[0].price.finalPrice, '450.00');
    assert.equal(v.options[0].available, 12);
    assert.equal(v.clubs[0].club_code, 'WORKING');
    const m = find((await member.client.get('/api/events')).json.items);
    assert.equal(m.options[0].price.finalPrice, '382.50');
    const detail = await member.client.get(`/api/events/${eventId}`);
    assert.equal(detail.json.event.seats.length, 12);
  });
});

describe('reservation page data', () => {
  test('event detail carries the floor plan, seat positions and what the caller may do', async () => {
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 72 });
    const anon = new Client(env);
    const res = await anon.get(`/api/events/${eventId}`);
    const [plan] = res.json.event.plans;
    assert.equal(plan.map_image, 'assets/plans/atolye.png');
    assert.equal(plan.tables.length, 3);
    const seats = res.json.event.seats;
    assert.equal(seats.length, 12);
    assert.ok(seats.every((x: { position_x: string; free: boolean }) => Number(x.position_x) > 0 && x.free));
    assert.equal(res.json.policy.signed_in, false);
    assert.equal(res.json.policy.seat_selection, false);
    const premium = await registered(env);
    await giveMembership(env.sql, premium.userId, 'PREMIUM');
    assert.equal((await premium.client.get(`/api/events/${eventId}`)).json.policy.seat_selection, true);
  });
});

describe('bookings', () => {
  test('member booking snapshots price, assigns a seat, blocks duplicates; cancel returns capacity', async () => {
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 72 });
    const { client, userId } = await registered(env);
    await giveMembership(env.sql, userId, 'MEMBER');
    const res = await client.post('/api/bookings', { event_id: eventId });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const b = res.json.booking;
    assert.equal(b.booking_status, 'confirmed');
    assert.equal(b.payment_status, 'unpaid', 'pay_at_venue mode');
    assert.equal(b.price_list_amount, '450.00');
    assert.equal(b.discount_amount, '67.50');
    assert.equal(b.final_price, '382.50');
    assert.equal(b.seat_code, 'A01');
    assert.equal((await client.post('/api/bookings', { event_id: eventId })).json.error.code, 'already_booked');

    const cancel = await client.post(`/api/me/bookings/${b.id_booking}/cancel`);
    assert.equal(cancel.status, 200);
    assert.equal(cancel.json.booking.booking_status, 'cancelled');
    const again = await client.post('/api/bookings', { event_id: eventId });
    assert.equal(again.status, 201, 'can re-book after cancelling');
    assert.equal(again.json.booking.seat_code, 'A01', 'seat was released');
  });

  test('24-hour cancellation lock', async () => {
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 5 });
    const { client } = await registered(env);
    const b = (await client.post('/api/bookings', { event_id: eventId })).json.booking;
    const res = await client.post(`/api/me/bookings/${b.id_booking}/cancel`);
    assert.equal(res.status, 403);
    assert.equal(res.json.error.code, 'cancellation_locked');
  });

  test('reservation window and active booking limit follow membership', async () => {
    const far = await makeEvent(env.sql, { hoursFromNow: 24 * 10 });
    const visitor = await registered(env);
    assert.equal((await visitor.client.post('/api/bookings', { event_id: far.eventId })).json.error.code, 'outside_reservation_window');
    const premium = await registered(env);
    await giveMembership(env.sql, premium.userId, 'PREMIUM');
    assert.equal((await premium.client.post('/api/bookings', { event_id: far.eventId })).status, 201, 'Premium window is 14 days');

    const events = await Promise.all([1, 2, 3].map(i => makeEvent(env.sql, { hoursFromNow: 48 + i * 3 })));
    const v2 = await registered(env);
    assert.equal((await v2.client.post('/api/bookings', { event_id: events[0].eventId })).status, 201);
    assert.equal((await v2.client.post('/api/bookings', { event_id: events[1].eventId })).status, 201);
    assert.equal((await v2.client.post('/api/bookings', { event_id: events[2].eventId })).json.error.code, 'max_active_bookings');
  });

  test('seat selection is a Premium right', async () => {
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 50 });
    const seats = (await new Client(env).get(`/api/events/${eventId}`)).json.event.seats;
    const seat = seats.find((s: any) => s.seat_code === 'A07');
    const member = await registered(env);
    await giveMembership(env.sql, member.userId, 'MEMBER');
    assert.equal((await member.client.post('/api/bookings', { event_id: eventId, seat_id: seat.id_seat })).status, 403);
    const premium = await registered(env);
    await giveMembership(env.sql, premium.userId, 'PREMIUM');
    const ok = await premium.client.post('/api/bookings', { event_id: eventId, seat_id: seat.id_seat });
    assert.equal(ok.json.booking.seat_code, 'A07');
  });

  test('parallel bookings never exceed capacity', async () => {
    const { eventId, optionId } = await makeEvent(env.sql, { hoursFromNow: 60, capacity: 5 });
    const users = await Promise.all(Array.from({ length: 12 }, () => registered(env)));
    const results = await Promise.all(users.map(u => u.client.post('/api/bookings', { event_id: eventId })));
    assert.equal(results.filter(r => r.status === 201).length, 5);
    assert.ok(results.filter(r => r.status !== 201).every(r => r.json.error.code === 'sold_out'));
    const [{ n, seats }] = await env.sql`select count(*)::int as n, count(distinct id_seat)::int as seats from bookings
      where id_event_option = ${optionId} and booking_status = 'confirmed'`;
    assert.equal(n, 5);
    assert.equal(seats, 5);
    const late = await registered(env);
    const wl = await late.client.post('/api/bookings', { event_id: eventId, join_waitlist: true });
    assert.equal(wl.json.booking.booking_status, 'waitlisted');
  });

  test('freepass: claim, zero price, single use under concurrency, returned on timely cancel', async () => {
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 80 });
    const other = await makeEvent(env.sql, { hoursFromNow: 90 });
    await env.sql`insert into freepasses (freepass_code, freepass_type, valid_from, valid_until, usage_limit)
      values ('FP-TEST-0001', 'campaign', now() - interval '1 hour', now() + interval '10 days', 1)`;
    const u = await registered(env);
    const [a, b] = await Promise.all([
      u.client.post('/api/bookings', { event_id: eventId, freepass_code: 'fp-test-0001' }),
      u.client.post('/api/bookings', { event_id: other.eventId, freepass_code: 'FP-TEST-0001' }),
    ]);
    const ok = [a, b].filter(r => r.status === 201);
    assert.equal(ok.length, 1, 'usage_limit = 1 holds under concurrency');
    const booking = ok[0].json.booking;
    assert.equal(booking.final_price, '0.00');
    assert.equal(booking.discount_amount, booking.price_list_amount);
    const [fp] = await env.sql`select id_user from freepasses where freepass_code = 'FP-TEST-0001'`;
    assert.equal(fp.id_user, u.userId, 'claimed by the user');
    const thief = await registered(env);
    assert.equal((await thief.client.post('/api/bookings', { event_id: other.eventId, freepass_code: 'FP-TEST-0001' })).json.error.code, 'freepass_invalid');

    await u.client.post(`/api/me/bookings/${booking.id_booking}/cancel`);
    const [{ active }] = await env.sql`select count(*)::int as active from freepass_redemptions r join freepasses f using (id_freepass)
      where f.freepass_code = 'FP-TEST-0001' and r.status = 'active'`;
    assert.equal(active, 0, 'redemption reversed');
  });
});

describe('membership flow', () => {
  test('visitor applies, admin approves, discount applies, upgrade ends previous membership', async () => {
    const applicant = await registered(env);
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');

    assert.equal((await applicant.client.post('/api/me/membership-applications', { membership_type_code: 'MEMBER' })).json.error.code, 'motivation_required');
    const app = await applicant.client.post('/api/me/membership-applications', { membership_type_code: 'MEMBER', motivation_text: 'Topluluğa katılmak istiyorum.' });
    assert.equal(app.status, 201);
    assert.equal((await applicant.client.post('/api/me/membership-applications', { membership_type_code: 'MEMBER', motivation_text: 'Again' })).json.error.code, 'application_open');

    const list = await admin.client.get('/api/admin/membership-applications');
    assert.ok(list.json.items.some((i: any) => i.id_membership_application === app.json.id_membership_application));
    const decision = await admin.client.post(`/api/admin/membership-applications/${app.json.id_membership_application}/decision`,
      { decision: 'approved', decision_reason: 'approved_profile_fit', decision_note: 'Good fit.' });
    assert.equal(decision.status, 200, JSON.stringify(decision.json));
    assert.equal((await applicant.client.get('/api/me')).json.membership.code, 'MEMBER');
    const [log] = await env.sql`select actor_user_id from audit_log where action = 'membership.approve' and entity_id = ${app.json.id_membership_application}`;
    assert.equal(log.actor_user_id, admin.userId);

    const premium = await applicant.client.post('/api/me/membership-applications', { membership_type_code: 'PREMIUM', motivation_text: 'Upgrade' });
    await admin.client.post(`/api/admin/membership-applications/${premium.json.id_membership_application}/decision`, { decision: 'approved' });
    const mine = (await applicant.client.get('/api/me/membership')).json;
    assert.equal(mine.current.code, 'PREMIUM');
    assert.deepEqual(mine.history.map((h: any) => h.status).sort(), ['active', 'ended']);
  });
});

describe('admin events', () => {
  test('create, publish with conflict detection, cancel cascades to bookings', async () => {
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const start = new Date(Date.now() + 30 * 3_600_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    const payload = {
      event_type: 'workshop', event_title: 'AI Prompting', start_datetime: start.toISOString(), end_datetime: end.toISOString(),
      base_price: '300.00', club_code: 'WORKING',
      options: [{ location_code: 'MEETING_ROOM', setup_code: 'FIKIRHANE_COWORK_V1', option_code: 'MR', capacity: 8 }],
    };
    assert.equal((await admin.client.post('/api/admin/events', payload)).status, 404, 'setup must belong to location');
    const created = await admin.client.post('/api/admin/events', { ...payload,
      options: [{ location_code: 'FIKIRHANE', setup_code: 'FIKIRHANE_COWORK_V1', option_code: 'FIK', capacity: 10 }] });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal((await admin.client.post(`/api/admin/events/${created.json.id_event}/publish`)).status, 204);
    const clash = await admin.client.post('/api/admin/events', { ...payload, event_title: 'Clash',
      options: [{ location_code: 'FIKIRHANE', setup_code: 'FIKIRHANE_COWORK_V1', option_code: 'FIK', capacity: 10 }] });
    assert.equal((await admin.client.post(`/api/admin/events/${clash.json.id_event}/publish`)).json.error.code, 'location_conflict');

    const guest = await registered(env);
    const booking = (await guest.client.post('/api/bookings', { event_id: created.json.id_event })).json.booking;
    assert.equal(booking.final_price, '300.00');
    const cancelled = await admin.client.post(`/api/admin/events/${created.json.id_event}/cancel`, { reason: 'Speaker unavailable' });
    assert.equal(cancelled.json.cancelledBookings, 1);
    const [b] = await env.sql`select booking_status, cancellation_reason from bookings where id_booking = ${booking.id_booking}`;
    assert.deepEqual({ ...b }, { booking_status: 'cancelled', cancellation_reason: 'event_cancelled' });
  });

  test('club lead creates events for review only for their club', async () => {
    const lead = await registered(env);
    await env.sql`insert into club_users (id_club, id_user, id_club_member_role)
      select c.id_club, ${lead.userId}, r.id_club_member_role from clubs c, club_member_roles r where c.club_code = 'WRITING' and r.role_code = 'CLUB_LEAD'`;
    const start = new Date(Date.now() + 200 * 3_600_000);
    const payload = { event_type: 'meetup', event_title: 'Öykü atölyesi', start_datetime: start.toISOString(),
      end_datetime: new Date(start.getTime() + 3_600_000).toISOString(), base_price: '0',
      options: [{ location_code: 'ATOLYE', setup_code: 'ATOLYE_COWORK_V1', option_code: 'ATL', capacity: 12 }] };
    const own = await lead.client.post('/api/admin/events', { ...payload, club_code: 'WRITING' });
    assert.equal(own.json.status, 'submitted');
    assert.equal((await lead.client.post('/api/admin/events', { ...payload, club_code: 'ENGLISH' })).status, 403);
    assert.equal((await lead.client.post(`/api/admin/events/${own.json.id_event}/publish`)).status, 403);
  });
});

describe('admin data', () => {
  test('only back-office roles get the schema, overview and data; credentials are never exposed', async () => {
    const user = await registered(env);
    for (const path of ['/api/admin/schema', '/api/admin/overview', '/api/admin/data/users', '/api/admin/events']) {
      assert.equal((await user.client.get(path)).status, 403, path);
    }
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const schema = await admin.client.get('/api/admin/schema');
    assert.equal(schema.status, 200);
    const names = schema.json.tables.map((t: { name: string }) => t.name);
    assert.ok(names.includes('bookings') && names.includes('membership_applications'));
    assert.ok(!names.includes('auth_identities') && !names.includes('user_sessions') && !names.includes('audit_log'));
    assert.equal((await admin.client.get('/api/admin/data/auth_identities')).status, 404);
    assert.equal((await admin.client.get('/api/admin/data/audit_log')).status, 403);
    assert.equal((await admin.client.get('/api/admin/data/users;drop')).status, 400);
    assert.equal((await admin.client.get('/api/admin/data/users?password=x')).status, 400);
    const overview = await admin.client.get('/api/admin/overview');
    assert.equal(typeof overview.json.open_applications, 'number');
  });

  test('relations follow foreign keys both ways, including composite keys', async () => {
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const schema = (await admin.client.get('/api/admin/schema')).json.tables;
    const bookings = schema.find((t: { name: string }) => t.name === 'bookings');
    const col = (n: string) => bookings.columns.find((c: { name: string }) => c.name === n);
    assert.deepEqual(col('id_user').ref, { table: 'users', column: 'id_user' });
    assert.deepEqual(col('id_event').ref, { table: 'events', column: 'id_event' });
    const events = schema.find((t: { name: string }) => t.name === 'events');
    assert.ok(events.incoming.some((r: { table: string; column: string }) => r.table === 'bookings' && r.column === 'id_event'));

    const member = await registered(env, { last_name: 'İlişkiTesti' });
    await member.client.put('/api/clubs/ENGLISH/membership');
    const found = await admin.client.get('/api/admin/data/users?q=İlişkiTesti');
    assert.equal(found.json.total, 1);
    const record = await admin.client.get(`/api/admin/data/users/${member.userId}`);
    assert.equal(record.json.row.last_name, 'İlişkiTesti');
    const clubs = record.json.related.find((r: { table: string; column: string }) => r.table === 'club_users' && r.column === 'id_user');
    assert.equal(clubs.total, 1);
    const clubId = clubs.items[0].id_club;
    assert.equal(clubs.labels.clubs[clubId], 'İngilizce Konuşma Kulübü');
    const filtered = await admin.client.get(`/api/admin/data/club_users?id_user=${member.userId}`);
    assert.equal(filtered.json.total, 1);
  });

  test('guest contact details are masked without user.view_contact', async () => {
    const { eventId, optionId } = await makeEvent(env.sql, { hoursFromNow: 300 });
    await env.sql`insert into bookings (id_event, id_event_option, booking_status, booking_source, booking_unit, final_price, currency_code,
        payment_status, guest_first_name, guest_email)
      values (${eventId}, ${optionId}, 'waitlisted', 'staff', 'seat', 0, 'TRY', 'unpaid', 'Misafir', 'guest@example.com')`;
    const marketing = await registered(env);
    await grantRole(env.sql, marketing.userId, 'MARKETING');
    const list = await marketing.client.get(`/api/admin/data/bookings?id_event=${eventId}`);
    assert.equal(list.json.items[0].guest_email, '•••');
    assert.equal((await marketing.client.get(`/api/admin/data/bookings?guest_email=guest@example.com`)).status, 403);
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    assert.equal((await admin.client.get(`/api/admin/data/bookings?id_event=${eventId}`)).json.items[0].guest_email, 'guest@example.com');
  });

  test('admin event list shows drafts with capacity and bookings', async () => {
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const { eventId } = await makeEvent(env.sql, { hoursFromNow: 500, capacity: 7 });
    await env.sql`update events set status = 'draft' where id_event = ${eventId}`;
    const res = await admin.client.get('/api/admin/events?status=draft');
    const row = res.json.items.find((e: { id_event: string }) => e.id_event === eventId);
    assert.equal(row.capacity, 7);
    assert.equal(row.booked, 0);
  });
});

describe('password reset', () => {
  const withMail = () => {
    const sent: { to: string; text: string }[] = [];
    const app = createApp({ sql: env.sql, config: env.config, mailer: async m => { sent.push(m); } });
    return { sent, env: { ...env, app } };
  };
  const waitFor = async <T>(fn: () => T | undefined): Promise<T> => {
    for (let i = 0; i < 100; i++) { const v = fn(); if (v !== undefined) return v; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('timed out');
  };
  const tokenIn = (text: string) => /#t=([A-Za-z0-9_-]+)/.exec(text)?.[1];

  test('email link sets a new password once, signs out old sessions, and unknown emails look the same', async () => {
    const mail = withMail();
    const { client, email } = await registered(env);
    const anon = new Client(mail.env);
    const unknown = await anon.post('/api/auth/password-reset/request', { email: 'nobody-here@example.com' });
    const known = await anon.post('/api/auth/password-reset/request', { email: email.toUpperCase() });
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.json, unknown.json);
    const message = await waitFor(() => mail.sent.find(m => m.to === email));
    assert.equal(mail.sent.length, 1);
    const token = tokenIn(message.text)!;
    assert.ok(token);

    assert.equal((await anon.post('/api/auth/password-reset/confirm', { token, password: 'short' })).status, 400);
    assert.equal((await anon.post('/api/auth/password-reset/confirm', { token, password: 'a-brand-new-secret' })).status, 204);
    assert.equal((await client.get('/api/me')).status, 401, 'old session is revoked');
    const reuse = await anon.post('/api/auth/password-reset/confirm', { token, password: 'another-new-secret' });
    assert.equal(reuse.json.error.code, 'reset_token_invalid');
    assert.equal((await new Client(env).post('/api/auth/login', { email, password: 'correct-horse-1' })).status, 401);
    assert.equal((await new Client(env).post('/api/auth/login', { email, password: 'a-brand-new-secret' })).status, 200);
  });

  test('only the newest link works, and expired links are refused', async () => {
    const mail = withMail();
    const { email, userId } = await registered(env);
    const anon = new Client(mail.env);
    await anon.post('/api/auth/password-reset/request', { email });
    const first = tokenIn((await waitFor(() => mail.sent[0])).text)!;
    await anon.post('/api/auth/password-reset/request', { email });
    const second = tokenIn((await waitFor(() => mail.sent[1])).text)!;
    assert.equal((await anon.post('/api/auth/password-reset/confirm', { token: first, password: 'first-link-secret' })).json.error.code, 'reset_token_invalid');
    await env.sql`update password_reset_tokens set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id_user = ${userId} and used_at is null`;
    assert.equal((await anon.post('/api/auth/password-reset/confirm', { token: second, password: 'second-link-secret' })).json.error.code, 'reset_token_invalid');
  });

  test('without a mail channel nothing is sent and the page can say so', async () => {
    const app = createApp({ sql: env.sql, config: env.config, mailer: null });
    const anon = new Client({ ...env, app });
    assert.deepEqual((await anon.get('/api/auth/password-reset')).json, { email_enabled: false });
    assert.equal((await anon.post('/api/auth/password-reset/request', { email: 'x@example.com' })).status, 202);
  });

  test('staff can hand out a one-time link, but never for another staff account', async () => {
    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const member = await registered(env);
    const plain = await registered(env);
    assert.equal((await plain.client.post(`/api/admin/users/${member.userId}/password-reset-link`)).status, 403);
    const link = await admin.client.post(`/api/admin/users/${member.userId}/password-reset-link`);
    assert.equal(link.status, 201);
    const token = tokenIn(link.json.url)!;
    assert.equal((await new Client(env).post('/api/auth/password-reset/confirm', { token, password: 'handed-over-secret' })).status, 204);
    assert.equal((await new Client(env).post('/api/auth/login', { email: member.email, password: 'handed-over-secret' })).status, 200);
    const other = await registered(env);
    await grantRole(env.sql, other.userId, 'ACCOUNTING');
    assert.equal((await admin.client.post(`/api/admin/users/${other.userId}/password-reset-link`)).json.error.code, 'staff_account');
    const [entry] = await env.sql`select actor_user_id from audit_log where action = 'user.password_reset_link' and entity_id = ${member.userId}`;
    assert.equal(entry.actor_user_id, admin.userId);
  });
});

describe('jobs', () => {
  test('expire pending holds and finished memberships', async () => {
    const { eventId, optionId } = await makeEvent(env.sql, { hoursFromNow: 40 });
    const u = await registered(env);
    await env.sql`insert into bookings (id_event, id_event_option, id_user, booking_status, booking_source, booking_unit, id_seat, final_price,
        currency_code, payment_status, expires_at)
      select ${eventId}, ${optionId}, ${u.userId}, 'pending_payment', 'web', 'seat', s.id_seat, 450, 'TRY', 'pending', now() - interval '1 minute'
      from seats s join space_setups ss using (id_space_setup) where ss.setup_code = 'ATOLYE_COWORK_V1' and s.seat_code = 'A12'`;
    await env.sql`insert into user_memberships (id_user, id_membership_type, start_date, end_date)
      select ${u.userId}, id_membership_type, current_date - 400, current_date - 1 from membership_types where membership_type_code = 'MEMBER'`;
    const result = await runJobs(env.sql);
    assert.ok(result.expiredBookings >= 1);
    assert.ok(result.expiredMemberships >= 1);
    assert.equal((await u.client.get('/api/me')).json.membership.code, null);
  });
});

void ORIGIN;
