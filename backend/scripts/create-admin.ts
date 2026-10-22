// Creates (or promotes) a Fikirhane admin account. Elevation never happens through public registration.
// Usage: ADMIN_PASSWORD=... npm run create-admin -- admin@example.com "First" "Last" [ROLE_CODE ...]
import { createDb } from '../src/db.ts';
import { ensureStaffAccount } from '../src/services/bootstrap.ts';

const [emailArg, first, last, ...roleArgs] = process.argv.slice(2);
if (!emailArg) {
  console.error('Usage: ADMIN_PASSWORD=... npm run create-admin -- <email> [first] [last] [ROLE ...]');
  process.exit(1);
}
const sql = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane', 1);
try {
  await ensureStaffAccount(sql, { email: emailArg, firstName: first, lastName: last, password: process.env.ADMIN_PASSWORD, roles: roleArgs },
    'create-admin script', console.log);
} finally {
  await sql.end();
}
