import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, badRequest, forbidden, notFound } from '../errors.ts';
import { body, idParam, linkBase, permissionsOf, query, requireUser, selfOrigin, type Ctx, type Deps, type Env } from '../http.ts';
import { catalog, getRecord, listRows, visibleSchema } from '../services/admin-data.ts';
import { createRow, deleteRow, runAction, updateRow, writeInfo } from '../services/admin-write.ts';
import { audit } from '../services/audit.ts';
import { createResetToken, resetUrl } from '../services/password-reset.ts';
import { hasClubPermission, hasEventPermission, requirePermission } from '../services/authz.ts';
import { checkIn } from '../services/bookings.ts';
import { passByToken, passInfo, verdict } from '../services/pass.ts';
import { cancelEvent, createEvent, publishEvent } from '../services/events.ts';
import { decideApplication } from '../services/membership.ts';
import { documentsCsv, financeReport, financeReportCsv, thisMonth, transactionsCsv, type Period } from '../services/reports.ts';

const code = z.string().regex(/^[A-Z0-9_]{2,60}$/);
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const NewEvent = z.object({
  event_type: z.enum(['workspace', 'meetup', 'workshop', 'talk', 'class', 'social']),
  event_title: z.string().trim().min(1).max(160),
  event_description: z.string().trim().max(5000).nullable().optional(),
  event_code: z.string().trim().max(80).nullable().optional(),
  start_datetime: z.iso.datetime({ offset: true }),
  end_datetime: z.iso.datetime({ offset: true }),
  base_price: money.nullable().optional(),
  currency_code: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  minimum_attendees: z.int().nonnegative().nullable().optional(),
  networking_enabled: z.boolean().optional(),
  enable_need: z.boolean().optional(),
  enable_offer: z.boolean().optional(),
  club_code: code.nullable().optional(),
  options: z.array(z.object({
    location_code: code, setup_code: code, option_code: z.string().regex(/^[A-Z0-9_]{1,30}$/), option_name: z.string().max(120).nullable().optional(),
    capacity: z.int().positive(), booking_unit: z.enum(['location', 'table', 'seat']).nullable().optional(),
    price_adjustment: z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/).nullable().optional(),
  })).min(1).max(10),
});
const Decision = z.object({
  decision: z.enum(['under_review', 'approved', 'waitlisted', 'declined']),
  decision_note: z.string().trim().max(2000).nullable().optional(),
  decision_reason: z.enum(['approved_profile_fit', 'approved_active_participation', 'waitlist_capacity', 'declined_incomplete_profile',
    'declined_policy', 'other']).nullable().optional(),
  waitlist_until: z.iso.date().nullable().optional(),
});
const Reason = z.object({ reason: z.string().trim().min(3).max(500) });
const identifier = (v: string) => { if (!/^[a-z_]{2,40}$/.test(v)) throw badRequest('invalid_name', 'Invalid table or column name.'); return v; };
const Page = z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0) });
const EVENT_LIST_PERMS = ['event.create', 'event.publish', 'event.cancel', 'booking.view'];
const RoleAssign = z.object({ role_code: code, expires_at: z.iso.datetime({ offset: true }).nullable().optional(), notes: z.string().max(500).nullable().optional() });

