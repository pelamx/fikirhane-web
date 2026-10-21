import { createApp } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createDb, type Sql } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { startLocalDb } from '../scripts/embedded-db.ts';
import { seedDemo } from '../scripts/seed-demo.ts';

export const ORIGIN = 'http://localhost';

export interface TestEnv {
  sql: Sql;
  config: Config;
  app: ReturnType<typeof createApp>;
  stop: () => Promise<void>;
}

export async function setup(overrides: Partial<Config> = {}): Promise<TestEnv> {
  const db = await startLocalDb();
  const sql = createDb(db.url, 20);
  await migrate(sql);
  await seedDemo(sql);
  const config = { ...loadConfig(), cookieSecure: false, corsOrigins: ['https://pelamx.github.io'], jobIntervalSeconds: 0, signupsPerHour: 10_000, loginAttemptsPer15Min: 10_000, ...overrides };
  const app = createApp({ sql, config });
  return { sql, config, app, stop: async () => { await sql.end(); await db.stop(); } };
}

/** Minimal browser-like client: keeps the session cookie and sends a same-origin Origin header. */
export class Client {
  cookie = '';
  readonly env: TestEnv;
  constructor(env: TestEnv) { this.env = env; }
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.env.app.request(ORIGIN + path, {
      method,
      headers: { origin: ORIGIN, ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p: string) => this.call('GET', p);
  post = (p: string, b: unknown = {}) => this.call('POST', p, b);
  put = (p: string, b: unknown = {}) => this.call('PUT', p, b);
  patch = (p: string, b: unknown = {}) => this.call('PATCH', p, b);
  del = (p: string) => this.call('DELETE', p);
}

let counter = 0;
export async function registered(env: TestEnv, extra: Record<string, unknown> = {}) {
  const client = new Client(env);
  const email = `user${++counter}-${Date.now()}@example.com`;
  const res = await client.post('/api/auth/register', { first_name: 'Ayşe', last_name: 'Kaya', email, password: 'correct-horse-1', ...extra });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.json)}`);
  return { client, email, userId: res.json.user_id as string };
}

export async function grantRole(sql: Sql, userId: string, role: string) {
  await sql`insert into user_roles (id_user, id_role) select ${userId}, id_role from roles where role_code = ${role}`;
}

export async function giveMembership(sql: Sql, userId: string, code: 'MEMBER' | 'PREMIUM') {
  await sql`insert into user_memberships (id_user, id_membership_type, status, start_date, end_date, source)
    select ${userId}, id_membership_type, 'active', current_date, current_date + 365, 'admin_grant' from membership_types where membership_type_code = ${code}`;
}

/** Creates a published event via SQL, starting `hoursFromNow` hours from now with one seat option. */
export async function makeEvent(sql: Sql, opts: { hoursFromNow: number; capacity?: number; basePrice?: string; unit?: 'seat' | 'location'; club?: string }) {
  const [e] = await sql<{ id_event: string }[]>`
    insert into events (event_type, event_title, start_datetime, end_datetime, status, base_price, currency_code)
    values ('meetup', 'Test event', now() + make_interval(hours => ${opts.hoursFromNow}), now() + make_interval(hours => ${opts.hoursFromNow + 2}),
            'published', ${opts.basePrice ?? '500.00'}, 'TRY') returning id_event`;
  const [o] = await sql<{ id_event_option: string }[]>`
    insert into event_options (id_event, id_location, id_space_setup, option_code, capacity, booking_unit, price_adjustment, status)
    select ${e.id_event}, s.id_location, s.id_space_setup, 'ATL', ${opts.capacity ?? 12}, ${opts.unit ?? 'seat'}, -50.00, 'active'
    from space_setups s where s.setup_code = 'ATOLYE_COWORK_V1' returning id_event_option`;
  if (opts.club) {
    await sql`insert into event_clubs (id_club, id_event, club_event_role, is_primary)
      select id_club, ${e.id_event}, 'organizer', true from clubs where club_code = ${opts.club}`;
  }
  return { eventId: e.id_event, optionId: o.id_event_option };
}
