import type { Db, Sql, Tx } from '../db.ts';
import { ApiError, badRequest } from '../errors.ts';
import { accountBalances, documentStock, documentTotals, nextDocumentNumber } from './admin-write.ts';
import { audit } from './audit.ts';

/**
 * Cafeteria counter (cafeteria_sale.create). One sale is the documented chain in a single step (ACCOUNTS rule 21,
 * DOCUMENTS rule 16): a posted sale receipt with one line per item, the stock taken out, the payment collected into the
 * cash or card account, and the payment allocated to the receipt.
 */

const DESCRIPTION = 'Kafeterya satışı';
export type Account = { id_account: string; account_name: string };
export type PaymentMethod = 'cash' | 'card';

export interface MenuItem {
  id_item: string; item_code: string; item_name: string; unit: string | null; price: string; tax_rate: string; currency_code: string;
  current_stock: string | null; is_stock_tracked: boolean; id_financial_center: string; id_financial_category: string;
}

/** What the counter sells: active sellable items with a price whose default center is a cafeteria center. */
export async function menuItems(sql: Sql, by: { ids?: string[]; codes?: string[] } = {}): Promise<MenuItem[]> {
  return sql<MenuItem[]>`
    select i.id_item::text, i.item_code, i.item_name, i.unit, i.default_selling_price::text as price, coalesce(i.default_tax_rate, 0)::text as tax_rate,
           coalesce(i.currency_code, 'TRY') as currency_code, i.current_stock::text, i.is_stock_tracked,
           i.default_financial_center_id::text as id_financial_center, i.default_revenue_category_id::text as id_financial_category
    from items i join financial_centers fc on fc.id_financial_center = i.default_financial_center_id and fc.center_type = 'cafeteria'
    where i.status = 'active' and i.is_sellable and i.default_selling_price is not null and i.default_revenue_category_id is not null
      ${by.ids ? sql`and i.id_item::text = any(${by.ids})` : sql``}
      ${by.codes ? sql`and i.item_code = any(${by.codes})` : sql``}
    order by i.sort_order nulls last, i.item_name`;
}

/** The account a payment lands in: the cash box, or for cards the POS account (else the bank account). */
export async function paymentAccount(sql: Db, method: PaymentMethod, currency: string) {
  const types = method === 'cash' ? ['cash'] : ['pos', 'bank'];
  const [account] = await sql<Account[]>`
    select id_account::text, account_name from accounts
    where status = 'active' and currency_code = ${currency} and account_type = any(${types})
    order by array_position(${types}::text[], account_type), sort_order nulls last limit 1`;
  return account ?? null;
}

export async function cafeteriaCounter(sql: Sql) {
  const items = await menuItems(sql);
  const currency = items[0]?.currency_code ?? 'TRY';
  const [cash, card] = await Promise.all([paymentAccount(sql, 'cash', currency), paymentAccount(sql, 'card', currency)]);
  const today = await sql`
    select d.id_document::text, d.document_number, d.posted_at, d.grand_total::text, d.currency_code, t.payment_method,
           string_agg(l.description || ' × ' || trim(trailing '.' from trim(trailing '0' from l.quantity::text)), ', ' order by l.line_no) as lines
    from documents d join document_items l using (id_document)
    left join transaction_allocations a on a.id_document = d.id_document and a.status = 'active'
    left join transactions t on t.id_transaction = a.id_transaction
    where d.description = ${DESCRIPTION} and d.status = 'posted' and (d.posted_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date
    group by d.id_document, t.payment_method order by d.posted_at desc limit 30`;
  return {
    items: items.map(({ id_financial_center: _c, id_financial_category: _k, ...i }) => i),
    payment: { cash: cash?.account_name ?? null, card: card?.account_name ?? null },
    today,
  };
}

const num = (v: string | number) => Number(v);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** A line's amounts as the document_items checks want them: gross = round(qty × price, 2), tax on top of it. */
export function lineValues(item: Pick<MenuItem, 'price' | 'tax_rate'>, quantity: number) {
  const gross = Math.round(quantity * num(item.price) * 100) / 100;
  const tax = Math.round(gross * num(item.tax_rate)) / 100;
  return { quantity: String(quantity), unit_price: item.price, gross_amount: money(gross), net_amount: money(gross), tax_rate: item.tax_rate,
    tax_amount: money(tax), line_total: money(gross + tax) };
}

export async function insertLine(tx: Tx, idDocument: string, lineNo: number, item: MenuItem, quantity: number, actor: string) {
  const v = lineValues(item, quantity);
  await tx`insert into document_items (id_document, line_no, id_item, id_financial_center, id_financial_category, description, quantity, unit,
      unit_price, gross_amount, net_amount, tax_rate, tax_amount, line_total, created_by_user_id, updated_by_user_id)
    values (${idDocument}, ${lineNo}, ${item.id_item}, ${item.id_financial_center}, ${item.id_financial_category}, ${item.item_name},
      ${v.quantity}, ${item.unit}, ${v.unit_price}, ${v.gross_amount}, ${v.net_amount}, ${v.tax_rate}, ${v.tax_amount}, ${v.line_total}, ${actor}, ${actor})`;
}

