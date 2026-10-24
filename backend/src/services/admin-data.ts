import type { Sql } from '../db.ts';
import { badRequest, forbidden, notFound } from '../errors.ts';

/**
 * Read-only back-office view over the documented tables, driven by the live Postgres catalog (columns, primary keys,
 * foreign keys), so every relation between the 48 table documents is navigable in both directions. Writes stay in the
 * purpose-built endpoints, which carry the business rules and audit entries.
 */

export type Group = 'identity' | 'profile' | 'membership' | 'clubs' | 'growth' | 'events' | 'finance';
interface TableDef { group: Group; perms: readonly string[]; contact?: readonly string[] }

const EVENT_ADMIN = ['event.create', 'event.publish', 'event.cancel', 'booking.view'] as const;
const VENUE = ['event.create', 'event.update_location', 'booking.view'] as const;

// Access is any-of: one of the listed global permissions opens the table. auth_identities and user_sessions hold
// credentials and are deliberately absent.
export const TABLES: Record<string, TableDef> = {
  users: { group: 'identity', perms: ['user.view_basic'] },
  user_emails: { group: 'identity', perms: ['user.view_contact'] },
  roles: { group: 'identity', perms: ['role.view', 'user.view_basic'] },
  permissions: { group: 'identity', perms: ['permission.view', 'role.view'] },
  role_permissions: { group: 'identity', perms: ['role.view'] },
  user_roles: { group: 'identity', perms: ['role.view', 'user.view_basic'] },
  audit_log: { group: 'identity', perms: ['audit.view'] },
  skills: { group: 'profile', perms: ['user.view_basic'] },
  user_skills: { group: 'profile', perms: ['user.view_basic'] },
  interests: { group: 'profile', perms: ['user.view_basic', 'marketing_analytics.view'] },
  user_interests: { group: 'profile', perms: ['user.view_basic'] },
  needs: { group: 'profile', perms: ['booking.view'] },
  offers: { group: 'profile', perms: ['booking.view'] },
  membership_types: { group: 'membership', perms: ['membership.view', 'pricing.view'] },
  user_memberships: { group: 'membership', perms: ['membership.view'] },
  membership_applications: { group: 'membership', perms: ['membership.view'] },
  clubs: { group: 'clubs', perms: ['club.create', 'club.update', 'club_members.view'] },
  club_users: { group: 'clubs', perms: ['club_members.view'] },
  club_member_roles: { group: 'clubs', perms: ['club_members.view'] },
  organizations: { group: 'clubs', perms: ['organization.view'] },
  organization_users: { group: 'clubs', perms: ['organization_users.view'] },
  organization_roles: { group: 'clubs', perms: ['organization.view'] },
  campaigns: { group: 'growth', perms: ['campaign.view'] },
  invitations: { group: 'growth', perms: ['invitation.view'], contact: ['guest_email', 'guest_phone'] },
  freepasses: { group: 'growth', perms: ['freepass.view'], contact: ['issued_to_email', 'issued_to_phone'] },
  freepass_redemptions: { group: 'growth', perms: ['freepass.view'] },
  user_acquisitions: { group: 'growth', perms: ['acquisition.view'] },
  sponsorship_plans: { group: 'growth', perms: ['sponsorship.view'] },
  club_sponsorships: { group: 'growth', perms: ['sponsorship.view'] },
  sponsorship_usage: { group: 'growth', perms: ['sponsorship.view'] },
  event_series: { group: 'events', perms: EVENT_ADMIN },
  events: { group: 'events', perms: EVENT_ADMIN },
  event_options: { group: 'events', perms: EVENT_ADMIN },
  event_clubs: { group: 'events', perms: EVENT_ADMIN },
  event_organizations: { group: 'events', perms: EVENT_ADMIN },
  event_users: { group: 'events', perms: EVENT_ADMIN },
  bookings: { group: 'events', perms: ['booking.view'], contact: ['guest_email', 'guest_phone'] },
  locations: { group: 'events', perms: VENUE },
  space_setups: { group: 'events', perms: VENUE },
  tables: { group: 'events', perms: VENUE },
  seats: { group: 'events', perms: VENUE },
  accounts: { group: 'finance', perms: ['account.view'] },
  financial_centers: { group: 'finance', perms: ['financial_center.view', 'document.view'] },
  financial_categories: { group: 'finance', perms: ['financial_category.view', 'document.view'] },
  documents: { group: 'finance', perms: ['document.view'] },
  document_items: { group: 'finance', perms: ['document.view'] },
  transactions: { group: 'finance', perms: ['transaction.view'] },
  transaction_allocations: { group: 'finance', perms: ['transaction.view', 'document.view'] },
  items: { group: 'finance', perms: ['item.view'] },
  stock_movements: { group: 'finance', perms: ['stock.view'] },
  stock_counts: { group: 'finance', perms: ['stock.view'] },
  stock_count_items: { group: 'finance', perms: ['stock.view'] },
};

