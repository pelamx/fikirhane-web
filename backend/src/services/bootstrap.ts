import type { Sql } from '../db.ts';
import { audit } from './audit.ts';
import { normalizeEmail } from './auth.ts';
import { registerUser } from './users.ts';

export interface StaffAccount {
  email: string;
  firstName?: string;
  lastName?: string;
  /** Only used when the account does not exist yet; an existing account keeps its password. */
  password?: string;
  roles?: string[];
}

/** Name given to a staff account created without one; the only name ensureStaffAccount ever replaces. */
export const PLACEHOLDER_NAME = { firstName: 'Fikirhane', lastName: 'Admin' } as const;

/** "Ad Soyad" → first and last name (the last word is the last name); null unless there are at least two words. */
export function splitFullName(full: string | undefined): { firstName: string; lastName: string } | null {
  const words = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return { firstName: words.slice(0, -1).join(' ').slice(0, 50), lastName: words.at(-1)!.slice(0, 50) };
}

/**
 * Creates (or promotes) a staff account. Elevation never happens through public registration.
 * An existing account keeps its password; its name is only filled in while it is still the placeholder.
 */
export async function ensureStaffAccount(sql: Sql, input: StaffAccount, via: string, log: (msg: string) => void = () => {}): Promise<void> {
  const email = normalizeEmail(input.email);
  const roles = input.roles?.length ? input.roles : ['FIKIRHANE_ADMIN'];
  const named = !!(input.firstName?.trim() && input.lastName?.trim());
  let [row] = await sql<{ id_user: string }[]>`select id_user from auth_identities where provider = 'password' and provider_subject = ${email} and status = 'active'`;
  if (!row) {
    if (!input.password || input.password.length < 10) throw new Error('A password of at least 10 characters is needed to create a new account.');
    const name = named ? { firstName: input.firstName!, lastName: input.lastName! } : PLACEHOLDER_NAME;
    row = { id_user: await registerUser(sql, { ...name, email, password: input.password }) };
    log(`created ${email}`);
  } else if (named) {
    await sql.begin(async tx => {
      const renamed = await tx`update users set first_name = ${input.firstName!.trim()}, last_name = ${input.lastName!.trim()}, updated_at = now()
        where id_user = ${row.id_user} and first_name = ${PLACEHOLDER_NAME.firstName} and last_name = ${PLACEHOLDER_NAME.lastName} returning 1`;
      if (renamed.length) {
        await audit(tx, { actorUserId: null, actorType: 'system', action: 'user.update', entityType: 'user', entityId: row.id_user,
          source: 'integration', metadata: { fields: ['first_name', 'last_name'], via } });
        log(`${email} renamed from the placeholder name`);
      }
    });
  }
  for (const code of roles) {
    await sql.begin(async tx => {
      const inserted = await tx`insert into user_roles (id_user, id_role, notes)
        select ${row.id_user}, id_role, ${`Granted by ${via}`} from roles where role_code = ${code} and status = 'active'
        on conflict (id_user, id_role) where status = 'active' do nothing returning 1`;
      if (inserted.length) await audit(tx, { actorUserId: null, actorType: 'system', action: 'role.assign', entityType: 'user',
        entityId: row.id_user, source: 'integration', metadata: { role: code, via } });
    });
    log(`${email} has role ${code}`);
  }
}
