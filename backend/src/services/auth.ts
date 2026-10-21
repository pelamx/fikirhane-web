import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from '../db.ts';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize('NFKC'), salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return timingSafeEqual(expected, actual);
}

// Verifying against a dummy hash keeps response time similar for unknown emails.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'));
  return dummyHash;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(db: Db, userId: string, days: number, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db`insert into user_sessions (id_user, token_hash, expires_at, user_agent)
           values (${userId}, ${sha256(token)}, now() + make_interval(days => ${days}), ${userAgent?.slice(0, 300) ?? null})`;
  return token;
}

/** Returns the user id for a valid session token of an active account, refreshing last_seen_at. */
export async function resolveSession(db: Db, token: string): Promise<string | null> {
  const rows = await db<{ id_user: string }[]>`
    update user_sessions s set last_seen_at = now()
    from users u
    where s.token_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now()
      and u.id_user = s.id_user and u.account_status = 'active'
    returning s.id_user`;
  return rows[0]?.id_user ?? null;
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db`update user_sessions set revoked_at = now() where token_hash = ${sha256(token)} and revoked_at is null`;
}

export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db`update user_sessions set revoked_at = now() where id_user = ${userId} and revoked_at is null`;
}

/** In-memory sliding-window limiter for login/registration attempts (single-instance deployments). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (recent.length >= this.limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.every(t => now - t >= this.windowMs)) this.hits.delete(k);
    return true;
  }
}
