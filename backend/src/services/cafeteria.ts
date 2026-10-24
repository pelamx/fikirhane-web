import type { Sql } from '../db.ts';
import { ApiError, badRequest } from '../errors.ts';
import { accountBalances, documentStock, documentTotals, nextDocumentNumber } from './admin-write.ts';
import { audit } from './audit.ts';

/**
 * Cafeteria counter (cafeteria_sale.create). One sale is the documented chain in a single step (ACCOUNTS rule 21,
 * DOCUMENTS rule 16): a posted sale receipt with one line per item, the stock taken out, the payment collected into the
 * cash or card account, and the payment allocated to the receipt.
 */

const DESCRIPTION = 'Kafeterya satışı';
export type PaymentMethod = 'cash' | 'card';

interface MenuItem {
  id_item: string; item_code: string; item_name: string; unit: string | null; price: string; tax_rate: string; currency_code: string;
  current_stock: string | null; is_stock_tracked: boolean; id_financial_center: string; id_financial_category: string;
}

/** What the counter sells: active sellable items with a price whose default center is a cafeteria center. */
async function menuItems(sql: Sql, ids?: string[]): Promise<MenuItem[]> {
  return sql<MenuItem[]>`
    select i.id_item::text, i.item_code, i.item_name, i.unit, i.default_selling_price::text as price, coalesce(i.default_tax_rate, 0)::text as tax_rate,
           coalesce(i.currency_code, 'TRY') as currency_code, i.current_stock::text, i.is_stock_tracked,
           i.default_financial_center_id::text as id_financial_center, i.default_revenue_category_id::text as id_financial_category
    from items i join financial_centers fc on fc.id_financial_center = i.default_financial_center_id and fc.center_type = 'cafeteria'
    where i.status = 'active' and i.is_sellable and i.default_selling_price is not null and i.default_revenue_category_id is not null
      ${ids ? sql`and i.id_item::text = any(${ids})` : sql``}
    order by i.sort_order nulls last, i.item_name`;
}

/** The account a payment lands in: the cash box, or for cards the POS account (else the bank account). */
async function paymentAccount(sql: Sql, method: PaymentMethod, currency: string) {
  const types = method === 'cash' ? ['cash'] : ['pos', 'bank'];
  const [account] = await sql<{ id_account: string; account_name: string }[]>`
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

export async function cafeteriaSale(sql: Sql, actor: string, input: { lines: { id_item: string; quantity: number }[]; payment_method: PaymentMethod }) {
  const wanted = new Map<string, number>();
  for (const l of input.lines) wanted.set(l.id_item, (wanted.get(l.id_item) ?? 0) + l.quantity);
  const items = await menuItems(sql, [...wanted.keys()]);
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
    for (const item of items) {
      const quantity = wanted.get(item.id_item)!;
      const gross = Math.round(quantity * num(item.price) * 100) / 100;
      const tax = Math.round(gross * num(item.tax_rate)) / 100;
      await tx`insert into document_items (id_document, line_no, id_item, id_financial_center, id_financial_category, description, quantity, unit,
          unit_price, gross_amount, net_amount, tax_rate, tax_amount, line_total, created_by_user_id, updated_by_user_id)
        values (${doc.id_document}, ${++lineNo}, ${item.id_item}, ${item.id_financial_center}, ${item.id_financial_category}, ${item.item_name},
          ${String(quantity)}, ${item.unit}, ${item.price}, ${money(gross)}, ${money(gross)}, ${item.tax_rate}, ${money(tax)}, ${money(gross + tax)}, ${actor}, ${actor})`;
    }
    await documentTotals(tx, doc.id_document);
    const number = await nextDocumentNumber(tx, 'sale');
    const [posted] = await tx<{ grand_total: string }[]>`
      update documents set status = 'posted', document_number = ${number}, posted_at = now(), posted_by_user_id = ${actor}, updated_by_user_id = ${actor}
      where id_document = ${doc.id_document} returning grand_total::text`;
    if (num(posted.grand_total) <= 0) throw badRequest('validation_failed', 'Satış tutarı sıfırdan büyük olmalı.');
    await documentStock(tx, doc.id_document, 'post', actor);
    const [payment] = await tx<{ id_transaction: string }[]>`
      insert into transactions (transaction_type, to_account_id, amount, currency_code, payment_method, status, posted_at, description, created_by_user_id, updated_by_user_id)
      values ('collection', ${account.id_account}, ${posted.grand_total}, ${currency}, ${input.payment_method === 'cash' ? 'cash' : 'credit_card'}, 'posted', now(),
              ${`${DESCRIPTION} ${number}`}, ${actor}, ${actor}) returning id_transaction::text`;
    await tx`insert into transaction_allocations (id_transaction, id_document, allocated_amount, created_by_user_id, updated_by_user_id)
      values (${payment.id_transaction}, ${doc.id_document}, ${posted.grand_total}, ${actor}, ${actor})`;
    await accountBalances(tx, [account.id_account]);
    await audit(tx, { actorUserId: actor, action: 'cafeteria.sale', entityType: 'documents', entityId: doc.id_document, source: 'admin_web',
      metadata: { document_number: number, total: posted.grand_total, payment_method: input.payment_method, id_transaction: payment.id_transaction } });
    return { id_document: doc.id_document, document_number: number, grand_total: posted.grand_total, currency_code: currency, account: account.account_name };
  });
}
