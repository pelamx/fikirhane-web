import type { Db } from '../db.ts';
import { CLUB_ROLE_PERMISSIONS, EVENT_ROLE_PERMISSIONS } from './authz.ts';

/**
 * The site's four layers. Visitor is the public site and needs nothing; member is any signed-in account; host is daily
 * operations (staff with `shell.host`, and club leads / event hosts for their own clubs and events); admin is the back
 * office (`shell.admin`). A shell decides which screens someone sees. What they may read or change inside it is still
 * decided per endpoint by permissions.
 */
export type Shell = 'member' | 'host' | 'admin';

const LEAD_CLUB_ROLES = Object.keys(CLUB_ROLE_PERMISSIONS).filter(r => CLUB_ROLE_PERMISSIONS[r].length);
const LEAD_EVENT_ROLES = Object.keys(EVENT_ROLE_PERMISSIONS).filter(r => EVENT_ROLE_PERMISSIONS[r].length);

export interface HostScope {
  clubs: { id_club: string; club_code: string; club_name: string; role_code: string; role_name: string }[];
  events: { id_event: string; event_title: string; status: string; start_datetime: string; end_datetime: string; role: string;
    booked: number; capacity: number }[];
}

/** Clubs this person helps run and the upcoming or running events they may take attendance for. */
export async function hostScope(db: Db, userId: string): Promise<HostScope> {
  const clubs = await db<HostScope['clubs']>`
    select c.id_club, c.club_code, c.club_name, r.role_code, r.role_name
    from club_users cu join clubs c using (id_club) join club_member_roles r using (id_club_member_role)
    where cu.id_user = ${userId} and cu.status = 'active' and r.status = 'active' and r.role_code = any (${LEAD_CLUB_ROLES})
    order by c.sort_order, c.club_name`;
  const events = await db<HostScope['events']>`
    with mine as (
      select eu.id_event, eu.event_user_role as role from event_users eu
      where eu.id_user = ${userId} and eu.status = 'active' and eu.event_user_role = any (${LEAD_EVENT_ROLES})
      union
      select ec.id_event, 'club' as role from event_clubs ec
      where ec.status = 'active' and ec.id_club = any (${clubs.map(c => c.id_club)}::uuid[])
    )
    select e.id_event, e.event_title, e.status, e.start_datetime, e.end_datetime, min(m.role) as role,
           (select count(*)::int from bookings b where b.id_event = e.id_event and b.booking_status in ('pending_payment', 'confirmed', 'checked_in')) as booked,
           (select coalesce(sum(o.capacity), 0)::int from event_options o where o.id_event = e.id_event and o.status = 'active') as capacity
    from mine m join events e using (id_event)
    where e.end_datetime > now() and e.status not in ('cancelled', 'archived')
    group by e.id_event order by e.start_datetime limit 100`;
  return { clubs, events };
}

export async function shellsOf(db: Db, userId: string, perms: Set<string>): Promise<Shell[]> {
  const shells: Shell[] = ['member'];
  if (perms.has('shell.host') || await leadsSomething(db, userId)) shells.push('host');
  if (perms.has('shell.admin')) shells.push('admin');
  return shells;
}

async function leadsSomething(db: Db, userId: string): Promise<boolean> {
  const [row] = await db<{ yes: boolean }[]>`
    select exists (
      select 1 from club_users cu join club_member_roles r using (id_club_member_role)
      where cu.id_user = ${userId} and cu.status = 'active' and r.status = 'active' and r.role_code = any (${LEAD_CLUB_ROLES})
    ) or exists (
      select 1 from event_users eu join events e using (id_event)
      where eu.id_user = ${userId} and eu.status = 'active' and eu.event_user_role = any (${LEAD_EVENT_ROLES})
        and e.end_datetime > now() and e.status not in ('cancelled', 'archived')
    ) as yes`;
  return row.yes;
}
