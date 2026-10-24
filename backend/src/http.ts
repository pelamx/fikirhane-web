import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Config } from './config.ts';
import type { Sql } from './db.ts';
import type { Mailer } from './services/mail.ts';
import { badRequest, unauthorized } from './errors.ts';
import { globalPermissions } from './services/authz.ts';

export const SESSION_COOKIE = 'fh_session';

/** `mailer` overrides the configured mail channel (tests); null means no email can be sent. */
export interface Deps { sql: Sql; config: Config; mailer?: Mailer | null }
export type Env = { Variables: { userId: string | null; token: string | null; requestId: string } };
export type Ctx = Context<Env>;

export function requireUser(c: Ctx): string {
  const id = c.get('userId');
  if (!id) throw unauthorized();
  return id;
}

export async function permissionsOf(c: Ctx, deps: Deps): Promise<Set<string>> {
  return globalPermissions(deps.sql, requireUser(c));
}

/** The public origin of this server. Behind a TLS-terminating proxy the request arrives as http, so trust its forwarded headers. */
export function selfOrigin(c: Ctx, trustProxy: boolean): string {
  const u = new URL(c.req.url);
  if (!trustProxy) return u.origin;
  const scheme = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = c.req.header('x-forwarded-host')?.split(',')[0]?.trim() || u.host;
  return `${scheme === 'https' || scheme === 'http' ? scheme : u.protocol.slice(0, -1)}://${host}`;
}

/**
 * Base address for links sent to people. Configured (PUBLIC_SITE_URL / RENDER_EXTERNAL_URL) in production, because a
 * request's Host header is attacker-controlled; outside production the request's own origin is good enough.
 */
export function linkBase(c: Ctx, deps: Deps): string | null {
  return deps.config.publicSiteUrl ?? (process.env.NODE_ENV === 'production' ? null : selfOrigin(c, deps.config.trustProxy));
}

export function sessionToken(c: Ctx): string | null {
  const auth = c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  return getCookie(c, SESSION_COOKIE) ?? null;
}

/** Parses the JSON body with a zod schema; malformed input is a 400 with field issues. */
export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw badRequest('invalid_json', 'Request body must be JSON.'); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest('validation_failed', 'Some fields are invalid.',
      parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  }
  return parsed.data;
}

export function query<T extends z.ZodType>(c: Ctx, schema: T): z.infer<T> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw badRequest('validation_failed', 'Some query parameters are invalid.');
  return parsed.data;
}

export const uuid = z.uuid();
export function idParam(c: Ctx, name: string): string {
  const parsed = uuid.safeParse(c.req.param(name));
  if (!parsed.success) throw badRequest('invalid_id', 'Invalid identifier.');
  return parsed.data;
}

/** The caller's address for rate limits. Forwarded headers are trusted only behind a known reverse proxy (TRUST_PROXY=true). */
export function clientIp(c: Ctx, trustProxy: boolean): string {
  if (trustProxy) return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
}
