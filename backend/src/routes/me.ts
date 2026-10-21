import { Hono } from 'hono';
import { z } from 'zod';
import { unprocessable } from '../errors.ts';
import { body, idParam, requireUser, type Deps, type Env } from '../http.ts';
import { audit } from '../services/audit.ts';
import { globalPermissions, globalRoles } from '../services/authz.ts';
import { cancelBooking } from '../services/bookings.ts';
import { membershipRights, submitApplication, withdrawApplication } from '../services/membership.ts';
import { MAX_ACTIVE_INTERESTS, MAX_ACTIVE_SKILLS, setInterests, setSkills } from '../services/users.ts';

const code = z.string().regex(/^[A-Z0-9_]{2,60}$/);
const ProfilePatch = z.object({
  first_name: z.string().trim().min(1).max(50).optional(),
  last_name: z.string().trim().min(1).max(50).optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  networking_enabled: z.boolean().optional(),
  profile_visibility: z.enum(['private', 'community']).optional(),
}).strict();
const Interests = z.object({ items: z.array(z.object({ code, priority: z.int().positive().nullable().optional() })).max(MAX_ACTIVE_INTERESTS) });
const Skills = z.object({ items: z.array(z.object({
  code,
  level: z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).nullable().optional(),
  priority: z.int().positive().nullable().optional(),
})).max(MAX_ACTIVE_SKILLS) });
const Application = z.object({
  membership_type_code: code,
  motivation_text: z.string().trim().max(2000).nullable().optional(),
  offer_text: z.string().trim().max(2000).nullable().optional(),
  need_text: z.string().trim().max(2000).nullable().optional(),
});

export async function profile(deps: Deps, userId: string) {
  const [user] = await deps.sql`
    select u.id_user, u.first_name, u.last_name, u.headline, u.bio, u.profile_photo, u.networking_enabled, u.profile_visibility,
           u.account_status, e.email
    from users u left join user_emails e on e.id_user = u.id_user and e.is_primary and e.status = 'active'
    where u.id_user = ${userId}`;
  return user;
}

