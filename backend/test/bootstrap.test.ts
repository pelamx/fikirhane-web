import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ensureStaffAccount, splitFullName } from '../src/services/bootstrap.ts';
import { setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

async function nameOf(email: string) {
  const [row] = await env.sql<{ first_name: string; last_name: string }[]>`select u.first_name, u.last_name from users u
    join auth_identities a using (id_user) where a.provider = 'password' and a.provider_subject = ${email}`;
  return `${row.first_name} ${row.last_name}`;
}

describe('bootstrap admin', () => {
  test('splits "Ad Soyad" on the last word and needs two words', () => {
    assert.deepEqual(splitFullName('  Ayşe  Nur Yılmaz '), { firstName: 'Ayşe Nur', lastName: 'Yılmaz' });
    assert.equal(splitFullName('Ayşe'), null);
    assert.equal(splitFullName(undefined), null);
  });

  test('a placeholder admin gets its name later, but a real name is never overwritten', async () => {
    const email = 'boot@example.com', password = 'boot-password-123';
    await ensureStaffAccount(env.sql, { email, password }, 'test');
    assert.equal(await nameOf(email), 'Fikirhane Admin');

    await ensureStaffAccount(env.sql, { email, firstName: 'Ayşe', lastName: 'Yılmaz' }, 'test');
    assert.equal(await nameOf(email), 'Ayşe Yılmaz');

    await ensureStaffAccount(env.sql, { email, firstName: 'Başka', lastName: 'Biri' }, 'test');
    assert.equal(await nameOf(email), 'Ayşe Yılmaz');

    const [{ n }] = await env.sql<{ n: number }[]>`select count(*)::int as n from user_roles ur join roles r using (id_role)
      join auth_identities a using (id_user) where a.provider_subject = ${email} and r.role_code = 'FIKIRHANE_ADMIN' and ur.status = 'active'`;
    assert.equal(n, 1);
  });
});
