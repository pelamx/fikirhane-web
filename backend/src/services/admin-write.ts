import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql, Tx } from '../db.ts';
import { ApiError, badRequest, forbidden, notFound } from '../errors.ts';
import { catalog, present, visibleTable, type CatalogTable, type Column } from './admin-data.ts';
import { audit } from './audit.ts';
import { revokeAllSessions } from './auth.ts';

/**
 * Generic create / edit / status actions for the admin shell. What may be written, by whom, and which fields are
 * fixed or system-managed comes from admin-meta.json, extracted from the 48 table documents. The database guard
 * triggers stay the last line of defence (posted documents, append-only ledgers, capacity, no hard delete).
 */

export interface WriteAction {
  action: string; label_tr: string; from_status: string[]; to_status: string; permission: string;
  needs_reason?: boolean; effects_tr?: string; status_column?: string;
}
export interface TableWriteMeta {
  purpose_tr?: string;
  fields?: Record<string, string>;
  enums?: Record<string, Record<string, string>>;
  write_mode: 'crud' | 'append_only' | 'read_only' | 'workflow_only';
  create_permission: string | null;
  update_permission: string | null;
  field_permissions?: Record<string, string>;
  type_permissions?: { column: string; map: Record<string, string> };
  system_fields?: string[];
  immutable_fields?: string[];
  required_on_create?: string[];
  status_transitions?: Record<string, string[]>;
  actions?: WriteAction[];
  derived?: Record<string, string>;
  rules_tr?: string[];
  deletable_when?: { column: string; values: string[] } | null;
}

export const META: Record<string, TableWriteMeta> =
  JSON.parse(readFileSync(join(import.meta.dirname, 'admin-meta.json'), 'utf8'));

const BOOKKEEPING = new Set(['created_at', 'created_by_user_id', 'updated_at', 'updated_by_user_id']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canCreate(table: string, perms: Set<string>): boolean {
  const m = META[table];
  if (!m || (m.write_mode !== 'crud' && m.write_mode !== 'append_only')) return false;
  if (m.type_permissions) return Object.values(m.type_permissions.map).some(p => perms.has(p));
  return !!m.create_permission && perms.has(m.create_permission);
}

export function canUpdate(table: string, perms: Set<string>): boolean {
  const m = META[table];
  if (!m || m.write_mode !== 'crud') return false;
  return (!!m.update_permission && perms.has(m.update_permission)) || Object.values(m.field_permissions ?? {}).some(p => perms.has(p));
}

/** Columns a person may type into on create / edit. */
export function writableColumns(meta: CatalogTable, table: string, mode: 'create' | 'update'): Column[] {
  const m = META[table];
  const blocked = new Set([...(m?.system_fields ?? []), ...(mode === 'update' ? m?.immutable_fields ?? [] : [])]);
  return meta.columns.filter(c => c.name !== meta.pk && !BOOKKEEPING.has(c.name) && !c.generated && !blocked.has(c.name)
    && c.type !== 'ARRAY' && c.type !== 'tsvector');
}

function fieldError(column: string, message: string): ApiError {
  return badRequest('validation_failed', message, [{ path: column, message }]);
}

/** Turns form input into a value Postgres accepts for the column, or explains why not. */
function coerce(col: Column, raw: unknown): unknown {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return null;
  const bad = (what: string) => fieldError(col.name, `${col.name}: ${what}`);
  switch (col.type) {
    case 'text': case 'character varying': case 'character': {
      if (typeof raw !== 'string' && typeof raw !== 'number') throw bad('metin olmalı');
      const v = String(raw).trim();
      if (v.length > 20_000) throw bad('çok uzun');
      if (col.options && !col.options.includes(v)) throw bad(`izin verilen değerlerden biri olmalı (${col.options.join(', ')})`);
      if (col.pattern && !new RegExp(col.pattern).test(v)) throw bad('biçimi geçersiz');
      return v;
    }
    case 'integer': case 'smallint': case 'bigint': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isInteger(n)) throw bad('tam sayı olmalı');
      return n;
    }
    case 'numeric': case 'double precision': case 'real': {
      const v = String(raw).trim().replace(',', '.');
      if (!/^-?\d{1,14}(\.\d{1,6})?$/.test(v)) throw bad('sayı olmalı');
      return v;
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'false') return raw === 'true';
      throw bad('evet/hayır olmalı');
    case 'date':
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) throw bad('tarih olmalı (YYYY-AA-GG)');
      return raw;
    case 'timestamp with time zone': case 'timestamp without time zone': {
      const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
      if (Number.isNaN(t)) throw bad('tarih ve saat olmalı');
      return new Date(t).toISOString();
    }
    case 'uuid':
      if (typeof raw !== 'string' || !UUID.test(raw)) throw bad('geçerli bir kayıt seçilmeli');
      return raw;
    case 'jsonb': case 'json':
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(String(raw)); } catch { throw bad('geçerli JSON olmalı'); }
    default:
      throw bad('bu alan düzenlenemez');
  }
}

