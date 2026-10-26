import { Hono } from 'hono';
import type { Deps, Env } from '../http.ts';
import { checkoutOutcome, settleCheckout } from '../services/kitchen.ts';
import { kitchenProvider } from '../services/payments/provider.ts';
import { testProvider } from '../services/payments/test.ts';

/**
 * The payment provider's side of a kitchen tab. Both come from outside the site, so neither carries the session cookie
 * (and they are exempt from the origin check): the notification is trusted for its signature, the return only reads.
 */
export function kitchenRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const back = (r: { ok: boolean; pending?: boolean; document_number?: string; message?: string }) => r.ok
    ? `/member/?odeme=ok&fis=${encodeURIComponent(r.document_number ?? '')}#mutfak`
    : r.pending ? '/member/?odeme=bekliyor#mutfak'
    : `/member/?odeme=hata&mesaj=${encodeURIComponent(r.message ?? '')}#mutfak`;
  const form = async (c: { req: { parseBody(): Promise<Record<string, unknown>> } }) => {
    const raw = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  };

  // The provider's server-to-server result (PayTR "Bildirim URL"). Answered with a plain OK once it is authentic, also
  // when it cannot be matched (that is recorded for staff), so the provider stops repeating it.
  app.post('/notify', async c => {
    const provider = kitchenProvider(deps.config);
    const notice = provider.notification(await form(c));
    if (!notice) return c.text('bad signature', 400);
    await settleCheckout(deps.sql, provider.name, notice);
    return c.text('OK');
  });

  // Where the card page sends the person back (merchant_ok_url / merchant_fail_url), by GET or POST.
  app.on(['GET', 'POST'], '/return', async c => {
    const ref = (c.req.query('ref') ?? '').slice(0, 64);
    return c.redirect(back(/^[0-9a-f]{32}$/.test(ref) ? await checkoutOutcome(deps.sql, ref) : { ok: false, message: 'Ödeme bulunamadı.' }), 303);
  });

  // KITCHEN_PAYMENT=test: the stand-in card page. Its answer settles the attempt the way a notification would.
  app.get('/test-pay/:ref', c => {
    const a = deps.config.kitchenPayment === 'test' ? testProvider.attempt(c.req.param('ref')) : null;
    if (!a) return c.json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, 404);
    const amount = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(a.amount));
    c.header('content-type', 'text/html; charset=utf-8');
    return c.body(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test ödemesi · Fikirhane</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f4efe6;color:#29251e;display:grid;place-items:center;min-height:100vh;padding:16px}main{background:#fff;border-radius:14px;padding:28px;max-width:360px;width:100%;box-shadow:0 6px 30px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 20px;color:#6b6257}strong{display:block;font-size:34px;margin:0 0 24px}form{display:flex;gap:10px}button{flex:1;font:inherit;padding:13px;border-radius:999px;border:1px solid #29251e;background:#fff;cursor:pointer}button[value=ok]{background:#29251e;color:#fff}</style></head>
<body><main><h1>Test ödemesi</h1><p>Bu bir deneme sayfası; karttan para çekilmez.</p><strong>${amount}</strong>
<form method="post"><button name="outcome" value="fail">İptal</button><button name="outcome" value="ok">Öde</button></form></main></body></html>`);
  });
  app.post('/test-pay/:ref', async c => {
    const ref = c.req.param('ref');
    const a = deps.config.kitchenPayment === 'test' ? testProvider.attempt(ref) : null;
    if (!a) return c.json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, 404);
    const ok = (await form(c)).outcome === 'ok';
    await settleCheckout(deps.sql, testProvider.name, { reference: ref, ok, paidAmount: ok ? a.amount : null, paymentId: ok ? `TEST-${ref.slice(0, 12)}` : null,
      message: ok ? undefined : 'Test ödemesi iptal edildi.' });
    return c.redirect(new URL(ok ? a.okUrl : a.failUrl).pathname + new URL(ok ? a.okUrl : a.failUrl).search, 303);
  });

  return app;
}