/** Bookkeeping references that every table carries; shown as labels, but not listed as relations of a user. */
const AUDIT_COLUMNS = new Set(['created_by_user_id', 'updated_by_user_id']);
const REDACTED = '•••';

export interface Column {
  name: string; type: string; nullable: boolean; ref: { table: string; column: string } | null; contact: boolean;
  /** Allowed values from a single-column CHECK (col = ANY (ARRAY[...])). */
  options: string[] | null;
  /** Regex from a single-column CHECK (col ~ '...'). */
  pattern: string | null;
  hasDefault: boolean;
  generated: boolean;
}
export interface CatalogTable { name: string; pk: string; columns: Column[]; label: string[] }
interface Catalog { tables: Map<string, CatalogTable>; incoming: Map<string, { table: string; column: string }[]> }

const catalogs = new WeakMap<Sql, Promise<Catalog>>();

// Tables whose name-like column is not the best label (e.g. a document is known by its number, not its billing name).
const LABELS: Record<string, string[]> = {
  users: ['first_name', 'last_name'], documents: ['document_number'], document_items: ['description'], invitations: ['invitation_code'],
  freepasses: ['freepass_code'], transactions: ['reference_number'], stock_counts: ['count_date'], audit_log: ['action'],
};

function labelColumns(table: string, names: string[]): string[] {
  if (LABELS[table]) return LABELS[table].filter(c => names.includes(c));
  for (const re of [/_title$/, /_name$/, /_code$/, /^email$/, /^action$/]) {
    const hit = names.find(n => re.test(n) && !n.startsWith('guest_') && n !== 'currency_code');
    if (hit) return [hit];
  }
  return [];
}

async function loadCatalog(sql: Sql): Promise<Catalog> {
  const names = Object.keys(TABLES);
  const [cols, pks, fks, checks] = await Promise.all([
    sql<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null; is_generated: string }[]>`
      select table_name, column_name, data_type, is_nullable, column_default, is_generated from information_schema.columns
      where table_schema = 'public' and table_name = any(${names}) order by table_name, ordinal_position`,
    sql<{ table_name: string; column_name: string }[]>`
      select tc.table_name, kcu.column_name from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu using (constraint_schema, constraint_name)
      where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'`,
    sql<{ table_name: string; column_name: string; ref_table: string; ref_column: string }[]>`
      select cl.relname as table_name, a.attname as column_name, rcl.relname as ref_table, ra.attname as ref_column
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rcl on rcl.oid = con.confrelid
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = con.confkey[1]
      where con.contype = 'f' and n.nspname = 'public' and cardinality(con.conkey) = 1`,
    sql<{ table_name: string; column_name: string; def: string }[]>`
      select cl.relname as table_name, a.attname as column_name, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.contype = 'c' and n.nspname = 'public' and cardinality(con.conkey) = 1`,
  ]);
  const optionsOf = new Map<string, string[]>();
  const patternOf = new Map<string, string>();
  for (const c of checks) {
    const key = `${c.table_name}.${c.column_name}`;
    const list = /^CHECK \(\(\w+ = ANY \(ARRAY\[(.*)\]\)\)\)$/.exec(c.def);
    if (list) { optionsOf.set(key, [...list[1].matchAll(/'((?:[^']|'')*)'::/g)].map(m => m[1].replace(/''/g, "'"))); continue; }
    const re = /^CHECK \(\(\w+ ~ '((?:[^']|'')*)'::text\)\)$/.exec(c.def);
    if (re) patternOf.set(key, re[1].replace(/''/g, "'"));
  }
  const pkOf = new Map(pks.map(p => [p.table_name, p.column_name]));
  const refOf = new Map(fks.filter(f => TABLES[f.ref_table]).map(f => [`${f.table_name}.${f.column_name}`, { table: f.ref_table, column: f.ref_column }]));
  // Columns covered only by a composite key (e.g. bookings.id_event via (id_event_option, id_event)) follow the
  // naming convention (D-01): a column named after another table's primary key references that table.
  const ownerOfPk = new Map([...pkOf].filter(([t]) => TABLES[t]).map(([t, c]) => [c, t]));
  for (const c of cols) {
    const owner = ownerOfPk.get(c.column_name);
    const key = `${c.table_name}.${c.column_name}`;
    if (owner && owner !== c.table_name && !refOf.has(key)) refOf.set(key, { table: owner, column: c.column_name });
  }
  const tables = new Map<string, CatalogTable>();
  for (const name of names) {
    const own = cols.filter(c => c.table_name === name && c.column_name !== 'checkin_token');
    const pk = pkOf.get(name);
    if (!own.length || !pk) continue;
    const contact = new Set(TABLES[name].contact ?? []);
    tables.set(name, {
      name, pk, label: labelColumns(name, own.map(c => c.column_name)),
      columns: own.map(c => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES',
        ref: refOf.get(`${name}.${c.column_name}`) ?? null, contact: contact.has(c.column_name),
        options: optionsOf.get(`${name}.${c.column_name}`) ?? null, pattern: patternOf.get(`${name}.${c.column_name}`) ?? null,
        hasDefault: c.column_default !== null, generated: c.is_generated === 'ALWAYS' })),
    });
  }
  const incoming = new Map<string, { table: string; column: string }[]>();
  for (const t of tables.values()) {
    for (const c of t.columns) {
      if (!c.ref || AUDIT_COLUMNS.has(c.name) || !tables.has(c.ref.table)) continue;
      incoming.set(c.ref.table, [...incoming.get(c.ref.table) ?? [], { table: t.name, column: c.name }]);
    }
  }
  return { tables, incoming };
}

