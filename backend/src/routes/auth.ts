import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { ApiError, unauthorized } from '../errors.ts';
import { body, sessionToken, SESSION_COOKIE, type Deps, type Env, type Ctx } from '../http.ts';
import { createSession, dummyPasswordHash, normalizeEmail, RateLimiter, revokeSession, verifyPassword } from '../services/auth.ts';
import { registerUser } from '../services/users.ts';

const name = z.string().trim().min(1).max(50);
const password = z.string().min(10, 'Use at least 10 characters.').max(200);
const code = z.string().regex(/^[A-Z0-9_]{2,60}$/);

const Register = z.object({
  first_name: name,
  last_name: name,
  email: z.email().max(254),
  password,
  club_codes: z.array(code).max(20).optional(),
  interest_codes: z.array(code).max(10).optional(),
  acquisition: z.object({
    source: z.string().max(40).optional(),
    medium: z.string().max(60).optional(),
    landing_source: z.string().max(100).optional(),
    utm_source: z.string().max(100).optional(),
    utm_medium: z.string().max(100).optional(),
    utm_campaign: z.string().max(100).optional(),
    utm_content: z.string().max(100).optional(),
    utm_term: z.string().max(100).optional(),
  }).optional(),
});
const Login = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

export function authRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const attempts = new RateLimiter(deps.config.loginAttemptsPer15Min, 15 * 60_000);
  const signups = new RateLimiter(deps.config.signupsPerHour, 60 * 60_000);
  // Forwarded headers are only trusted behind a known reverse proxy (TRUST_PROXY=true); otherwise they are spoofable.
  const ip = (c: Ctx) => {
    if (deps.config.trustProxy) return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
  };

  async function startSession(c: Ctx, userId: string) {
    const token = await createSession(deps.sql, userId, deps.config.sessionDays, c.req.header('user-agent') ?? null);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true, secure: deps.config.cookieSecure, sameSite: deps.config.cookieSameSite, path: '/',
      maxAge: deps.config.sessionDays * 86_400,
    });
    return token;
  }

  app.post('/register', async c => {
    if (!signups.allow(ip(c))) throw new ApiError(429, 'rate_limited', 'Too many sign-ups from this network. Try again later.');
    const input = await body(c, Register);
    const acq = input.acquisition;
    const userId = await registerUser(deps.sql, {
      firstName: input.first_name, lastName: input.last_name, email: input.email, password: input.password,
      clubCodes: input.club_codes, interestCodes: input.interest_codes,
      acquisition: acq && { source: acq.source, medium: acq.medium, landingSource: acq.landing_source,
        utm: { utm_source: acq.utm_source, utm_medium: acq.utm_medium, utm_campaign: acq.utm_campaign, utm_content: acq.utm_content, utm_term: acq.utm_term } },
    });
    const token = await startSession(c, userId);
    return c.json({ user_id: userId, token }, 201);
  });

  app.post('/login', async c => {
    const input = await body(c, Login);
    const email = normalizeEmail(input.email);
    if (!attempts.allow(`${ip(c)}|${email}`)) throw new ApiError(429, 'rate_limited', 'Too many attempts. Try again in a few minutes.');
    const [identity] = await deps.sql<{ id_user: string; secret_hash: string; account_status: string }[]>`
      select a.id_user, a.secret_hash, u.account_status from auth_identities a join users u using (id_user)
      where a.provider = 'password' and a.provider_subject = ${email} and a.status = 'active'`;
    const ok = await verifyPassword(input.password, identity?.secret_hash ?? await dummyPasswordHash());
    if (!identity || !ok) throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
    if (identity.account_status !== 'active') throw new ApiError(403, 'account_inactive', 'This account is not active.');
    await deps.sql`update auth_identities set last_login_at = now() where provider = 'password' and provider_subject = ${email}`;
    const token = await startSession(c, identity.id_user);
    return c.json({ user_id: identity.id_user, token });
  });

  app.post('/logout', async c => {
    const token = sessionToken(c);
    if (!token) throw unauthorized();
    await revokeSession(deps.sql, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: deps.config.cookieSecure, sameSite: deps.config.cookieSameSite });
    return c.body(null, 204);
  });

  return app;
}
