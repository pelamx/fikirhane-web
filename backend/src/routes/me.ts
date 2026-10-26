import { Hono } from 'hono';
import { z } from 'zod';
import { unprocessable } from '../errors.ts';
import { body, clientIp, idParam, linkBase, requireUser, selfOrigin, type Deps, type Env } from '../http.ts';
import { audit } from '../services/audit.ts';
import { globalPermissions, globalRoles } from '../services/authz.ts';
import { cancelBooking } from '../services/bookings.ts';
import { addGuest, currentGuestPass } from '../services/guest-pass.ts';
import { addToTab, cancelCheckout, kitchenItem, kitchenState, setTabQuantity, startCheckout } from '../services/kitchen.ts';
import { ownPass, passInfo, pngName, qrPng, qrSvg, qrText } from '../services/pass.ts';
import { membershipRights, submitApplication, withdrawApplication } from '../services/membership.ts';
import { shellsOf } from '../services/shells.ts';
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
const Guest = z.object({
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().max(50).nullable().optional(),
  email: z.email().trim().toLowerCase().max(200).nullable().optional(),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,25}$/).nullable().optional(),
}).strict();
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
        seat_selection_enabled: rights.seatSelectionEnabled, monthly_guest_passes: rights.monthlyGuestPasses },
      roles,
      permissions: [...perms].sort(),
      shells: await shellsOf(deps.sql, userId, perms),
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

  // Entry pass: info, the QR as SVG for the page, and a PNG download named after the date and session.
  app.get('/bookings/:id/pass', async c => {
    const row = await ownPass(deps.sql, requireUser(c), idParam(c, 'id'));
    return c.json({ pass: passInfo(row, deps.config) });
  });
  app.get('/bookings/:id/qr.svg', async c => {
    const row = await ownPass(deps.sql, requireUser(c), idParam(c, 'id'));
    c.header('content-type', 'image/svg+xml; charset=utf-8');
    return c.body(await qrSvg(qrText(row, linkBase(c, deps) ?? selfOrigin(c, deps.config.trustProxy))));
  });
  app.get('/bookings/:id/qr.png', async c => {
    const row = await ownPass(deps.sql, requireUser(c), idParam(c, 'id'));
    const png = await qrPng(qrText(row, linkBase(c, deps) ?? selfOrigin(c, deps.config.trustProxy)));
    c.header('content-type', 'image/png');
    c.header('content-disposition', `attachment; filename="${pngName(row)}"`);
    return c.body(new Uint8Array(png));
  });

  app.get('/bookings', async c => {
    const userId = requireUser(c);
    const rows = await deps.sql`
      select b.id_booking, b.id_event, b.booking_status, b.payment_status, b.final_price, b.price_list_amount, b.discount_amount,
             b.currency_code, b.booked_at, b.cancelled_at, e.event_title, e.start_datetime, e.end_datetime, l.location_name,
             o.option_name, s.seat_code, t.table_code, (b.id_freepass is not null) as used_freepass,
             (b.id_user is null) as is_guest, b.guest_first_name, b.guest_last_name
      from bookings b join events e using (id_event) join event_options o using (id_event_option)
      join locations l on l.id_location = o.id_location
      left join seats s on s.id_seat = b.id_seat left join tables t on t.id_table = b.id_table
      where b.id_user = ${userId} or (b.id_user is null and b.booked_by_user_id = ${userId})
      order by e.start_datetime desc limit 200`;
    return c.json({ items: rows });
  });

  // Plus: this month's guest pass (code and what is left), and adding a friend to one's own booking with it.
  app.get('/guest-pass', async c => {
    const pass = await currentGuestPass(deps.sql, requireUser(c), deps.config);
    return c.json({ pass: pass && { code: pass.code, valid_until: pass.valid_until, usage_limit: pass.usage_limit, remaining: pass.remaining } });
  });

  app.post('/bookings/:id/guest', async c => {
    const userId = requireUser(c);
    const input = await body(c, Guest);
    if (!input.email && !input.phone) throw unprocessable('guest_contact_required', 'Add your guest’s e-mail or phone.');
    const booking = await addGuest(deps.sql, deps.config, { userId, bookingId: idParam(c, 'id'),
      guest: { firstName: input.first_name, lastName: input.last_name, email: input.email, phone: input.phone } });
    return c.json({ booking }, 201);
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

  // Kitchen (mutfak): the person's tab, a scanned barcode's product, adding and changing lines, and paying online.
  const ItemCode = z.object({ item_code: code });
  app.get('/kitchen', async c => c.json(await kitchenState(deps.sql, deps.config, requireUser(c))));
  app.get('/kitchen/barcode/:barcode', async c => {
    requireUser(c);
    const barcode = c.req.param('barcode');
    if (!/^[0-9]{8,14}$/.test(barcode)) return c.json({ error: { code: 'not_found', message: 'Ürün bulunamadı.' } }, 404);
    return c.json(await kitchenItem(deps.sql, barcode));
  });
  app.post('/kitchen/lines', async c => {
    const userId = requireUser(c);
    await addToTab(deps.sql, userId, (await body(c, ItemCode)).item_code);
    return c.json(await kitchenState(deps.sql, deps.config, userId), 201);
  });
  app.patch('/kitchen/lines/:id', async c => {
    const userId = requireUser(c);
    const { quantity } = await body(c, z.object({ quantity: z.int().min(0).max(20) }));
    await setTabQuantity(deps.sql, userId, idParam(c, 'id'), quantity);
    return c.json(await kitchenState(deps.sql, deps.config, userId));
  });
  app.post('/kitchen/checkout', async c => {
    const userId = requireUser(c);
    const origin = linkBase(c, deps) ?? selfOrigin(c, deps.config.trustProxy);
    return c.json(await startCheckout(deps.sql, deps.config, userId, { ip: clientIp(c, deps.config.trustProxy), origin }));
  });
  app.post('/kitchen/checkout/cancel', async c => {
    const userId = requireUser(c);
    await cancelCheckout(deps.sql, userId);
    return c.json(await kitchenState(deps.sql, deps.config, userId));
  });

  return app;
}