/** Back-office endpoints. Every handler checks permission on the server (PERM-D10) and audits critical actions. */
export function adminRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const { sql, config } = deps;

  // Navigation for the admin shell: which tables (with their relations) and actions this person may use.
  app.get('/schema', async c => {
    const perms = await permissionsOf(c, deps);
    const cat = await catalog(sql);
    const tables = (await visibleSchema(sql, perms)).map(t => ({ ...t, write: writeInfo(t.name, cat.tables.get(t.name)!, perms) }));
    if (!tables.length && !perms.has('membership.view') && !EVENT_LIST_PERMS.some(p => perms.has(p))) throw forbidden();
    return c.json({ permissions: [...perms].sort(), tables });
  });

  app.get('/overview', async c => {
    const perms = await permissionsOf(c, deps);
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const out: Record<string, number> = {};
    const jobs: Promise<void>[] = [];
    const add = (key: string, perm: string, q: () => Promise<{ n: number }[]>) => { if (perms.has(perm)) jobs.push(count(q()).then(n => { out[key] = n; })); };
    add('open_applications', 'membership.view', () => sql`select count(*)::int as n from membership_applications where status in ('submitted', 'under_review')`);
    add('active_memberships', 'membership.view', () => sql`select count(*)::int as n from user_memberships where status = 'active'`);
    add('events_awaiting_publish', 'event.publish', () => sql`select count(*)::int as n from events where status in ('submitted', 'approved') and end_datetime > now()`);
    add('upcoming_events', 'booking.view', () => sql`select count(*)::int as n from events where status = 'published' and start_datetime between now() and now() + interval '7 days'`);
    add('active_bookings', 'booking.view', () => sql`select count(*)::int as n from bookings b join events e using (id_event)
      where b.booking_status in ('pending_payment', 'confirmed', 'checked_in') and e.end_datetime > now()`);
    add('users', 'user.view_basic', () => sql`select count(*)::int as n from users where account_status = 'active'`);
    await Promise.all(jobs);
    if (!Object.keys(out).length) throw forbidden();
    return c.json(out);
  });

  app.get('/data/:table', async c => {
    const perms = await permissionsOf(c, deps);
    const { q, limit, offset, ...rest } = c.req.query();
    const page = Page.safeParse({ q, limit, offset });
    if (!page.success) throw badRequest('validation_failed', 'Some query parameters are invalid.');
    const filters = Object.fromEntries(Object.entries(rest).map(([k, v]) => [identifier(k), String(v).slice(0, 200)]));
    return c.json(await listRows(sql, perms, identifier(c.req.param('table')), { ...page.data, q: page.data.q || undefined, filters }));
  });

  app.get('/data/:table/:id', async c => {
    const perms = await permissionsOf(c, deps);
    return c.json(await getRecord(sql, perms, identifier(c.req.param('table')), idParam(c, 'id')));
  });

  const Values = z.object({ values: z.record(z.string(), z.unknown()) });
  const ActionBody = z.object({ reason: z.string().trim().max(1000).nullable().optional() });

  app.post('/data/:table', async c => {
    const actor = requireUser(c);
    const { values } = await body(c, Values);
    return c.json(await createRow(sql, await permissionsOf(c, deps), actor, identifier(c.req.param('table')), values), 201);
  });

  app.patch('/data/:table/:id', async c => {
    const actor = requireUser(c);
    const { values } = await body(c, Values);
    return c.json(await updateRow(sql, await permissionsOf(c, deps), actor, identifier(c.req.param('table')), idParam(c, 'id'), values));
  });

  app.post('/data/:table/:id/actions/:action', async c => {
    const actor = requireUser(c);
    const { reason } = await body(c, ActionBody);
    return c.json(await runAction(sql, await permissionsOf(c, deps), actor, identifier(c.req.param('table')), idParam(c, 'id'),
      identifier(c.req.param('action')), reason ?? null));
  });

  app.delete('/data/:table/:id', async c => {
    const actor = requireUser(c);
    await deleteRow(sql, await permissionsOf(c, deps), actor, identifier(c.req.param('table')), idParam(c, 'id'));
    return c.body(null, 204);
  });

  app.get('/events', async c => {
    const perms = await permissionsOf(c, deps);
    if (!EVENT_LIST_PERMS.some(p => perms.has(p))) throw forbidden();
    const { status, when } = query(c, z.object({ status: z.string().regex(/^[a-z_]{2,20}$/).optional(), when: z.enum(['upcoming', 'past', 'all']).default('upcoming') }));
    const rows = await sql`
      select e.id_event, e.event_title, e.event_type, e.status, e.start_datetime, e.end_datetime, e.base_price, e.currency_code,
             (select coalesce(sum(o.capacity), 0)::int from event_options o where o.id_event = e.id_event and o.status = 'active') as capacity,
             (select count(*)::int from bookings b where b.id_event = e.id_event and b.booking_status in ('pending_payment', 'confirmed', 'checked_in')) as booked,
             (select count(*)::int from bookings b where b.id_event = e.id_event and b.booking_status = 'waitlisted') as waitlisted,
             (select string_agg(cl.club_name, ', ' order by ec.is_primary desc) from event_clubs ec join clubs cl using (id_club)
               where ec.id_event = e.id_event and ec.status = 'active') as clubs
      from events e
      where ${status ? sql`e.status = ${status}` : sql`true`}
        and ${when === 'upcoming' ? sql`e.end_datetime > now()` : when === 'past' ? sql`e.end_datetime <= now()` : sql`true`}
      order by ${when === 'past' ? sql`e.start_datetime desc` : sql`e.start_datetime`} limit 300`;
    return c.json({ items: rows });
  });

  app.get('/membership-applications', async c => {
    requirePermission(await permissionsOf(c, deps), 'membership.view');
    const { status } = query(c, z.object({ status: z.string().max(20).optional() }));
    const rows = await sql`
      select ma.id_membership_application, ma.status, mt.membership_type_code, ma.motivation_text, ma.offer_text, ma.need_text,
             ma.submitted_at, ma.reviewed_at, ma.decision_note, u.id_user, u.first_name, u.last_name,
             (select count(*)::int from bookings b where b.id_user = u.id_user and b.booking_status in ('checked_in', 'completed')) as attended_events
      from membership_applications ma join membership_types mt using (id_membership_type) join users u using (id_user)
      where ${status ? sql`ma.status = ${status}` : sql`ma.status in ('submitted', 'under_review', 'waitlisted')`}
      order by ma.submitted_at nulls last limit 500`;
    return c.json({ items: rows });
  });

  app.post('/membership-applications/:id/decision', async c => {
    const userId = requireUser(c);
    const input = await body(c, Decision);
    const perms = await permissionsOf(c, deps);
    requirePermission(perms, input.decision === 'declined' ? 'membership.reject' : 'membership.approve');
    const result = await decideApplication(sql, config, userId, idParam(c, 'id'), {
      decision: input.decision, decisionNote: input.decision_note, decisionReason: input.decision_reason, waitlistUntil: input.waitlist_until,
    });
    return c.json(result);
  });

  app.post('/events', async c => {
    const userId = requireUser(c);
    const input = await body(c, NewEvent);
    const perms = await permissionsOf(c, deps);
    let status: 'draft' | 'submitted' = 'draft';
    if (!perms.has('event.create')) {
      // Scoped: a club lead/co-lead may create events for their own club, which then await Fikirhane approval.
      if (!input.club_code) throw forbidden();
      const [club] = await sql<{ id_club: string }[]>`select id_club from clubs where club_code = ${input.club_code}`;
      if (!club || !await hasClubPermission(sql, userId, club.id_club, 'event.create')) throw forbidden();
      status = 'submitted';
    }
    const id = await createEvent(sql, userId, {
      eventType: input.event_type, eventTitle: input.event_title, eventDescription: input.event_description, eventCode: input.event_code,
      startDatetime: input.start_datetime, endDatetime: input.end_datetime, basePrice: input.base_price, currencyCode: input.currency_code,
      minimumAttendees: input.minimum_attendees, networkingEnabled: input.networking_enabled, enableNeed: input.enable_need,
      enableOffer: input.enable_offer, clubCode: input.club_code,
      options: input.options.map(o => ({ locationCode: o.location_code, setupCode: o.setup_code, optionCode: o.option_code,
        optionName: o.option_name, capacity: o.capacity, bookingUnit: o.booking_unit, priceAdjustment: o.price_adjustment })),
    }, status);
    return c.json({ id_event: id, status }, 201);
  });

  app.post('/events/:id/publish', async c => {
    const userId = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'event.publish');
    await publishEvent(sql, userId, idParam(c, 'id'));
    return c.body(null, 204);
  });

  app.post('/events/:id/cancel', async c => {
    const userId = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'event.cancel');
    const { reason } = await body(c, Reason);
    return c.json(await cancelEvent(sql, config, userId, idParam(c, 'id'), reason));
  });

  app.get('/events/:id/participants', async c => {
    const userId = requireUser(c);
    const eventId = idParam(c, 'id');
    if (!await hasEventPermission(sql, userId, eventId, 'event_participants.view')) throw forbidden();
    const rows = await sql`
      select b.id_booking, b.booking_status, b.payment_status, b.final_price, b.checkin_at, u.first_name, u.last_name,
             s.seat_code, o.option_code
      from bookings b join event_options o using (id_event_option) left join users u on u.id_user = b.id_user
      left join seats s on s.id_seat = b.id_seat
      where b.id_event = ${eventId} and b.booking_status not in ('cancelled', 'expired')
      order by o.sort_order, s.sort_order nulls last, u.first_name`;
    return c.json({ items: rows });
  });

  // Door check: staff scan a booking's QR. The pass is read from the database; it opens only during its own session.
  const Token = z.object({ k: z.string().regex(/^[0-9a-f]{64}$/) });
  async function scannedPass(c: Ctx, token: string) {
    const userId = requireUser(c);
    const row = await passByToken(sql, token);
    if (!row) throw notFound('Pass');
    const perms = await permissionsOf(c, deps);
    if (!perms.has('booking.checkin') && !await hasEventPermission(sql, userId, row.id_event, 'event_attendance.manage', perms)) throw forbidden();
    return { userId, row };
  }
  app.get('/pass', async c => {
    const { k } = query(c, Token);
    const { row } = await scannedPass(c, k);
    return c.json({ pass: passInfo(row, config), verdict: verdict(row, config) });
  });
  app.post('/pass/checkin', async c => {
    const { k } = await body(c, Token);
    const { userId, row } = await scannedPass(c, k);
    const v = verdict(row, config);
    if (!v.ok) throw new ApiError(409, v.code, v.message);
    await checkIn(sql, userId, row.id_booking);
    await audit(sql, { actorUserId: userId, action: 'booking.checkin', entityType: 'booking', entityId: row.id_booking, source: 'admin_web', metadata: { via: 'qr' } });
    const after = (await passByToken(sql, k))!;
    return c.json({ pass: passInfo(after, config), verdict: { ok: true, code: 'checked_in', message: 'Giriş onaylandı.' } });
  });

  app.post('/bookings/:id/checkin', async c => {
    const userId = requireUser(c);
    const bookingId = idParam(c, 'id');
    const [b] = await sql<{ id_event: string }[]>`select id_event from bookings where id_booking = ${bookingId}`;
    if (!b) throw notFound('Booking');
    const perms = await permissionsOf(c, deps);
    if (!perms.has('booking.checkin') && !await hasEventPermission(sql, userId, b.id_event, 'event_attendance.manage', perms)) throw forbidden();
    return c.json({ booking: await checkIn(sql, userId, bookingId) });
  });

  // A one-time link staff can hand over (e.g. by WhatsApp) when email is not available. Accounts that hold any staff role
  // are excluded so this cannot be used to take over another administrator.
  app.post('/users/:id/password-reset-link', async c => {
    const actor = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'user.reset_password');
    const target = idParam(c, 'id');
    const result = await sql.begin(async tx => {
      const [user] = await tx<{ account_status: string; staff: boolean; has_password: boolean }[]>`
        select u.account_status,
               exists (select 1 from user_roles ur join roles r using (id_role) where ur.id_user = u.id_user and ur.status = 'active'
                       and (ur.expires_at is null or ur.expires_at > now()) and r.role_code <> 'USER') as staff,
               exists (select 1 from auth_identities a where a.id_user = u.id_user and a.provider = 'password' and a.status = 'active') as has_password
        from users u where u.id_user = ${target}`;
      if (!user || !user.has_password) throw notFound('Account');
      if (user.staff) throw new ApiError(403, 'staff_account', 'Staff accounts reset their password by email or the reset-password script.');
      if (user.account_status !== 'active') throw new ApiError(409, 'account_inactive', 'This account is not active.');
      const created = await createResetToken(tx, target, { channel: 'admin_link', minutes: 24 * 60, createdBy: actor });
      await audit(tx, { actorUserId: actor, action: 'user.password_reset_link', entityType: 'user', entityId: target, source: 'admin_web' });
      return created;
    });
    const base = linkBase(c, deps) ?? selfOrigin(c, config.trustProxy);
    return c.json({ url: resetUrl(base, result.token), expires_at: result.expiresAt }, 201);
  });

  app.post('/users/:id/roles', async c => {
    const actor = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'role.assign');
    const target = idParam(c, 'id');
    const input = await body(c, RoleAssign);
    await sql.begin(async tx => {
      const [role] = await tx<{ id_role: string }[]>`select id_role from roles where role_code = ${input.role_code} and status = 'active'`;
      if (!role) throw notFound('Role');
      await tx`insert into user_roles (id_user, id_role, assigned_by_user_id, expires_at, notes)
        values (${target}, ${role.id_role}, ${actor}, ${input.expires_at ?? null}, ${input.notes ?? null})`;
      await audit(tx, { actorUserId: actor, action: 'role.assign', entityType: 'user', entityId: target, source: 'admin_web',
        metadata: { role: input.role_code, expires_at: input.expires_at ?? null } });
    });
    return c.body(null, 204);
  });

  app.delete('/users/:id/roles/:role', async c => {
    const actor = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'role.revoke');
    const target = idParam(c, 'id');
    const role = code.parse(c.req.param('role'));
    await sql.begin(async tx => {
      const rows = await tx`update user_roles ur set status = 'revoked', revoked_at = now(), revoked_by_user_id = ${actor}
        from roles r where r.id_role = ur.id_role and r.role_code = ${role} and ur.id_user = ${target} and ur.status = 'active' returning 1`;
      if (!rows.length) throw notFound('Role assignment');
      await audit(tx, { actorUserId: actor, action: 'role.revoke', entityType: 'user', entityId: target, source: 'admin_web', metadata: { role } });
    });
    return c.body(null, 204);
  });

  // Finance reports and exports, for a period given as ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: this month in Istanbul).
  const PeriodQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
  const period = (c: Ctx): Period => {
    const q = query(c, PeriodQuery), month = thisMonth();
    const p = { from: q.from ?? month.from, to: q.to ?? month.to };
    if (p.from > p.to) throw badRequest('validation_failed', 'Başlangıç tarihi bitişten sonra olamaz.', [{ path: 'from', message: 'bitişten sonra' }]);
    return p;
  };
  const download = (c: Ctx, name: string, body: string) => c.body(body, 200, {
    'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' });

  app.get('/reports/finance', async c => {
    const perms = await permissionsOf(c, deps);
    requirePermission(perms, 'report.view');
    return c.json(await financeReport(sql, period(c), perms.has('account_balance.view')));
  });
  app.get('/reports/finance.csv', async c => {
    const perms = await permissionsOf(c, deps);
    requirePermission(perms, 'report.export');
    const p = period(c);
    return download(c, `finans-raporu-${p.from}-${p.to}.csv`, await financeReportCsv(sql, p, perms.has('account_balance.view')));
  });
  app.get('/export/documents.csv', async c => {
    requirePermission(await permissionsOf(c, deps), 'document.export');
    const p = period(c);
    return download(c, `belgeler-${p.from}-${p.to}.csv`, await documentsCsv(sql, p));
  });
  app.get('/export/transactions.csv', async c => {
    requirePermission(await permissionsOf(c, deps), 'transaction.export');
    const p = period(c);
    return download(c, `para-hareketleri-${p.from}-${p.to}.csv`, await transactionsCsv(sql, p));
  });

  return app;
}