export function meRoutes(deps: Deps) {
  const app = new Hono<Env>();

  app.get('/', async c => {
    const userId = requireUser(c);
    const [user, rights, roles, perms, clubs, bookings] = await Promise.all([
      profile(deps, userId),
      membershipRights(deps.sql, userId, deps.config),
      globalRoles(deps.sql, userId),
      globalPermissions(deps.sql, userId),
      deps.sql`select c.club_code, r.role_code from club_users cu join clubs c using (id_club) join club_member_roles r using (id_club_member_role)
               where cu.id_user = ${userId} and cu.status = 'active' order by c.sort_order`,
      deps.sql`select b.id_booking, b.id_event, b.booking_status from bookings b join events e using (id_event)
               where b.id_user = ${userId} and b.booking_status in ('pending_payment', 'confirmed', 'checked_in', 'waitlisted')
                 and e.end_datetime > now()`,
    ]);
    return c.json({
      user,
      membership: { code: rights.code, name: rights.name, end_date: rights.endDate, discount_rate: rights.discountRate,
        reservation_window_days: rights.reservationWindowDays, max_active_bookings: rights.maxActiveBookings,
        seat_selection_enabled: rights.seatSelectionEnabled },
      roles,
      permissions: [...perms].sort(),
      clubs,
      active_bookings: bookings,
    });
  });

  app.patch('/', async c => {
    const userId = requireUser(c);
    const patch = await body(c, ProfilePatch);
    const before = await profile(deps, userId);
    await deps.sql.begin(async tx => {
      if (Object.keys(patch).length) await tx`update users set ${tx(patch)}, updated_by_user_id = ${userId} where id_user = ${userId}`;
      // Networking opt-in changes are privacy-relevant: keep a history row.
      if (patch.networking_enabled !== undefined && patch.networking_enabled !== before.networking_enabled) {
        await audit(tx, { actorUserId: userId, action: 'user.update_privacy', entityType: 'user', entityId: userId,
          changeData: { networking_enabled: { old: before.networking_enabled, new: patch.networking_enabled } } });
      }
    });
    return c.json({ user: await profile(deps, userId) });
  });

  app.get('/interests', async c => {
    const userId = requireUser(c);
    return c.json({ items: await deps.sql`select i.interest_code as code, i.interest_name as name, i.category, ui.priority
      from user_interests ui join interests i using (id_interest) where ui.id_user = ${userId} and ui.status = 'active'
      order by ui.priority nulls last, i.sort_order` });
  });
  app.put('/interests', async c => {
    const userId = requireUser(c);
    await setInterests(deps.sql, userId, (await body(c, Interests)).items);
    return c.body(null, 204);
  });

  app.get('/skills', async c => {
    const userId = requireUser(c);
    return c.json({ items: await deps.sql`select s.skill_code as code, s.skill_name as name, s.category, us.skill_level as level, us.priority
      from user_skills us join skills s using (id_skill) where us.id_user = ${userId} and us.status = 'active'
      order by us.priority nulls last, s.sort_order` });
  });
  app.put('/skills', async c => {
    const userId = requireUser(c);
    await setSkills(deps.sql, userId, (await body(c, Skills)).items);
    return c.body(null, 204);
  });

  app.get('/bookings', async c => {
    const userId = requireUser(c);
    const rows = await deps.sql`
      select b.id_booking, b.id_event, b.booking_status, b.payment_status, b.final_price, b.price_list_amount, b.discount_amount,
             b.currency_code, b.booked_at, b.cancelled_at, e.event_title, e.start_datetime, e.end_datetime, l.location_name,
             o.option_name, s.seat_code, t.table_code, (b.id_freepass is not null) as used_freepass
      from bookings b join events e using (id_event) join event_options o using (id_event_option)
      join locations l on l.id_location = o.id_location
      left join seats s on s.id_seat = b.id_seat left join tables t on t.id_table = b.id_table
      where b.id_user = ${userId}
      order by e.start_datetime desc limit 200`;
    return c.json({ items: rows });
  });

  app.post('/bookings/:id/cancel', async c => {
    const userId = requireUser(c);
    const perms = await globalPermissions(deps.sql, userId);
    const booking = await cancelBooking(deps.sql, deps.config, {
      bookingId: idParam(c, 'id'), actorUserId: userId, canCancelAny: perms.has('booking.cancel'),
    });
    return c.json({ booking });
  });

  app.get('/membership', async c => {
    const userId = requireUser(c);
    const [rights, history, applications] = await Promise.all([
      membershipRights(deps.sql, userId, deps.config),
      deps.sql`select um.id_user_membership, mt.membership_type_code, mt.membership_type_name, um.status,
                 to_char(um.start_date, 'YYYY-MM-DD') as start_date, to_char(um.end_date, 'YYYY-MM-DD') as end_date
               from user_memberships um join membership_types mt using (id_membership_type)
               where um.id_user = ${userId} order by um.start_date desc`,
      deps.sql`select ma.id_membership_application, mt.membership_type_code, ma.status, ma.submitted_at, ma.reviewed_at,
                 to_char(ma.waitlist_until, 'YYYY-MM-DD') as waitlist_until
               from membership_applications ma join membership_types mt using (id_membership_type)
               where ma.id_user = ${userId} order by ma.created_at desc`,
    ]);
    return c.json({ current: rights.code ? { code: rights.code, name: rights.name, end_date: rights.endDate } : null, history, applications });
  });

  app.post('/membership-applications', async c => {
    const userId = requireUser(c);
    const input = await body(c, Application);
    if (!input.motivation_text) throw unprocessable('motivation_required', 'Tell us briefly why you would like to join.');
    const id = await submitApplication(deps.sql, userId, {
      membershipTypeCode: input.membership_type_code, motivationText: input.motivation_text, offerText: input.offer_text, needText: input.need_text,
    });
    return c.json({ id_membership_application: id }, 201);
  });

  app.post('/membership-applications/:id/withdraw', async c => {
    const userId = requireUser(c);
    await withdrawApplication(deps.sql, userId, idParam(c, 'id'));
    return c.body(null, 204);
  });

  app.get('/freepasses', async c => {
    const userId = requireUser(c);
    const rows = await deps.sql`
      select f.freepass_code, f.freepass_type, f.valid_from, f.valid_until, f.usage_limit, f.status,
             f.usage_limit - (select count(*)::int from freepass_redemptions r where r.id_freepass = f.id_freepass and r.status = 'active') as remaining
      from freepasses f where f.id_user = ${userId} order by f.valid_until desc`;
    return c.json({ items: rows });
  });

  return app;
}
