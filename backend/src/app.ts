import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError, fromPgError } from './errors.ts';
import { selfOrigin, sessionToken, type Deps, type Env } from './http.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { meRoutes } from './routes/me.ts';
import { resolveSession } from './services/auth.ts';
import { staticSite } from './static.ts';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp(deps: Deps) {
  const app = new Hono<Env>();
  const allowed = new Set(deps.config.corsOrigins);

  app.use('*', async (c, next) => {
    c.set('requestId', randomUUID());
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'strict-origin-when-cross-origin');
    c.header('x-frame-options', 'DENY');
  });

  app.use('/api/*', cors({
    origin: origin => (allowed.has(origin) ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['content-type', 'authorization'],
    maxAge: 600,
  }));

  app.use('/api/*', async (c, next) => {
    c.header('cache-control', 'no-store');
    const viaCookie = !c.req.header('authorization');
    // CSRF: cookie-authenticated writes must come from this origin or an allowed one.
    if (UNSAFE.has(c.req.method) && viaCookie) {
      const origin = c.req.header('origin');
      const self = selfOrigin(c, deps.config.trustProxy);
      if (origin && origin !== self && !allowed.has(origin)) throw new ApiError(403, 'bad_origin', 'Request origin is not allowed.');
    }
    const token = sessionToken(c);
    c.set('token', token);
    c.set('userId', token ? await resolveSession(deps.sql, token) : null);
    await next();
  });

  app.get('/api/health', async c => {
    await deps.sql`select 1`;
    return c.json({ ok: true, service: 'fikirhane-api' });
  });
  app.route('/api/auth', authRoutes(deps));
  app.route('/api/me', meRoutes(deps));
  app.route('/api/admin', adminRoutes(deps));
  app.route('/api', catalogRoutes(deps));
  app.all('/api/*', c => c.json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, 404));

  if (deps.config.siteDir) app.get('*', staticSite(deps.config.siteDir));

  app.onError((err, c) => {
    const api = err instanceof ApiError ? err : fromPgError(err);
    if (api) {
      return c.json({ error: { code: api.code, message: api.message, ...(api.details ? { details: api.details } : {}) } },
        api.status as 400);
    }
    console.error(`[${c.get('requestId')}]`, err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong.', request_id: c.get('requestId') } }, 500);
  });

  return app;
}