export function catalog(sql: Sql): Promise<Catalog> {
  let p = catalogs.get(sql);
  if (!p) { p = loadCatalog(sql); p.catch(() => catalogs.delete(sql)); catalogs.set(sql, p); }
  return p;
}

/** `a || ' ' || b` over identifiers, null-safe; avoids relying on how the sql() array helper reads its context. */
function joined(sql: Sql, columns: string[]) {
  return columns.map(c => sql`coalesce(${sql(c)}::text, '')`).reduce((a, b) => sql`${a} || ' ' || ${b}`);
}

export const canSee = (perms: Set<string>, table: string) => !!TABLES[table]?.perms.some(p => perms.has(p));

export async function visibleTable(sql: Sql, perms: Set<string>, table: string): Promise<{ cat: Catalog; meta: CatalogTable }> {
  const cat = await catalog(sql);
  const meta = cat.tables.get(table);
  if (!meta) throw notFound('Table');
  if (!canSee(perms, table)) throw forbidden();
  return { cat, meta };
}

/** JSON-safe row with contact columns masked for viewers without user.view_contact. */
export function present(meta: CatalogTable, row: Record<string, unknown>, perms: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const masked = !perms.has('user.view_contact');
  for (const c of meta.columns) {
    const v = row[c.name];
    out[c.name] = c.contact && masked && v != null ? REDACTED : typeof v === 'bigint' ? v.toString() : v;
  }
  return out;
}

export type Labels = Record<string, Record<string, string>>;

/** Display labels for the foreign keys in `rows`, only for referenced tables the viewer may open. */
async function labelsFor(sql: Sql, cat: Catalog, meta: CatalogTable, rows: Record<string, unknown>[], perms: Set<string>): Promise<Labels> {
  const wanted = new Map<string, Set<string>>();
  for (const c of meta.columns) {
    if (!c.ref || !canSee(perms, c.ref.table)) continue;
    for (const r of rows) if (r[c.name] != null) wanted.set(c.ref.table, (wanted.get(c.ref.table) ?? new Set()).add(String(r[c.name])));
  }
  const labels: Labels = {};
  await Promise.all([...wanted].map(async ([table, ids]) => {
    const target = cat.tables.get(table)!;
    if (!target.label.length) return;
    const found = await sql<{ id: string; label: string }[]>`
      select ${sql(target.pk)}::text as id, ${joined(sql, target.label)} as label
      from ${sql(table)} where ${sql(target.pk)}::text = any(${[...ids]})`;
    labels[table] = Object.fromEntries(found.map(f => [f.id, f.label]));
  }));
  return labels;
}

export function schemaFor(cat: Catalog, perms: Set<string>) {
  return [...cat.tables.values()].filter(t => canSee(perms, t.name)).map(t => ({
    name: t.name, group: TABLES[t.name].group, pk: t.pk, label: t.label,
    columns: t.columns.map(c => ({ ...c, ref: c.ref && canSee(perms, c.ref.table) ? c.ref : null })),
    incoming: (cat.incoming.get(t.name) ?? []).filter(r => canSee(perms, r.table)),
  }));
}

export async function visibleSchema(sql: Sql, perms: Set<string>) {
  return schemaFor(await catalog(sql), perms);
}

export interface ListOptions { q?: string; filters: Record<string, string>; limit: number; offset: number }

