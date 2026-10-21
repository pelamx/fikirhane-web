// Sets a new password for an existing account and signs it out everywhere. There is no self-service reset yet.
// Usage: NEW_PASSWORD=... npm run reset-password -- user@example.com
import { createDb } from '../src/db.ts';
import { audit } from '../src/services/audit.ts';
import { hashPassword, normalizeEmail, revokeAllSessions } from '../src/services/auth.ts';

const [emailArg] = process.argv.slice(2);
const password = process.env.NEW_PASSWORD;
if (!emailArg || !password || password.length < 10) {
  console.error('Usage: NEW_PASSWORD=<at least 10 chars> npm run reset-password -- <email>');
  process.exit(1);
}
const sql = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane', 1);
try {
  const email = normalizeEmail(emailArg);
  const secret = await hashPassword(password);
  await sql.begin(async tx => {
    const [row] = await tx<{ id_user: string }[]>`update auth_identities set secret_hash = ${secret}
      where provider = 'password' and provider_subject = ${email} and status = 'active' returning id_user`;
    if (!row) throw new Error(`No active password account for ${email}.`);
    await revokeAllSessions(tx, row.id_user);
    await audit(tx, { actorUserId: null, actorType: 'system', action: 'user.password_reset', entityType: 'user', entityId: row.id_user,
      source: 'integration', metadata: { via: 'reset-password' } });
  });
  console.log(`password updated for ${email}; existing sessions were signed out`);
} finally {
  await sql.end();
}
