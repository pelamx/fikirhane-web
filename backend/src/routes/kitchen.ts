import { Hono } from 'hono';
import type { Deps, Env } from '../http.ts';
import { finishCheckout } from '../services/kitchen.ts';
import { testProvider } from '../services/payments/test.ts';

/**
 * Where the payment provider sends the person back after the card page. The provider posts from its own site, so the
 * session cookie (SameSite=Lax) is not sent: the token alone names the attempt, and the result is asked of the provider.
 */
export function kitchenRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const back = (r: { ok: boolean; document_number?: string; message?: string }) => r.ok
    ? `/mutfak/?odeme=ok&fis=${encodeURIComponent(r.document_number ?? '')}`
    : `/mutfak/?odeme=hata&mesaj=${encodeURIComponent(r.message ?? '')}`;

  app.post('/callback', async c => {
    const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const token = typeof form.token === 'string' ? form.token.slice(0, 200) : '';
    const result = token ? await finishCheckout(deps.sql, deps.config, token) : { ok: false, message: 'Ödeme bulunamadı.' };
    return c.redirect(back(result), 303);
  });

  // KITCHEN_PAYMENT=test: the stand-in card page, and its answer.
  app.get('/test-pay/:token', c => {
    const a = deps.config.kitchenPayment === 'test' ? testProvider.attempt(c.req.param('token')) : null;
    if (!a) return c.json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, 404);
    const amount = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(a.amount));
    c.header('content-type', 'text/html; charset=utf-8');
    return c.body(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test ödemesi · Fikirhane</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f4efe6;color:#29251e;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}main{background:#fff;border-radius:14px;padding:28px;max-width:360px;width:100%;box-shadow:0 6px 30px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 20px;color:#6b6257}strong{display:block;font-size:34px;margin:0 0 24px}form{display:flex;gap:10px}button{flex:1;font:inherit;padding:13px;border-radius:999px;border:1px solid #29251e;background:#fff;cursor:pointer}button[value=ok]{background:#29251e;color:#fff}</style></head>
<body><main><h1>Test ödemesi</h1><p>Bu bir deneme sayfası; karttan para çekilmez.</p><strong>${amount}</strong>
<form method="post"><button name="outcome" value="fail">İptal</button><button name="outcome" value="ok">Öde</button></form></main></body></html>`);
  });
  app.post('/test-pay/:token', async c => {
    const token = c.req.param('token');
    if (deps.config.kitchenPayment !== 'test' || !testProvider.attempt(token)) return c.json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, 404);
    const form = await c.req.parseBody();
    testProvider.choose(token, form.outcome === 'ok' ? 'ok' : 'fail');
    return c.redirect(back(await finishCheckout(deps.sql, deps.config, token)), 303);
  });

  return app;
}
