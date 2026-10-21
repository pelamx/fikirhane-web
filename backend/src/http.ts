import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Config } from './config.ts';
import type { Sql } from './db.ts';
import { badRequest, unauthorized } from './errors.ts';
import { globalPermissions } from './services/authz.ts';

export const SESSION_COOKIE = 'fh_session';

export interface Deps { sql: Sql; config: Config }
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
