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

/** Creates (or promotes) a staff account. Elevation never happens through public registration. */
export async function ensureStaffAccount(sql: Sql, input: StaffAccount, via: string, log: (msg: string) => void = () => {}): Promise<void> {
  const email = normalizeEmail(input.email);
  const roles = input.roles?.length ? input.roles : ['FIKIRHANE_ADMIN'];
  let [row] = await sql<{ id_user: string }[]>`select id_user from auth_identities where provider = 'password' and provider_subject = ${email} and status = 'active'`;
  if (!row) {
    if (!input.password || input.password.length < 10) throw new Error('A password of at least 10 characters is needed to create a new account.');
    row = { id_user: await registerUser(sql, { firstName: input.firstName ?? 'Fikirhane', lastName: input.lastName ?? 'Admin', email, password: input.password }) };
    log(`created ${email}`);
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