function pick(meta: CatalogTable, table: string, mode: 'create' | 'update', values: Record<string, unknown>) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw badRequest('validation_failed', 'values must be an object.');
  const allowed = new Map(writableColumns(meta, table, mode).map(c => [c.name, c]));
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(values)) {
    const col = allowed.get(name);
    if (!col) {
      if (meta.columns.some(c => c.name === name)) throw fieldError(name, `${name}: bu alan ${mode === 'update' ? 'değiştirilemez' : 'elle girilemez'}.`);
      throw fieldError(name, `${name}: böyle bir alan yok.`);
    }
    out[name] = coerce(col, raw);
  }
  return out;
}

const json = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? v.toString() : v);

async function load(tx: Tx, meta: CatalogTable, table: string, id: string, lock = true) {
  const [row] = lock
    ? await tx`select * from ${tx(table)} where ${tx(meta.pk)}::text = ${id} for update`
    : await tx`select * from ${tx(table)} where ${tx(meta.pk)}::text = ${id}`;
  if (!row) throw notFound('Record');
  return row as Record<string, unknown>;
}

// ---------- table-specific steps the documents require beyond plain field edits ----------

type Row = Record<string, unknown>;
interface Hooks {
  /** Fill computed fields / validate; `row` is what will be written, `before` the stored row on update. */
  beforeWrite?: (tx: Tx, row: Row, before: Row | null, actor: string) => Promise<void>;
  afterWrite?: (tx: Tx, after: Row, before: Row | null, actor: string) => Promise<void>;
  afterDelete?: (tx: Tx, before: Row) => Promise<void>;
  beforeAction?: (tx: Tx, action: string, before: Row, set: Row, actor: string, reason: string | null) => Promise<void>;
  afterAction?: (tx: Tx, action: string, before: Row, after: Row, actor: string, reason: string | null) => Promise<void>;
  /** Replaces the status change entirely (e.g. a reversal that inserts a counter-row). */
  customAction?: Record<string, (tx: Tx, before: Row, actor: string, reason: string | null) => Promise<Row>>;
}

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const NEGATIVE_MOVES = new Set(['sale', 'consumption', 'waste', 'return_out']);
const POSITIVE_MOVES = new Set(['purchase_receive', 'return_in', 'opening_balance']);

async function documentTotals(tx: Tx, documentId: unknown) {
  await tx`update documents d set subtotal_amount = coalesce(l.gross, 0), discount_amount = coalesce(l.discount, 0),
      tax_amount = coalesce(l.tax, 0), grand_total = coalesce(l.total, 0)
    from (select sum(gross_amount) gross, sum(discount_amount) discount, sum(tax_amount) tax, sum(line_total) total
          from document_items where id_document = ${String(documentId)}) l
    where d.id_document = ${String(documentId)} and d.status = 'draft'`;
}

async function accountBalances(tx: Tx, ids: unknown[]) {
  for (const id of new Set(ids.filter(Boolean).map(String))) {
    await tx`update accounts a set current_balance = a.opening_balance
        + coalesce((select sum(amount) from transactions where to_account_id = a.id_account and status = 'posted'), 0)
        - coalesce((select sum(amount) from transactions where from_account_id = a.id_account and status = 'posted'), 0)
      where a.id_account = ${id}`;
  }
}