export async function listRows(sql: Sql, perms: Set<string>, table: string, opts: ListOptions) {
  const { cat, meta } = await visibleTable(sql, perms, table);
  const names = new Set(meta.columns.map(c => c.name));
  const conditions = [sql`true`];
  for (const [col, value] of Object.entries(opts.filters)) {
    const column = meta.columns.find(c => c.name === col);
    if (!column) throw badRequest('unknown_column', `Unknown column ${col}.`);
    if (column.contact && !perms.has('user.view_contact')) throw forbidden();
    conditions.push(value === '' ? sql`${sql(col)} is null` : sql`${sql(col)}::text = ${value}`);
  }
  if (opts.q) {
    const searchable = meta.columns.filter(c => (c.type === 'text' || c.type === 'character varying') && (!c.contact || perms.has('user.view_contact')))
      .map(c => c.name);
    if (searchable.length) conditions.push(sql`${joined(sql, searchable)} ilike ${'%' + opts.q.replace(/[\\%_]/g, m => '\\' + m) + '%'}`);
    else conditions.push(sql`${sql(meta.pk)}::text = ${opts.q}`);
  }
  const where = conditions.reduce((acc, c) => sql`${acc} and ${c}`);
  const order = names.has('created_at') ? sql`created_at desc, ${sql(meta.pk)}` : names.has('sort_order') ? sql`sort_order, ${sql(meta.pk)}` : sql`${sql(meta.pk)}`;
  const [rows, [{ total }]] = await Promise.all([
    sql`select * from ${sql(table)} where ${where} order by ${order} limit ${opts.limit} offset ${opts.offset}`,
    sql<{ total: number }[]>`select count(*)::int as total from ${sql(table)} where ${where}`,
  ]);
  const [labels, people] = await Promise.all([labelsFor(sql, cat, meta, rows, perms),
    table === 'users' ? peopleFor(sql, rows.map(r => String(r.id_user)), perms) : undefined]);
  return { table, total, items: rows.map(r => present(meta, r, perms)), labels, ...(people ? { people } : {}) };
}

export type People = Record<string, { roles?: { code: string; name: string }[]; membership?: { code: string; name: string } | null }>;

/** What each listed person is: staff roles (besides USER) and the active membership, each only for viewers of that table. */
async function peopleFor(sql: Sql, ids: string[], perms: Set<string>): Promise<People> {
  const people: People = Object.fromEntries(ids.map(id => [id, {}]));
  if (!ids.length) return people;
  const [roles, memberships] = await Promise.all([
    canSee(perms, 'user_roles') ? sql<{ id_user: string; code: string; name: string }[]>`
      select ur.id_user::text, r.role_code as code, r.role_name as name from user_roles ur join roles r using (id_role)
      where ur.id_user::text = any(${ids}) and ur.status = 'active' and (ur.expires_at is null or ur.expires_at > now()) and r.role_code <> 'USER'
      order by r.sort_order` : null,
    canSee(perms, 'user_memberships') ? sql<{ id_user: string; code: string; name: string }[]>`
      select m.id_user::text, t.membership_type_code as code, t.membership_type_name as name
      from user_memberships m join membership_types t using (id_membership_type)
      where m.id_user::text = any(${ids}) and m.status = 'active'` : null,
  ]);
  if (roles) for (const id of ids) people[id].roles = roles.filter(r => r.id_user === id).map(({ code, name }) => ({ code, name }));
  if (memberships) for (const id of ids) {
    const m = memberships.find(x => x.id_user === id);
    people[id].membership = m ? { code: m.code, name: m.name } : null;
  }
  return people;
}

/** One record, its outgoing references, and the first rows of every visible table that points at it. */
export async function getRecord(sql: Sql, perms: Set<string>, table: string, id: string) {
  const { cat, meta } = await visibleTable(sql, perms, table);
  const [row] = await sql`select * from ${sql(table)} where ${sql(meta.pk)}::text = ${id}`;
  if (!row) throw notFound('Record');
  const related = await Promise.all((cat.incoming.get(table) ?? []).filter(r => canSee(perms, r.table)).map(async r => {
    const src = cat.tables.get(r.table)!;
    const order = src.columns.some(c => c.name === 'created_at') ? sql`created_at desc` : sql`${sql(src.pk)}`;
    const [rows, [{ total }]] = await Promise.all([
      sql`select * from ${sql(r.table)} where ${sql(r.column)}::text = ${id} order by ${order} limit 10`,
      sql<{ total: number }[]>`select count(*)::int as total from ${sql(r.table)} where ${sql(r.column)}::text = ${id}`,
    ]);
    return { table: r.table, column: r.column, total, items: rows.map(x => present(src, x, perms)), labels: await labelsFor(sql, cat, src, rows, perms) };
  }));
  return { table, row: present(meta, row, perms), labels: await labelsFor(sql, cat, meta, [row], perms), related };
}
