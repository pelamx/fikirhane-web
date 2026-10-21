import { createHash, randomBytes } from 'node:crypto';
import type { Db, Sql } from '../db.ts';
import { ApiError } from '../errors.ts';
import { audit } from './audit.ts';
import { hashPassword, revokeAllSessions } from './auth.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The page that reads the token. It travels in the fragment, so it never reaches server logs or Referer headers. */
export const resetUrl = (siteUrl: string, token: string) => `${siteUrl}/uyelik/sifre/#t=${token}`;

/** Issues a one-time token and retires any earlier unused ones for the same person. */
export async function createResetToken(db: Db, userId: string, opts: { channel: 'email' | 'admin_link'; minutes: number; createdBy?: string | null }) {
  const token = randomBytes(32).toString('base64url');
  await db`update password_reset_tokens set revoked_at = now() where id_user = ${userId} and used_at is null and revoked_at is null`;
  const [row] = await db<{ expires_at: Date }[]>`
    insert into password_reset_tokens (id_user, token_hash, channel, created_by_user_id, expires_at)
    values (${userId}, ${sha256(token)}, ${opts.channel}, ${opts.createdBy ?? null}, now() + make_interval(mins => ${opts.minutes}))
    returning expires_at`;
  return { token, expiresAt: row.expires_at };
}

/** Sets the new password if the token is valid, then burns the token and signs the account out everywhere. */
export async function consumeResetToken(sql: Sql, token: string, password: string): Promise<string> {
  const secret = await hashPassword(password);
  return sql.begin(async tx => {
    const [row] = await tx<{ id_password_reset_token: string; id_user: string; channel: string }[]>`
      select t.id_password_reset_token, t.id_user, t.channel from password_reset_tokens t join users u using (id_user)
      where t.token_hash = ${sha256(token)} and t.used_at is null and t.revoked_at is null and t.expires_at > now()
        and u.account_status = 'active'
      for update of t`;
    if (!row) throw new ApiError(400, 'reset_token_invalid', 'This reset link is invalid or has expired.');
    const updated = await tx`update auth_identities set secret_hash = ${secret}, updated_at = now()
      where id_user = ${row.id_user} and provider = 'password' and status = 'active' returning 1`;
    if (!updated.length) throw new ApiError(400, 'reset_token_invalid', 'This reset link is invalid or has expired.');
    await tx`update password_reset_tokens set used_at = now() where id_password_reset_token = ${row.id_password_reset_token}`;
    await tx`update password_reset_tokens set revoked_at = now() where id_user = ${row.id_user} and used_at is null and revoked_at is null`;
    await revokeAllSessions(tx, row.id_user);
    await audit(tx, { actorUserId: row.id_user, action: 'user.password_reset', entityType: 'user', entityId: row.id_user,
      source: 'public_web', metadata: { channel: row.channel } });
    return row.id_user;
  });
}

export function resetEmail(firstName: string, url: string, minutes: number) {
  const text = `Merhaba ${firstName},\n\nFikirhane şifreni yenilemek için bu bağlantıyı aç:\n${url}\n\n`
    + `Bağlantı ${minutes} dakika geçerli ve yalnızca bir kez kullanılabilir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.\n\nFikirhane`;
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const html = `<div style="font-family:Georgia,serif;color:#29251e;max-width:520px;line-height:1.6">
<p>Merhaba ${esc(firstName)},</p><p>Fikirhane şifreni yenilemek için aşağıdaki düğmeye bas.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#a9561b;color:#fbf8f2;padding:12px 18px;text-decoration:none">Şifremi yenile</a></p>
<p style="font-size:13px;color:#746e64">Bağlantı ${minutes} dakika geçerli ve yalnızca bir kez kullanılabilir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.</p>
<p>Fikirhane</p></div>`;
  return { subject: 'Fikirhane şifreni yenile', text, html };
}
