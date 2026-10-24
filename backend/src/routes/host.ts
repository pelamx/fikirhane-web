import { Hono } from 'hono';
import { ApiError, forbidden } from '../errors.ts';
import { idParam, permissionsOf, requireUser, type Deps, type Env } from '../http.ts';
import { hasClubPermission } from '../services/authz.ts';
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

  return app;
}
