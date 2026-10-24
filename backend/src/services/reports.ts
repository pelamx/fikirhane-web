import type { Sql } from '../db.ts';

/**
 * Finance reports (report.view, report.export) and list exports (document.export, transaction.export). Amounts come from
 * posted records only: a document counts on its document date, a money movement on the Istanbul date it happened.
 */

export interface Period { from: string; to: string }

/** Default period: the current month in Istanbul. */
export function thisMonth(): Period {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

export async function financeReport(sql: Sql, period: Period, withBalances: boolean) {
  const { from, to } = period;
  const [centers, categories, cash, balances] = await Promise.all([
    sql<{ name: string; income: string; expense: string }[]>`
      select fc.center_name as name,
             coalesce(sum(l.net_amount) filter (where d.direction = 'sale'), 0)::text as income,
             coalesce(sum(l.net_amount) filter (where d.direction = 'purchase'), 0)::text as expense
      from document_items l join documents d using (id_document) join financial_centers fc using (id_financial_center)
      where d.status = 'posted' and d.document_date between ${from} and ${to}
      group by fc.center_name, fc.sort_order order by fc.sort_order nulls last, fc.center_name`,
    sql<{ name: string; direction: string; amount: string; tax: string }[]>`
      select cat.category_name as name, cat.direction, sum(l.net_amount)::text as amount, sum(l.tax_amount)::text as tax
      from document_items l join documents d using (id_document) join financial_categories cat using (id_financial_category)
      where d.status = 'posted' and d.document_date between ${from} and ${to}
      group by cat.category_name, cat.direction, cat.sort_order order by cat.direction, cat.sort_order nulls last, cat.category_name`,
    sql<{ name: string; currency_code: string; money_in: string; money_out: string }[]>`
      select a.account_name as name, a.currency_code,
             coalesce(sum(t.amount) filter (where t.to_account_id = a.id_account), 0)::text as money_in,
             coalesce(sum(t.amount) filter (where t.from_account_id = a.id_account), 0)::text as money_out
      from accounts a join transactions t on a.id_account in (t.to_account_id, t.from_account_id)
      where t.status = 'posted' and (t.transaction_at at time zone 'Europe/Istanbul')::date between ${from} and ${to}
      group by a.id_account, a.account_name, a.currency_code, a.sort_order order by a.sort_order nulls last, a.account_name`,
    withBalances ? sql<{ name: string; account_type: string; currency_code: string; balance: string; reconciled: string; open_count: number }[]>`
      select a.account_name as name, a.account_type, a.currency_code, coalesce(a.current_balance, a.opening_balance)::text as balance,
             (a.opening_balance
               + coalesce(sum(t.amount) filter (where t.to_account_id = a.id_account and t.reconciliation_status = 'reconciled'), 0)
               - coalesce(sum(t.amount) filter (where t.from_account_id = a.id_account and t.reconciliation_status = 'reconciled'), 0))::text as reconciled,
             count(t.id_transaction) filter (where t.reconciliation_status = 'unreconciled')::int as open_count
      from accounts a left join transactions t on a.id_account in (t.to_account_id, t.from_account_id) and t.status = 'posted'
      where a.status <> 'archived'
      group by a.id_account order by a.sort_order nulls last, a.account_name` : null,
  ]);
  const sum = (rows: { [k: string]: string }[], key: string) => rows.reduce((s, r) => s + Number(r[key]), 0).toFixed(2);
  return {
    period, totals: { income: sum(centers, 'income'), expense: sum(centers, 'expense'),
      net: (Number(sum(centers, 'income')) - Number(sum(centers, 'expense'))).toFixed(2) },
    centers, categories, cash, ...(balances ? { balances } : {}),
  };
}

// ---------- CSV (semicolon-separated, comma decimals, UTF-8 with BOM: opens cleanly in Turkish Excel) ----------

type Cell = string | number | null | undefined | Date;
const AMOUNT = /^-?\d+(\.\d+)?$/;
function field(v: Cell): string {
  if (v == null) return '';
  const text = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? String(v).replace('.', ',') : AMOUNT.test(v) ? v.replace('.', ',') : v;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export const csv = (header: string[], rows: Cell[][]) => '\uFEFF' + [header, ...rows].map(r => r.map(field).join(';')).join('\r\n') + '\r\n';

const DIRECTIONS: Record<string, string> = { sale: 'Satış', purchase: 'Alış', income: 'Gelir', expense: 'Gider' };

export async function financeReportCsv(sql: Sql, period: Period, withBalances: boolean) {
  const r = await financeReport(sql, period, withBalances);
  const rows: Cell[][] = [
    ...r.centers.map(c => ['Finans merkezi', c.name, c.income, c.expense, (Number(c.income) - Number(c.expense)).toFixed(2)]),
    ...r.categories.map(c => ['Kategori', `${c.name} (${DIRECTIONS[c.direction] ?? c.direction})`,
      c.direction === 'income' ? c.amount : '', c.direction === 'expense' ? c.amount : '', '']),
    ...r.cash.map(c => ['Hesap hareketi', `${c.name} (${c.currency_code})`, c.money_in, c.money_out, (Number(c.money_in) - Number(c.money_out)).toFixed(2)]),
    ...(r.balances ?? []).map(b => ['Bakiye', `${b.name} (${b.currency_code})`, b.balance, b.reconciled, String(b.open_count)]),
  ];
  return csv([`Bölüm (${period.from} – ${period.to})`, 'Ad', 'Gelir / giriş / bakiye', 'Gider / çıkış / mutabık bakiye', 'Net / bekleyen'], rows);
}

const STATUS: Record<string, string> = {
  draft: 'Taslak', posted: 'Kesinleşti', cancelled: 'İptal', pending: 'Bekliyor', failed: 'Başarısız', reversed: 'Ters kayıt',
  reconciled: 'Mutabık', unreconciled: 'Mutabakat bekliyor',
};
const TYPES: Record<string, string> = {
  invoice: 'Fatura', receipt: 'Fiş', internal: 'İç belge', collection: 'Tahsilat', expense_payment: 'Gider ödemesi', transfer: 'Transfer',
  refund: 'İade', adjustment: 'Düzeltme', cash: 'Nakit', credit_card: 'Kredi kartı', debit_card: 'Banka kartı', bank_transfer: 'Havale/EFT',
  online_payment: 'Online ödeme', other: 'Diğer',
};
const tr = (map: Record<string, string>, v: string | null) => (v == null ? '' : map[v] ?? v);

export async function documentsCsv(sql: Sql, { from, to }: Period) {
  const rows = await sql<Record<string, string | null>[]>`
    select d.document_date::text, d.document_number, d.direction, d.document_type, d.status,
           coalesce(u.first_name || ' ' || u.last_name, o.organization_name, d.billing_name) as counterparty, d.description,
           d.subtotal_amount::text, d.discount_amount::text, d.tax_amount::text, d.grand_total::text, d.currency_code,
           coalesce((select sum(allocated_amount) from transaction_allocations a where a.id_document = d.id_document and a.status = 'active'), 0)::text as paid
    from documents d left join users u using (id_user) left join organizations o using (id_organization)
    where d.document_date between ${from} and ${to} order by d.document_date, d.document_number nulls last`;
  return csv(['Tarih', 'Belge no', 'Yön', 'Tür', 'Durum', 'Karşı taraf', 'Açıklama', 'Ara toplam', 'İndirim', 'Vergi', 'Genel toplam', 'Para birimi', 'Ödenen'],
    rows.map(r => [r.document_date, r.document_number, tr(DIRECTIONS, r.direction), tr(TYPES, r.document_type), tr(STATUS, r.status), r.counterparty,
      r.description, r.subtotal_amount, r.discount_amount, r.tax_amount, r.grand_total, r.currency_code, r.paid]));
}

export async function transactionsCsv(sql: Sql, { from, to }: Period) {
  const rows = await sql<Record<string, string | null>[]>`
    select to_char(t.transaction_at at time zone 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') as at, t.transaction_type, fa.account_name as from_account,
           ta.account_name as to_account, t.amount::text, t.currency_code, t.payment_method, t.status, t.reconciliation_status, t.reference_number, t.description
    from transactions t left join accounts fa on fa.id_account = t.from_account_id left join accounts ta on ta.id_account = t.to_account_id
    where (t.transaction_at at time zone 'Europe/Istanbul')::date between ${from} and ${to} order by t.transaction_at`;
  return csv(['Zaman', 'Tür', 'Çıkış hesabı', 'Giriş hesabı', 'Tutar', 'Para birimi', 'Ödeme yöntemi', 'Durum', 'Mutabakat', 'Referans', 'Açıklama'],
    rows.map(r => [r.at, tr(TYPES, r.transaction_type), r.from_account, r.to_account, r.amount, r.currency_code, tr(TYPES, r.payment_method),
      tr(STATUS, r.status), tr(STATUS, r.reconciliation_status), r.reference_number, r.description]));
}
