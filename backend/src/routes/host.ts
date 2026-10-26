import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, forbidden, notFound } from '../errors.ts';
import { body, idParam, permissionsOf, query, requireUser, type Deps, type Env } from '../http.ts';
import { audit } from '../services/audit.ts';
import { hasClubPermission, requirePermission } from '../services/authz.ts';
import { cafeteriaCounter, cafeteriaSale } from '../services/cafeteria.ts';
import { closeTabAtDesk, openTabs } from '../services/kitchen.ts';
import { hostScope, shellsOf } from '../services/shells.ts';

/**
 * Host shell endpoints: what a club lead or event host is responsible for. Staff use the existing /api/admin endpoints
 * from the host shell too; those check their own permissions.
 */
export function hostRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const { sql } = deps;

  app.use('*', async (c, next) => {
    const userId = requireUser(c);
    if (!(await shellsOf(sql, userId, await permissionsOf(c, deps))).includes('host')) {
      throw new ApiError(403, 'shell_forbidden', 'This account has no access to the host shell.');
    }
    await next();
  });

  app.get('/scope', async c => c.json(await hostScope(sql, requireUser(c))));

  app.get('/clubs/:id/members', async c => {
    const userId = requireUser(c);
    const clubId = idParam(c, 'id');
    if (!await hasClubPermission(sql, userId, clubId, 'club_members.view')) throw forbidden();
    const rows = await sql`
      select cu.id_club_user, u.first_name, u.last_name, r.role_code, r.role_name, cu.club_level, cu.start_date
      from club_users cu join users u using (id_user) join club_member_roles r using (id_club_member_role)
      where cu.id_club = ${clubId} and cu.status = 'active'
      order by r.role_rank desc, cu.start_date, u.first_name`;
    return c.json({ items: rows });
  });

  // Visit requests from "Tur planla", oldest preferred date first among the open ones.
  const TourUpdate = z.object({
    status: z.enum(['new', 'contacted', 'scheduled', 'visited', 'cancelled']),
    staff_note: z.string().trim().max(1000).nullable().optional(),
  });
  app.get('/tours', async c => {
    requirePermission(await permissionsOf(c, deps), 'tour.view');
    const { durum } = query(c, z.object({ durum: z.enum(['acik', 'kapali']).default('acik') }));
    const open = durum === 'acik';
    const rows = await sql`
      select t.id_tour_request, t.first_name, t.contact_email, t.contact_phone, t.preferred_date, t.preferred_slot, t.interests, t.note,
             t.status, t.staff_note, t.created_at, t.updated_at, h.first_name as handled_by
      from tour_requests t left join users h on h.id_user = t.handled_by_user_id
      where ${open ? sql`t.status in ('new', 'contacted', 'scheduled')` : sql`t.status in ('visited', 'cancelled')`}
      order by ${open ? sql`t.preferred_date, t.created_at` : sql`t.updated_at desc`} limit 300`;
    return c.json({ items: rows });
  });
  app.patch('/tours/:id', async c => {
    const userId = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'tour.manage');
    const input = await body(c, TourUpdate);
    const id = idParam(c, 'id');
    const [row] = await sql<{ status: string }[]>`
      update tour_requests set status = ${input.status}, handled_by_user_id = ${userId},
        staff_note = ${input.staff_note === undefined ? sql`staff_note` : input.staff_note || null}
      where id_tour_request = ${id} returning status`;
    if (!row) throw notFound('Tour request');
    await audit(sql, { actorUserId: userId, action: 'tour.update', entityType: 'tour_request', entityId: id, source: 'admin_web', metadata: { status: input.status } });
    return c.json(row);
  });

  // Cafeteria counter: the menu with today's sales, and one sale (receipt, stock, payment and allocation together).
  const Sale = z.object({
    lines: z.array(z.object({ id_item: z.uuid(), quantity: z.number().positive().max(1000).multipleOf(0.001) })).min(1).max(30),
    payment_method: z.enum(['cash', 'card']),
  });
  app.get('/cafeteria', async c => {
    requirePermission(await permissionsOf(c, deps), 'cafeteria_sale.create');
    return c.json(await cafeteriaCounter(sql));
  });
  app.post('/cafeteria/sales', async c => {
    const userId = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'cafeteria_sale.create');
    return c.json(await cafeteriaSale(sql, userId, await body(c, Sale)), 201);
  });

  // Kitchen tabs (mutfak): the open ones, and closing one at the desk.
  app.get('/kitchen/tabs', async c => {
    requirePermission(await permissionsOf(c, deps), 'cafeteria_sale.create');
    return c.json({ items: await openTabs(sql) });
  });
  app.post('/kitchen/tabs/:id/close', async c => {
    const userId = requireUser(c);
    requirePermission(await permissionsOf(c, deps), 'cafeteria_sale.create');
    const { payment_method } = await body(c, z.object({ payment_method: z.enum(['cash', 'card']) }));
    return c.json(await closeTabAtDesk(sql, userId, idParam(c, 'id'), payment_method));
  });
  return app;
}
