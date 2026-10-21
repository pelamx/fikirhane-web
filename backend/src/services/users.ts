import { inTx, type Db } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { audit } from './audit.ts';
import { hashPassword, normalizeEmail } from './auth.ts';

export interface Registration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  clubCodes?: string[];
  interestCodes?: string[];
  acquisition?: { source?: string; medium?: string | null; utm?: Record<string, string | undefined>; landingSource?: string | null };
}

const ACQ_SOURCES = new Set(['organic', 'instagram', 'linkedin', 'google', 'email', 'referral', 'invitation', 'freepass', 'partner',
  'university', 'corporate', 'walk_in', 'event', 'other']);

/**
 * Public registration only ever creates a normal user with the USER role (no elevation), plus contact email,
 * password identity, first-touch acquisition snapshot, optional interests and club follows.
 */
export async function registerUser(db: Db, input: Registration): Promise<string> {
  const email = normalizeEmail(input.email);
  const secret = await hashPassword(input.password);
  return inTx(db, async tx => {
    const [taken] = await tx`select 1 from auth_identities where provider = 'password' and provider_subject = ${email} and status = 'active'`;
    if (taken) throw conflict('email_taken', 'An account with this email already exists.');
    const [user] = await tx<{ id_user: string }[]>`
      insert into users (first_name, last_name) values (${input.firstName.trim()}, ${input.lastName.trim()}) returning id_user`;
    const id = user.id_user;
    await tx`update users set created_by_user_id = ${id}, updated_by_user_id = ${id} where id_user = ${id}`;
    await tx`insert into user_emails (id_user, email, is_primary, created_by_user_id, updated_by_user_id) values (${id}, ${email}, true, ${id}, ${id})`;
    await tx`insert into auth_identities (id_user, provider, provider_subject, secret_hash) values (${id}, 'password', ${email}, ${secret})`;
    await tx`insert into user_roles (id_user, id_role, notes) select ${id}, id_role, 'Assigned at registration' from roles where role_code = 'USER'`;

    const acq = input.acquisition ?? {};
    const utm = acq.utm ?? {};
    const source = acq.source && ACQ_SOURCES.has(acq.source) ? acq.source : utm.utm_source && ACQ_SOURCES.has(utm.utm_source) ? utm.utm_source : 'organic';
    await tx`insert into user_acquisitions (id_user, source, medium, landing_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        first_touch_at, created_by_user_id)
      values (${id}, ${source}, ${acq.medium ?? utm.utm_medium ?? null}, ${acq.landingSource ?? null}, ${utm.utm_source ?? null},
        ${utm.utm_medium ?? null}, ${utm.utm_campaign ?? null}, ${utm.utm_content ?? null}, ${utm.utm_term ?? null}, now(), ${id})`;

    if (input.interestCodes?.length) await setInterests(tx, id, input.interestCodes.map((code, i) => ({ code, priority: i + 1 })));
    for (const code of input.clubCodes ?? []) await joinClub(tx, id, code);
    await audit(tx, { actorUserId: id, action: 'user.create', entityType: 'user', entityId: id, source: 'public_web' });
    return id;
  });
}

export const MAX_ACTIVE_INTERESTS = 10;
export const MAX_ACTIVE_SKILLS = 12;

/** Replaces the active interest set (UINT-D02..D04); removed interests become inactive, not deleted. */
export async function setInterests(db: Db, userId: string, items: { code: string; priority?: number | null }[]) {
  return inTx(db, async tx => {
    const codes = [...new Set(items.map(i => i.code))];
    const rows = codes.length
      ? await tx<{ id_interest: string; interest_code: string }[]>`select id_interest, interest_code from interests
          where interest_code in ${tx(codes)} and status = 'active'`
      : [];
    if (rows.length !== codes.length) throw notFound('Interest');
    const byCode = new Map(rows.map(r => [r.interest_code, r.id_interest]));
    const keep = rows.map(r => r.id_interest);
    await tx`update user_interests set status = 'inactive', updated_by_user_id = ${userId}
      where id_user = ${userId} and status = 'active' ${keep.length ? tx`and id_interest not in ${tx(keep)}` : tx``}`;
    for (const item of items) {
      const idInterest = byCode.get(item.code)!;
      await tx`insert into user_interests (id_user, id_interest, priority, created_by_user_id, updated_by_user_id)
        values (${userId}, ${idInterest}, ${item.priority ?? null}, ${userId}, ${userId})
        on conflict (id_user, id_interest) where status = 'active' do update set priority = excluded.priority, updated_by_user_id = excluded.updated_by_user_id`;
    }
  });
}

export async function setSkills(db: Db, userId: string, items: { code: string; level?: string | null; priority?: number | null }[]) {
  return inTx(db, async tx => {
    const codes = [...new Set(items.map(i => i.code))];
    const rows = codes.length
      ? await tx<{ id_skill: string; skill_code: string }[]>`select id_skill, skill_code from skills where skill_code in ${tx(codes)} and status = 'active'`
      : [];
    if (rows.length !== codes.length) throw notFound('Skill');
    const byCode = new Map(rows.map(r => [r.skill_code, r.id_skill]));
    const keep = rows.map(r => r.id_skill);
    await tx`update user_skills set status = 'inactive', updated_by_user_id = ${userId}
      where id_user = ${userId} and status = 'active' ${keep.length ? tx`and id_skill not in ${tx(keep)}` : tx``}`;
    for (const item of items) {
      await tx`insert into user_skills (id_user, id_skill, skill_level, priority, created_by_user_id, updated_by_user_id)
        values (${userId}, ${byCode.get(item.code)!}, ${item.level ?? null}, ${item.priority ?? null}, ${userId}, ${userId})
        on conflict (id_user, id_skill) where status = 'active'
        do update set skill_level = excluded.skill_level, priority = excluded.priority, updated_by_user_id = excluded.updated_by_user_id`;
    }
  });
}

/** Self-join as MEMBER (CLU-D05: an explicit user opt-in). Idempotent. */
export async function joinClub(db: Db, userId: string, clubCode: string) {
  const [club] = await db<{ id_club: string }[]>`select id_club from clubs where club_code = ${clubCode} and status = 'active'`;
  if (!club) throw notFound('Club');
  await db`insert into club_users (id_club, id_user, id_club_member_role, joined_source, created_by_user_id, updated_by_user_id)
    select ${club.id_club}, ${userId}, id_club_member_role, 'self_join', ${userId}, ${userId} from club_member_roles where role_code = 'MEMBER'
    on conflict (id_user, id_club) where status = 'active' do nothing`;
}

/** Leaving closes the relation (CLU-D06). Management roles must be handed over by an admin first. */
export async function leaveClub(db: Db, userId: string, clubCode: string) {
  const [row] = await db<{ id_club_user: string; role_code: string }[]>`
    select cu.id_club_user, r.role_code from club_users cu join clubs c using (id_club) join club_member_roles r using (id_club_member_role)
    where c.club_code = ${clubCode} and cu.id_user = ${userId} and cu.status = 'active'`;
  if (!row) return;
  if (row.role_code !== 'MEMBER') throw conflict('management_role', 'Ask a Fikirhane admin to hand over your club role before leaving.');
  await db`update club_users set status = 'ended', end_date = current_date, updated_by_user_id = ${userId} where id_club_user = ${row.id_club_user}`;
}
