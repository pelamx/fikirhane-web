import type { Config } from '../config.ts';
import type { Sql, Tx } from '../db.ts';
import { ApiError, badRequest, notFound } from '../errors.ts';
import { documentTotals } from './admin-write.ts';
import { audit } from './audit.ts';
import { lineValues, insertLine, menuItems, paymentAccount, postSale, type Account, type MenuItem } from './cafeteria.ts';
import { kitchenProvider, type CheckoutResult } from './payments/provider.ts';

/**
 * Kitchen self-service (mutfak): DOCUMENTS rule 16's open tab. A person with a booking today scans product labels into
 * one draft sale receipt (their tab) and pays it once, online, when they leave; staff can also close it at the desk.
 * Paying posts the receipt, takes the stock out and allocates the payment (cafeteria.ts postSale).
 */

export const TAB = 'Mutfak hesabı';
const MAX_QUANTITY = 20;
const TODAY = (sql: Sql | Tx) => sql`(now() at time zone 'Europe/Istanbul')::date`;

/** A booking today keeps the kitchen open to its holder, also once the session is over (completed) so they can still pay. */
export async function eligible(sql: Sql | Tx, userId: string) {
  const [row] = await sql<{ ok: boolean }[]>`
    select exists (select 1 from bookings b join events e using (id_event)
      where b.id_user = ${userId} and b.booking_status in ('confirmed', 'checked_in', 'completed')
        and (e.start_datetime at time zone 'Europe/Istanbul')::date = ${TODAY(sql)}) as ok`;
  return row.ok;
}

interface TabRow { id_document: string; created_at: Date; earlier: boolean; locked: boolean; grand_total: string; currency_code: string }

async function tabRow(sql: Sql | Tx, userId: string, lock = false) {
  const [row] = await sql<TabRow[]>`
    select d.id_document::text, d.created_at, (d.created_at at time zone 'Europe/Istanbul')::date < ${TODAY(sql)} as earlier,
           exists (select 1 from kitchen_checkouts k where k.id_document = d.id_document and k.status = 'open' and k.expires_at > now()) as locked,
           d.grand_total::text, d.currency_code
    from documents d where d.id_user = ${userId} and d.status = 'draft' and d.description = ${TAB}
    ${lock ? sql`for update of d` : sql``}`;
  return row ?? null;
}

const linesOf = (sql: Sql | Tx, idDocument: string) => sql`
  select l.id_document_item::text, i.item_code, l.description, l.quantity::int as quantity, l.unit_price::text, l.line_total::text
  from document_items l left join items i using (id_item) where l.id_document = ${idDocument} order by l.line_no`;

/** The kitchen page: whether this person may add to a tab, their tab, and whether online payment is on. */
export async function kitchenState(sql: Sql, config: Config, userId: string) {
  const [ok, tab] = await Promise.all([eligible(sql, userId), tabRow(sql, userId)]);
  return {
    eligible: ok,
    online_payment: config.kitchenPayment !== 'off',
    tab: tab && { ...tab, lines: await linesOf(sql, tab.id_document) },
  };
}

/** The card a scanned label opens: name and price with tax. */
export async function kitchenItem(sql: Sql, code: string) {
  const [item] = await menuItems(sql, { codes: [code] });
  if (!item) throw notFound('Ürün');
  return { item_code: item.item_code, item_name: item.item_name, price: lineValues(item, 1).line_total, currency_code: item.currency_code };
}

/** The tab may change: the person has a booking today, the tab is from today and no payment is under way. */
async function editable(tx: Tx, userId: string, tab: TabRow | null) {
  if (tab?.locked) throw new ApiError(409, 'tab_locked', 'Ödemen sürüyor. Bitir ya da iptal et, sonra ürün ekleyebilirsin.');
  if (tab?.earlier) throw new ApiError(409, 'earlier_tab', 'Önceki ziyaretinden açık bir hesabın var; önce onu öde.');
  if (!await eligible(tx, userId)) throw new ApiError(403, 'kitchen_closed', 'Mutfak, bugün rezervasyonu olanlara açık.');
}