const HOOKS: Record<string, Hooks> = {
  // DOCI: gross = round(qty × price, 2), net = gross − discount, tax = round(net × rate / 100, 2), total = net + tax.
  document_items: {
    async beforeWrite(tx, row, before) {
      const v = { ...before, ...row };
      if (v.id_item && (v.id_financial_center == null || v.id_financial_category == null)) {
        const [d] = await tx<{ direction: string }[]>`select direction from documents where id_document = ${String(v.id_document)}`;
        const [item] = await tx<Row[]>`select * from items where id_item = ${String(v.id_item)}`;
        if (item) {
          if (v.id_financial_center == null && item.default_financial_center_id) row.id_financial_center = item.default_financial_center_id;
          const cat = d?.direction === 'purchase' ? item.default_expense_category_id : item.default_revenue_category_id;
          if (v.id_financial_category == null && cat) row.id_financial_category = cat;
          if (v.description == null) row.description = item.item_name;
          if (v.unit == null) row.unit = item.unit;
          if (v.unit_price == null && d?.direction === 'sale' && item.default_selling_price != null) row.unit_price = item.default_selling_price;
          if (v.tax_rate == null && item.default_tax_rate != null) row.tax_rate = item.default_tax_rate;
        }
      }
      if (!before && row.line_no == null) {
        const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(line_no), 0) + 1 as next from document_items where id_document = ${String(v.id_document)}`;
        row.line_no = next;
      }
      const w = { ...before, ...row };
      const gross = Math.round(num(w.quantity) * num(w.unit_price) * 100) / 100;
      const net = gross - num(w.discount_amount);
      const tax = Math.round(net * num(w.tax_rate)) / 100;
      Object.assign(row, { gross_amount: money(gross), net_amount: money(net), tax_amount: money(tax), line_total: money(net + tax) });
    },
    afterWrite: (tx, after) => documentTotals(tx, after.id_document),
    afterDelete: (tx, before) => documentTotals(tx, before.id_document),
  },
  documents: {
    async beforeAction(tx, action, before, set) {
      if (action !== 'post') return;
      await documentTotals(tx, before.id_document);
      if (!before.document_number) {
        const prefix = before.direction === 'purchase' ? 'AL' : 'SA';
        const year = new Date().getFullYear();
        const [{ n }] = await tx<{ n: number }[]>`select count(*)::int + 1 as n from documents
          where direction = ${String(before.direction)} and document_number like ${`${prefix}-${year}-%`}`;
        set.document_number = `${prefix}-${year}-${String(n).padStart(5, '0')}`;
      }
    },
  },
  transactions: {
    async afterAction(tx, action, before, after, actor, reason) {
      if (action === 'reverse') {
        // TRX: reversing a payment also reverses its active allocations in the same transaction.
        await tx`update transaction_allocations set status = 'reversed', reversed_at = now(), reversed_by_user_id = ${actor},
            reversal_reason = ${reason ?? 'Transaction reversed'}, updated_by_user_id = ${actor}
          where id_transaction = ${String(before.id_transaction)} and status = 'active'`;
      }
      if (action === 'post' || action === 'reverse') await accountBalances(tx, [after.from_account_id, after.to_account_id]);
    },
  },
  accounts: {
    afterWrite: (tx, after) => accountBalances(tx, [after.id_account]),
  },
  stock_movements: {
    // The quantity sign follows the movement type, so staff type amounts as they count them.
    async beforeWrite(_tx, row) {
      const type = String(row.movement_type ?? ''), q = num(row.quantity);
      if (NEGATIVE_MOVES.has(type)) row.quantity = String(-Math.abs(q));
      if (POSITIVE_MOVES.has(type)) row.quantity = String(Math.abs(q));
    },
    customAction: {
      // SMOV: a mistake is fixed by an opposite movement; the original row never changes.
      async reverse(tx, before, actor, reason) {
        if (before.reversed_movement_id) throw new ApiError(409, 'invalid_transition', 'Bir ters kayıt yeniden ters çevrilemez.');
        const [done] = await tx`select 1 from stock_movements where reversed_movement_id = ${String(before.id_stock_movement)}`;
        if (done) throw new ApiError(409, 'invalid_transition', 'Bu hareket zaten ters çevrilmiş.');
        const [row] = await tx<Row[]>`insert into stock_movements (id_item, movement_type, quantity, unit_cost, reason_code, notes, reversed_movement_id, created_by_user_id)
          values (${String(before.id_item)}, ${String(before.movement_type)}, ${String(-num(before.quantity))}, ${before.unit_cost as string ?? null},
                  ${before.reason_code ? 'data_correction' : null}, ${reason}, ${String(before.id_stock_movement)}, ${actor}) returning *`;
        return row;
      },
    },
  },
  stock_count_items: {
    async beforeWrite(tx, row, before) {
      const countId = String((before ?? row).id_stock_count);
      const [count] = await tx<{ status: string }[]>`select status from stock_counts where id_stock_count = ${countId}`;
      if (!count || !['draft', 'in_progress'].includes(count.status)) throw new ApiError(409, 'invalid_transition', 'Sayım tamamlandıktan sonra satırlar değiştirilemez.');
      if (!before) {
        const [item] = await tx<{ current_stock: string | null }[]>`select current_stock from items where id_item = ${String(row.id_item)}`;
        row.system_quantity = item?.current_stock ?? '0';
      }
    },
  },
  stock_counts: {
    async beforeAction(tx, action, before, _set, actor) {
      if (action !== 'post') return;
      const lines = await tx<{ id_stock_count_item: string; id_item: string; variance_quantity: string | null }[]>`
        select id_stock_count_item, id_item, variance_quantity from stock_count_items
        where id_stock_count = ${String(before.id_stock_count)} and counted_quantity is not null and variance_quantity <> 0`;
      for (const l of lines) {
        await tx`insert into stock_movements (id_item, movement_type, quantity, id_stock_count_item, reason_code, created_by_user_id)
          values (${l.id_item}, 'count_adjustment', ${l.variance_quantity}, ${l.id_stock_count_item}, 'count_variance', ${actor})`;
      }
    },
  },
  users: {
    async afterAction(tx, action, before) {
      if (action === 'suspend') await revokeAllSessions(tx, String(before.id_user));
    },
  },
};

export async function createRow(sql: Sql, perms: Set<string>, actor: string, table: string, values: Record<string, unknown>) {
  const { meta } = await visibleTable(sql, perms, table);
  const m = META[table];
  if (!m || (m.write_mode !== 'crud' && m.write_mode !== 'append_only')) throw new ApiError(403, 'not_editable', 'Bu tabloya buradan kayıt eklenmez.');
  const row = pick(meta, table, 'create', values);
  if (m.type_permissions) {
    const need = m.type_permissions.map[String(row[m.type_permissions.column] ?? '')];
    if (!need || !perms.has(need)) throw forbidden();
  } else if (!m.create_permission || !perms.has(m.create_permission)) throw forbidden();
  const names = new Set(meta.columns.map(c => c.name));
  if (names.has('created_by_user_id')) row.created_by_user_id = actor;
  // Who granted / assigned / issued the row is the person creating it (ROLEPERM, USRROLE, FREEPASS docs).
  for (const c of ['granted_by_user_id', 'assigned_by_user_id', 'issued_by_user_id']) if (names.has(c) && row[c] == null) row[c] = actor;
  if (names.has('updated_by_user_id')) row.updated_by_user_id = actor;
  return sql.begin(async tx => {
    await HOOKS[table]?.beforeWrite?.(tx, row, null, actor);
    // Required per the documents, checked after the table's own defaults (e.g. a line takes its category from the item).
    const missing = (m.required_on_create ?? []).filter(c => row[c] == null && writableColumns(meta, table, 'create').some(w => w.name === c));
    if (missing.length) throw badRequest('validation_failed', 'Zorunlu alanlar boş.', missing.map(c => ({ path: c, message: `${c}: zorunlu` })));
    const [created] = await tx`insert into ${tx(table)} ${tx(row)} returning *`;
    const id = String(created[meta.pk]);
    await HOOKS[table]?.afterWrite?.(tx, created, null, actor);
    await audit(tx, { actorUserId: actor, action: `${table}.create`, entityType: table, entityId: id, source: 'admin_web',
      changeData: Object.fromEntries(Object.entries(row).filter(([k]) => !BOOKKEEPING.has(k)).map(([k, v]) => [k, { old: null, new: json(v) }])) });
    return { id, row: present(meta, created, perms) };
  });
}

export async function updateRow(sql: Sql, perms: Set<string>, actor: string, table: string, id: string, values: Record<string, unknown>) {
  const { meta } = await visibleTable(sql, perms, table);
  const m = META[table];
  if (!m || m.write_mode !== 'crud') throw new ApiError(403, 'not_editable', 'Bu tablodaki kayıtlar buradan düzenlenmez.');
  const patch = pick(meta, table, 'update', values);
  return sql.begin(async tx => {
    const before = await load(tx, meta, table, id);
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify(json(before[k])) !== JSON.stringify(json(v))
      && !(before[k] instanceof Date && v != null && new Date(String(v)).getTime() === (before[k] as Date).getTime())));
    if (!Object.keys(changed).length) return { id, row: present(meta, before, perms), changed: [] as string[] };
    for (const col of Object.keys(changed)) {
      const need = m.field_permissions?.[col] ?? m.update_permission;
      if (!need || !perms.has(need)) throw forbidden(`${col} alanını değiştirme yetkin yok.`);
    }
    if ('status' in changed && m.status_transitions) {
      const from = String(before.status), to = String(changed.status);
      const allowed = m.status_transitions[from];
      if (allowed && !allowed.includes(to)) throw new ApiError(409, 'invalid_transition', `Durum ${from} → ${to} değiştirilemez.`);
    }
    await HOOKS[table]?.beforeWrite?.(tx, changed, before, actor);
    if (meta.columns.some(c => c.name === 'updated_by_user_id')) changed.updated_by_user_id = actor;
    const [after] = await tx`update ${tx(table)} set ${tx(changed)} where ${tx(meta.pk)}::text = ${id} returning *`;
    await HOOKS[table]?.afterWrite?.(tx, after, before, actor);
    const diff = Object.fromEntries(Object.keys(changed).filter(k => !BOOKKEEPING.has(k)).map(k => [k, { old: json(before[k]), new: json(after[k]) }]));
    await audit(tx, { actorUserId: actor, action: `${table}.update`, entityType: table, entityId: id, source: 'admin_web', changeData: diff });
    return { id, row: present(meta, after, perms), changed: Object.keys(diff) };
  });
}

// past participle → the stamp columns an action fills when the table has them (posted_at, posted_by_user_id ...)
const STAMPS: Record<string, string> = {
  post: 'posted', cancel: 'cancelled', reverse: 'reversed', approve: 'approved', complete: 'completed', close: 'closed', verify: 'verified',
  submit: 'submitted', archive: 'archived', revoke: 'revoked', confirm: 'confirmed', decline: 'declined', reject: 'declined', start: 'started',
};
const REASONS = ['reversal_reason', 'cancellation_reason_text', 'cancel_reason', 'cancellation_note', 'reason', 'notes'];

export async function runAction(sql: Sql, perms: Set<string>, actor: string, table: string, id: string, actionName: string, reason: string | null) {
  const { meta } = await visibleTable(sql, perms, table);
  const action = META[table]?.actions?.find(a => a.action === actionName);
  if (!action) throw notFound('Action');
  if (!perms.has(action.permission)) throw forbidden();
  if (action.needs_reason && (!reason || reason.trim().length < 3)) throw badRequest('reason_required', 'Bir gerekçe yaz (en az 3 karakter).');
  const names = new Set(meta.columns.map(c => c.name));
  return sql.begin(async tx => {
    const before = await load(tx, meta, table, id);
    const statusColumn = action.status_column ?? 'status';
    if (action.from_status.length && !action.from_status.includes(String(before[statusColumn]))) {
      throw new ApiError(409, 'invalid_transition', `Bu işlem "${before[statusColumn]}" durumundaki kayıtta yapılamaz.`);
    }
    const custom = HOOKS[table]?.customAction?.[action.action];
    if (custom) {
      const made = await custom(tx, before, actor, reason?.trim() || null);
      await audit(tx, { actorUserId: actor, action: `${table}.${action.action}`, entityType: table, entityId: id, source: 'admin_web',
        reason: reason?.trim() || null, metadata: { created: made[meta.pk] ?? null } });
      return { id: String(made[meta.pk] ?? id), row: present(meta, made, perms) };
    }
    const set: Record<string, unknown> = { [statusColumn]: action.to_status };
    const stamp = STAMPS[action.action] ?? `${action.action}ed`;
    if (names.has(`${stamp}_at`)) set[`${stamp}_at`] = new Date().toISOString();
    if (names.has(`${stamp}_by_user_id`)) set[`${stamp}_by_user_id`] = actor;
    const reasonColumn = action.needs_reason ? REASONS.find(r => names.has(r) && !meta.columns.find(c => c.name === r)?.options) : undefined;
    if (reasonColumn && reason) set[reasonColumn] = reason.trim();
    if (names.has('updated_by_user_id')) set.updated_by_user_id = actor;
    await HOOKS[table]?.beforeAction?.(tx, action.action, before, set, actor, reason?.trim() || null);
    const [after] = await tx`update ${tx(table)} set ${tx(set)} where ${tx(meta.pk)}::text = ${id} returning *`;
    await HOOKS[table]?.afterAction?.(tx, action.action, before, after, actor, reason?.trim() || null);
    await audit(tx, { actorUserId: actor, action: `${table}.${action.action}`, entityType: table, entityId: id, source: 'admin_web',
      reason: reason?.trim() || null, changeData: { [statusColumn]: { old: json(before[statusColumn]), new: json(after[statusColumn]) } } });
    return { id, row: present(meta, after, perms) };
  });
}

/** Hard delete only where the documents allow it (draft lines, pending money movements); triggers re-check. */
export async function deleteRow(sql: Sql, perms: Set<string>, actor: string, table: string, id: string) {
  const { meta } = await visibleTable(sql, perms, table);
  const m = META[table];
  if (!m?.deletable_when) throw new ApiError(403, 'not_deletable', 'Kayıtlar silinmez; durumunu değiştir.');
  const need = m.update_permission ?? m.create_permission;
  if (!need || !perms.has(need)) throw forbidden();
  await sql.begin(async tx => {
    const before = await load(tx, meta, table, id);
    const rule = m.deletable_when!;
    if (rule.column !== '*' && !rule.values.includes(String(before[rule.column]))) throw new ApiError(409, 'not_deletable', 'Bu kayıt bu durumda silinemez.');
    await tx`delete from ${tx(table)} where ${tx(meta.pk)}::text = ${id}`;
    await HOOKS[table]?.afterDelete?.(tx, before);
    await audit(tx, { actorUserId: actor, action: `${table}.delete`, entityType: table, entityId: id, source: 'admin_web',
      changeData: Object.fromEntries(Object.entries(before).filter(([k]) => !BOOKKEEPING.has(k)).map(([k, v]) => [k, { old: json(v), new: null }])) });
  });
}

/** What the admin shell needs to build forms for one table, for this viewer. */
export function writeInfo(table: string, meta: CatalogTable, perms: Set<string>) {
  const m = META[table];
  return {
    purpose: m?.purpose_tr ?? null, help: m?.fields ?? {}, enums: m?.enums ?? {}, rules: m?.rules_tr ?? [], derived: m?.derived ?? {},
    mode: m?.write_mode ?? 'read_only', can_create: canCreate(table, perms), can_update: canUpdate(table, perms),
    create_columns: canCreate(table, perms) ? writableColumns(meta, table, 'create').map(c => c.name) : [],
    update_columns: canUpdate(table, perms) ? writableColumns(meta, table, 'update').map(c => c.name)
      .filter(c => { const need = m?.field_permissions?.[c] ?? m?.update_permission; return !!need && perms.has(need); }) : [],
    required: m?.required_on_create ?? [],
    type_permissions: m?.type_permissions ? { column: m.type_permissions.column, allowed: Object.entries(m.type_permissions.map).filter(([, p]) => perms.has(p)).map(([v]) => v) } : null,
    actions: (m?.actions ?? []).filter(a => perms.has(a.permission)).map(a => ({ action: a.action, label: a.label_tr, from: a.from_status, column: a.status_column ?? 'status', needs_reason: !!a.needs_reason, effects: a.effects_tr ?? null })),
    deletable_when: m?.deletable_when && canUpdate(table, perms) ? m.deletable_when : null,
  };
}

export { catalog };