/**
 * Settles a draft sale in one step: totals, number, post, stock out, the payment into `account` and its allocation.
 * With `pending`, that transaction (created when an online payment started) is posted instead of a new one; `provider`
 * records which payment provider collected the money and its payment id.
 */
export async function postSale(tx: Tx, idDocument: string, account: Account, method: 'cash' | 'credit_card' | 'online_payment', actor: string,
  opts: { action: string; source: 'admin_web' | 'public_web' | 'integration'; pending?: string; provider?: { name: string; id: string } }) {
  await documentTotals(tx, idDocument);
  const number = await nextDocumentNumber(tx, 'sale');
  const [posted] = await tx<{ grand_total: string; currency_code: string; description: string }[]>`
    update documents set status = 'posted', document_number = ${number}, posted_at = now(), posted_by_user_id = ${actor}, updated_by_user_id = ${actor}
    where id_document = ${idDocument} returning grand_total::text, currency_code, description`;
  if (num(posted.grand_total) <= 0) throw badRequest('validation_failed', 'Satış tutarı sıfırdan büyük olmalı.');
  await documentStock(tx, idDocument, 'post', actor);
  const [payment] = opts.pending
    ? await tx<{ id_transaction: string }[]>`
        update transactions set status = 'posted', posted_at = now(), provider_transaction_id = ${opts.provider?.id ?? null},
          description = ${`${posted.description} ${number}`}, updated_by_user_id = ${actor}
        where id_transaction = ${opts.pending} and status = 'pending' and amount = ${posted.grand_total} returning id_transaction::text`
    : await tx<{ id_transaction: string }[]>`
        insert into transactions (transaction_type, to_account_id, amount, currency_code, payment_method, status, posted_at, description,
          provider_name, provider_transaction_id, created_by_user_id, updated_by_user_id)
        values ('collection', ${account.id_account}, ${posted.grand_total}, ${posted.currency_code}, ${method}, 'posted', now(),
                ${`${posted.description} ${number}`}, ${opts.provider?.name ?? null}, ${opts.provider?.id ?? null}, ${actor}, ${actor}) returning id_transaction::text`;
  if (!payment) throw new ApiError(409, 'payment_mismatch', 'Ödeme tutarı hesapla eşleşmiyor.');
  await tx`insert into transaction_allocations (id_transaction, id_document, allocated_amount, created_by_user_id, updated_by_user_id)
    values (${payment.id_transaction}, ${idDocument}, ${posted.grand_total}, ${actor}, ${actor})`;
  await accountBalances(tx, [account.id_account]);
  await audit(tx, { actorUserId: actor, action: opts.action, entityType: 'documents', entityId: idDocument, source: opts.source,
    metadata: { document_number: number, total: posted.grand_total, payment_method: method, id_transaction: payment.id_transaction } });
  return { id_document: idDocument, document_number: number, grand_total: posted.grand_total, currency_code: posted.currency_code, account: account.account_name };
}

export async function cafeteriaSale(sql: Sql, actor: string, input: { lines: { id_item: string; quantity: number }[]; payment_method: PaymentMethod }) {
  const wanted = new Map<string, number>();
  for (const l of input.lines) wanted.set(l.id_item, (wanted.get(l.id_item) ?? 0) + l.quantity);
  const items = await menuItems(sql, { ids: [...wanted.keys()] });
  const missing = [...wanted.keys()].filter(id => !items.some(i => i.id_item === id));
  if (missing.length) throw badRequest('validation_failed', 'Bu ürün kafeteryada satılmıyor.', missing.map(id => ({ path: id, message: 'satışta değil' })));
  const currencies = new Set(items.map(i => i.currency_code));
  if (currencies.size > 1) throw badRequest('validation_failed', 'Farklı para birimindeki ürünler aynı satışta olamaz.');
  const currency = items[0].currency_code;
  const account = await paymentAccount(sql, input.payment_method, currency);
  if (!account) throw new ApiError(409, 'no_payment_account', input.payment_method === 'cash'
    ? 'Aktif bir kasa hesabı yok; muhasebe bir kasa hesabı açmalı.' : 'Kart ödemesi için aktif bir POS ya da banka hesabı yok.');

  return sql.begin(async tx => {
    const [doc] = await tx<{ id_document: string }[]>`
      insert into documents (direction, document_type, currency_code, description, created_by_user_id, updated_by_user_id)
      values ('sale', 'receipt', ${currency}, ${DESCRIPTION}, ${actor}, ${actor}) returning id_document::text`;
    let lineNo = 0;
    for (const item of items) await insertLine(tx, doc.id_document, ++lineNo, item, wanted.get(item.id_item)!, actor);
    return postSale(tx, doc.id_document, account, input.payment_method === 'cash' ? 'cash' : 'credit_card', actor, { action: 'cafeteria.sale', source: 'admin_web' });
  });
}