async function setLine(tx: Tx, userId: string, idDocument: string, line: { id_document_item: string; unit_price: string; tax_rate: string; quantity: number; description: string }, quantity: number) {
  if (quantity <= 0) {
    await tx`delete from document_items where id_document_item = ${line.id_document_item}`;
    await audit(tx, { actorUserId: userId, action: 'kitchen.line_remove', entityType: 'documents', entityId: idDocument, source: 'public_web',
      metadata: { item: line.description, quantity: line.quantity } });
    return;
  }
  const v = lineValues({ price: line.unit_price, tax_rate: line.tax_rate }, quantity);
  await tx`update document_items set quantity = ${v.quantity}, gross_amount = ${v.gross_amount}, net_amount = ${v.net_amount},
      tax_amount = ${v.tax_amount}, line_total = ${v.line_total}, updated_by_user_id = ${userId}
    where id_document_item = ${line.id_document_item}`;
  if (quantity < line.quantity) {
    await audit(tx, { actorUserId: userId, action: 'kitchen.line_remove', entityType: 'documents', entityId: idDocument, source: 'public_web',
      metadata: { item: line.description, quantity: line.quantity - quantity } });
  }
}

/** One more of the scanned product on the tab (opening the tab on the first scan); the price is the one of this moment. */
export async function addToTab(sql: Sql, userId: string, code: string) {
  const [item] = await menuItems(sql, { codes: [code] });
  if (!item) throw notFound('Ürün');
  await sql.begin(async tx => {
    let tab = await tabRow(tx, userId, true);
    await editable(tx, userId, tab);
    if (!tab) {
      await tx`insert into documents (direction, document_type, id_user, currency_code, description, created_by_user_id, updated_by_user_id)
        values ('sale', 'receipt', ${userId}, ${item.currency_code}, ${TAB}, ${userId}, ${userId})
        on conflict (id_user) where status = 'draft' and description = ${TAB} do nothing`;
      tab = (await tabRow(tx, userId, true))!;
    }
    if (tab.currency_code !== item.currency_code) throw badRequest('validation_failed', 'Farklı para birimindeki ürünler aynı hesapta olamaz.');
    const [line] = await tx<{ id_document_item: string; unit_price: string; tax_rate: string; quantity: number; description: string }[]>`
      select id_document_item::text, unit_price::text, tax_rate::text, quantity::int as quantity, description
      from document_items where id_document = ${tab.id_document} and id_item = ${item.id_item}`;
    if (line) {
      if (line.quantity >= MAX_QUANTITY) throw badRequest('validation_failed', `Bir üründen en çok ${MAX_QUANTITY} adet eklenebilir.`);
      await setLine(tx, userId, tab.id_document, line, line.quantity + 1);
    } else {
      const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(line_no), 0) + 1 as next from document_items where id_document = ${tab.id_document}`;
      await insertLine(tx, tab.id_document, next, item, 1, userId);
    }
    await documentTotals(tx, tab.id_document);
    await audit(tx, { actorUserId: userId, action: 'kitchen.line_add', entityType: 'documents', entityId: tab.id_document, source: 'public_web',
      metadata: { item: item.item_name } });
  });
}

/** Changes a line's quantity on the person's own tab; 0 takes it off. */
export async function setTabQuantity(sql: Sql, userId: string, idLine: string, quantity: number) {
  await sql.begin(async tx => {
    const tab = await tabRow(tx, userId, true);
    if (!tab) throw notFound('Hesap');
    if (tab.locked) throw new ApiError(409, 'tab_locked', 'Ödemen sürüyor. Bitir ya da iptal et, sonra hesabını değiştirebilirsin.');
    const [line] = await tx<{ id_document_item: string; unit_price: string; tax_rate: string; quantity: number; description: string }[]>`
      select id_document_item::text, unit_price::text, tax_rate::text, quantity::int as quantity, description
      from document_items where id_document = ${tab.id_document} and id_document_item = ${idLine}`;
    if (!line) throw notFound('Satır');
    // Taking things off is always allowed (an earlier tab or no booking today); adding needs an open kitchen.
    if (quantity > line.quantity) await editable(tx, userId, tab);
    await setLine(tx, userId, tab.id_document, line, Math.min(quantity, MAX_QUANTITY));
    await documentTotals(tx, tab.id_document);
  });
}

async function onlineAccount(sql: Sql | Tx, currency: string) {
  const [account] = await sql<Account[]>`select id_account::text, account_name from accounts
    where account_code = 'ONLINE_PAYMENTS' and status = 'active' and currency_code = ${currency}`;
  if (!account) throw new ApiError(409, 'no_payment_account', 'Online ödemeler hesabı yok ya da kapalı; muhasebe açmalı.');
  return account;
}

/** Closes payment attempts that are open on the tab (a new one is starting, or the person went back), unlocking it. */
async function closeOpenCheckouts(tx: Tx, idDocument: string) {
  const open = await tx<{ id_transaction: string }[]>`
    update kitchen_checkouts set status = 'expired' where id_document = ${idDocument} and status = 'open' returning id_transaction::text`;
  if (open.length) await tx`update transactions set status = 'cancelled' where id_transaction in ${tx(open.map(o => o.id_transaction))} and status = 'pending'`;
}

/**
 * Starts paying the tab online: a pending payment for the tab's total and an attempt that locks the tab, then the
 * provider's card page. Returns the address to send the person to.
 */
export async function startCheckout(sql: Sql, config: Config, userId: string, ctx: { ip: string; origin: string }) {
  const provider = kitchenProvider(config);
  const started = await sql.begin(async tx => {
    const tab = await tabRow(tx, userId, true);
    if (!tab) throw notFound('Hesap');
    await documentTotals(tx, tab.id_document);
    const lines = await tx<{ id_document_item: string; description: string; line_total: string }[]>`
      select id_document_item::text, description, line_total::text from document_items where id_document = ${tab.id_document} and line_total > 0 order by line_no`;
    const [{ total }] = await tx<{ total: string }[]>`select grand_total::text as total from documents where id_document = ${tab.id_document}`;
    if (!lines.length || Number(total) <= 0) throw badRequest('validation_failed', 'Hesabında ödenecek ürün yok.');
    await closeOpenCheckouts(tx, tab.id_document);
    const account = await onlineAccount(tx, tab.currency_code);
    const [payment] = await tx<{ id_transaction: string }[]>`
      insert into transactions (transaction_type, to_account_id, amount, currency_code, payment_method, status, provider_name, description, created_by_user_id, updated_by_user_id)
      values ('collection', ${account.id_account}, ${total}, ${tab.currency_code}, 'online_payment', 'pending', ${provider.name}, ${`${TAB} (ödeme bekliyor)`}, ${userId}, ${userId})
      returning id_transaction::text`;
    const [checkout] = await tx<{ id: string }[]>`
      insert into kitchen_checkouts (id_document, id_transaction, amount, currency_code, provider, expires_at)
      values (${tab.id_document}, ${payment.id_transaction}, ${total}, ${tab.currency_code}, ${provider.name}, now() + make_interval(mins => ${config.kitchenCheckoutMinutes}))
      returning id_kitchen_checkout::text as id`;
    const [buyer] = await tx<{ first_name: string; last_name: string | null; email: string | null }[]>`
      select u.first_name, u.last_name, e.email from users u left join user_emails e on e.id_user = u.id_user and e.is_primary and e.status = 'active'
      where u.id_user = ${userId}`;
    return { checkoutId: checkout.id, id_transaction: payment.id_transaction, total, currency: tab.currency_code, lines, buyer };
  });

  try {
    const page = await provider.start({
      checkoutId: started.checkoutId, amount: started.total, currency: started.currency,
      buyer: { id: userId, firstName: started.buyer.first_name, lastName: started.buyer.last_name ?? '', email: started.buyer.email ?? 'uye@fikirhane.co', ip: ctx.ip },
      lines: started.lines.map(l => ({ id: l.id_document_item, name: l.description, amount: l.line_total })),
      callbackUrl: `${ctx.origin}/api/kitchen/callback`, origin: ctx.origin,
    });
    await sql`update kitchen_checkouts set provider_token = ${page.token} where id_kitchen_checkout = ${started.checkoutId}`;
    return { page_url: page.pageUrl };
  } catch (err) {
    await sql.begin(async tx => {
      await tx`update kitchen_checkouts set status = 'failed' where id_kitchen_checkout = ${started.checkoutId} and status = 'open'`;
      await tx`update transactions set status = 'failed' where id_transaction = ${started.id_transaction} and status = 'pending'`;
    });
    throw err;
  }
}

/** Gives up the payment under way, so the tab can change again. */
export async function cancelCheckout(sql: Sql, userId: string) {
  await sql.begin(async tx => {
    const tab = await tabRow(tx, userId, true);
    if (tab) await closeOpenCheckouts(tx, tab.id_document);
  });
}

/**
 * The provider's callback: asks the provider for the result (the browser's word is never taken), then posts the tab.
 * Idempotent: a repeated callback for a paid attempt answers with the same receipt. A payment that arrives after its
 * attempt was closed is still posted while the tab is unchanged; otherwise it is recorded for a refund.
 */
export async function finishCheckout(sql: Sql, config: Config, token: string): Promise<{ ok: boolean; document_number?: string; message?: string }> {
  const [found] = await sql<{ id: string }[]>`select id_kitchen_checkout::text as id from kitchen_checkouts where provider_token = ${token}`;
  if (!found) return { ok: false, message: 'Ödeme bulunamadı.' };
  const provider = kitchenProvider(config);
  let result: CheckoutResult;
  try { result = await provider.result(token); } catch { return { ok: false, message: 'Ödeme sağlayıcısına ulaşılamadı; hesabın açık duruyor.' }; }

  return sql.begin(async tx => {
    const [k] = await tx<{ id: string; id_document: string; id_transaction: string; amount: string; status: string }[]>`
      select id_kitchen_checkout::text as id, id_document::text, id_transaction::text, amount::text, status
      from kitchen_checkouts where id_kitchen_checkout = ${found.id} for update`;
    if (k.status === 'paid') {
      const [doc] = await tx<{ document_number: string }[]>`select document_number from documents where id_document = ${k.id_document}`;
      return { ok: true, document_number: doc.document_number };
    }
    if (!result.ok) {
      if (k.status === 'open') {
        await tx`update kitchen_checkouts set status = 'failed' where id_kitchen_checkout = ${k.id}`;
        await tx`update transactions set status = 'failed' where id_transaction = ${k.id_transaction} and status = 'pending'`;
      }
      return { ok: false, message: result.message || 'Ödeme tamamlanmadı; hesabın açık duruyor.' };
    }

    const [doc] = await tx<{ id_user: string; status: string; currency_code: string }[]>`
      select id_user::text, status, currency_code from documents where id_document = ${k.id_document} for update`;
    if (doc.status === 'draft') await documentTotals(tx, k.id_document);
    const [{ total }] = await tx<{ total: string }[]>`select grand_total::text as total from documents where id_document = ${k.id_document}`;
    const matches = result.basketId === k.id && result.paidPrice === k.amount && doc.status === 'draft' && total === k.amount;
    if (!matches) {
      await tx`update kitchen_checkouts set status = 'failed' where id_kitchen_checkout = ${k.id}`;
      await tx`update transactions set status = 'failed' where id_transaction = ${k.id_transaction} and status = 'pending'`;
      await audit(tx, { actorUserId: null, actorType: 'integration', action: 'kitchen.payment_unmatched', entityType: 'documents', entityId: k.id_document,
        source: 'integration', metadata: { provider: provider.name, payment_id: result.paymentId, paid: result.paidPrice, expected: k.amount, tab_total: total, tab_status: doc.status } });
      return { ok: false, message: 'Ödemen alındı ama hesabınla eşleşmedi. Görevliye haber ver; iade ya da düzeltme yapılacak.' };
    }
    const pending = (await tx`select 1 from transactions where id_transaction = ${k.id_transaction} and status = 'pending'`).length > 0;
    const sale = await postSale(tx, k.id_document, await onlineAccount(tx, doc.currency_code), 'online_payment', doc.id_user, {
      action: 'kitchen.paid', source: 'integration', pending: pending ? k.id_transaction : undefined,
      provider: { name: provider.name, id: result.paymentId ?? `${provider.name}-${token}` },
    });
    await tx`update kitchen_checkouts set status = 'paid' where id_kitchen_checkout = ${k.id}`;
    return { ok: true, document_number: sale.document_number };
  });
}

/** Open tabs for the host shell: who, what and since when. */
export async function openTabs(sql: Sql) {
  const tabs = await sql<(TabRow & { first_name: string; last_name: string | null })[]>`
    select d.id_document::text, d.created_at, (d.created_at at time zone 'Europe/Istanbul')::date < ${TODAY(sql)} as earlier,
           exists (select 1 from kitchen_checkouts k where k.id_document = d.id_document and k.status = 'open' and k.expires_at > now()) as locked,
           d.grand_total::text, d.currency_code, u.first_name, u.last_name
    from documents d join users u on u.id_user = d.id_user
    where d.status = 'draft' and d.description = ${TAB} and exists (select 1 from document_items l where l.id_document = d.id_document)
    order by d.created_at`;
  return Promise.all(tabs.map(async t => ({ ...t, lines: await linesOf(sql, t.id_document) })));
}

/** Staff take the tab's payment at the desk (cash or card), with the counter's accounts. */
export async function closeTabAtDesk(sql: Sql, actor: string, idDocument: string, method: 'cash' | 'card') {
  return sql.begin(async tx => {
    const [doc] = await tx<{ id_user: string; currency_code: string }[]>`
      select id_user::text, currency_code from documents where id_document = ${idDocument} and status = 'draft' and description = ${TAB} for update`;
    if (!doc) throw notFound('Açık hesap');
    const [open] = await tx`select 1 from kitchen_checkouts where id_document = ${idDocument} and status = 'open' and expires_at > now()`;
    if (open) throw new ApiError(409, 'tab_locked', 'Bu hesabın online ödemesi sürüyor; birkaç dakika sonra tekrar bak.');
    await closeOpenCheckouts(tx, idDocument);
    const account = await paymentAccount(tx, method, doc.currency_code);
    if (!account) throw new ApiError(409, 'no_payment_account', method === 'cash'
      ? 'Aktif bir kasa hesabı yok; muhasebe bir kasa hesabı açmalı.' : 'Kart ödemesi için aktif bir POS ya da banka hesabı yok.');
    return postSale(tx, idDocument, account, method === 'cash' ? 'cash' : 'credit_card', actor, { action: 'kitchen.paid_at_desk', source: 'admin_web' });
  });
}

/** What the label sheet prints: every product the kitchen sells, with the address its QR carries. */
export async function labelItems(sql: Sql): Promise<(Pick<MenuItem, 'item_code' | 'item_name' | 'currency_code'> & { price: string })[]> {
  return (await menuItems(sql)).map(i => ({ item_code: i.item_code, item_name: i.item_name, currency_code: i.currency_code, price: lineValues(i, 1).line_total }));
}
