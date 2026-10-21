import type { Db } from '../db.ts';
import { forbidden } from '../errors.ts';

/**
 * Effective global permissions: union of active, unexpired USER_ROLES of active ROLES with active
 * ROLE_PERMISSIONS of active PERMISSIONS (USRROLE-D07..D09, ROLEPERM-D03/D04, PERM-D09). Explicit allow only.
 */
export async function globalPermissions(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db<{ permission_code: string }[]>`
    select distinct p.permission_code
    from user_roles ur
    join roles r on r.id_role = ur.id_role and r.status = 'active'
    join role_permissions rp on rp.id_role = r.id_role and rp.status = 'active'
    join permissions p on p.id_permission = rp.id_permission and p.status = 'active'
    where ur.id_user = ${userId} and ur.status = 'active' and (ur.expires_at is null or ur.expires_at > now())`;
  return new Set(rows.map(r => r.permission_code));
}

export async function globalRoles(db: Db, userId: string): Promise<string[]> {
  const rows = await db<{ role_code: string }[]>`
    select r.role_code from user_roles ur join roles r using (id_role)
    where ur.id_user = ${userId} and ur.status = 'active' and r.status = 'active'
      and (ur.expires_at is null or ur.expires_at > now())
    order by r.sort_order`;
  return rows.map(r => r.role_code);
}

/**
 * Scoped role -> permission mapping kept in code for V1 (ROLE_PERMISSIONS rule 15, CMR-D08, EVUSR rule 10).
 * A scoped permission is valid only inside the club / event it was granted for.
 */
export const CLUB_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  CLUB_LEAD: ['club.update', 'club_members.view', 'club_members.manage', 'club_analytics.view', 'event.create', 'event.update_details',
    'event_participants.view', 'event_attendance.manage'],
  CO_LEAD: ['club_members.view', 'event.create', 'event.update_details', 'event_participants.view'],
  MODERATOR: ['club_members.view', 'event_participants.view', 'event_attendance.manage'],
  MEMBER: [],
  SPONSOR_REPRESENTATIVE: [],
};

export const EVENT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  tutor: ['event_participants.view', 'event_attendance.manage'],
  facilitator: ['event_participants.view', 'event_attendance.manage'],
  moderator: ['event_participants.view', 'event_attendance.manage'],
  host: ['event_participants.view', 'event_attendance.manage'],
  staff: ['event_participants.view', 'event_attendance.manage'],
  speaker: [],
};

export async function hasClubPermission(db: Db, userId: string, clubId: string, permission: string): Promise<boolean> {
  const rows = await db<{ role_code: string }[]>`
    select r.role_code from club_users cu join club_member_roles r using (id_club_member_role)
    where cu.id_user = ${userId} and cu.id_club = ${clubId} and cu.status = 'active' and r.status = 'active'`;
  return rows.some(r => CLUB_ROLE_PERMISSIONS[r.role_code]?.includes(permission));
}

/** Global permission, or the event's role holders, or management roles of any active club linked to the event. */
export async function hasEventPermission(db: Db, userId: string, eventId: string, permission: string, perms?: Set<string>): Promise<boolean> {
  if ((perms ?? await globalPermissions(db, userId)).has(permission)) return true;
  const eventRoles = await db<{ event_user_role: string }[]>`
    select event_user_role from event_users where id_event = ${eventId} and id_user = ${userId} and status = 'active'`;
  if (eventRoles.some(r => EVENT_ROLE_PERMISSIONS[r.event_user_role]?.includes(permission))) return true;
  const clubs = await db<{ id_club: string }[]>`select id_club from event_clubs where id_event = ${eventId} and status = 'active'`;
  for (const c of clubs) if (await hasClubPermission(db, userId, c.id_club, permission)) return true;
  return false;
}

export function requirePermission(perms: Set<string>, permission: string): void {
  if (!perms.has(permission)) throw forbidden();
}
