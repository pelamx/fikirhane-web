import { Hono } from 'hono';
import { z } from 'zod';
import { forbidden, notFound } from '../errors.ts';
import { body, idParam, permissionsOf, query, requireUser, type Deps, type Env } from '../http.ts';
import { audit } from '../services/audit.ts';
import { hasClubPermission, hasEventPermission, requirePermission } from '../services/authz.ts';
import { checkIn } from '../services/bookings.ts';
import { cancelEvent, createEvent, publishEvent } from '../services/events.ts';
import { decideApplication } from '../services/membership.ts';

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
const RoleAssign = z.object({ role_code: code, expires_at: z.iso.datetime({ offset: true }).nullable().optional(), notes: z.string().max(500).nullable().optional() });

/** Back-office endpoints. Every handler checks permission on the server (PERM-D10) and audits critical actions. */
export function adminRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const { sql, config } = deps;

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

  app.post('/bookings/:id/checkin', async c => {
    const userId = requireUser(c);
    const bookingId = idParam(c, 'id');
    const [b] = await sql<{ id_event: string }[]>`select id_event from bookings where id_booking = ${bookingId}`;
    if (!b) throw notFound('Booking');
    const perms = await permissionsOf(c, deps);
    if (!perms.has('booking.checkin') && !await hasEventPermission(sql, userId, b.id_event, 'event_attendance.manage', perms)) throw forbidden();
    return c.json({ booking: await checkIn(sql, userId, bookingId) });
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

  return app;
}
