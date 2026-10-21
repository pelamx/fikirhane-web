// Creates (or promotes) a Fikirhane admin account. Elevation never happens through public registration.
// Usage: ADMIN_PASSWORD=... npm run create-admin -- admin@example.com "First" "Last" [ROLE_CODE ...]
import { createDb } from '../src/db.ts';
import { audit } from '../src/services/audit.ts';
import { normalizeEmail } from '../src/services/auth.ts';
import { registerUser } from '../src/services/users.ts';

const [emailArg, first = 'Fikirhane', last = 'Admin', ...roleArgs] = process.argv.slice(2);
const roles = roleArgs.length ? roleArgs : ['FIKIRHANE_ADMIN'];
if (!emailArg) {
  console.error('Usage: ADMIN_PASSWORD=... npm run create-admin -- <email> [first] [last] [ROLE ...]');
  process.exit(1);
}
const sql = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane', 1);
try {
  const email = normalizeEmail(emailArg);
  let [row] = await sql<{ id_user: string }[]>`select id_user from auth_identities where provider = 'password' and provider_subject = ${email} and status = 'active'`;
  if (!row) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 10) throw new Error('Set ADMIN_PASSWORD (at least 10 characters) to create a new account.');
    row = { id_user: await registerUser(sql, { firstName: first, lastName: last, email, password }) };
    console.log(`created ${email}`);
  }
  for (const code of roles) {
    await sql.begin(async tx => {
      const inserted = await tx`insert into user_roles (id_user, id_role, notes)
        select ${row.id_user}, id_role, 'Granted by create-admin script' from roles where role_code = ${code} and status = 'active'
        on conflict (id_user, id_role) where status = 'active' do nothing returning 1`;
      if (inserted.length) await audit(tx, { actorUserId: null, actorType: 'system', action: 'role.assign', entityType: 'user',
        entityId: row.id_user, source: 'integration', metadata: { role: code, via: 'create-admin' } });
    });
    console.log(`${email} has role ${code}`);
  }
} finally {
  await sql.end();
}
