import { randomBytes } from 'node:crypto';
import type { CheckoutResult, PaymentProvider } from './provider.ts';

/**
 * KITCHEN_PAYMENT=test: a card page this server shows itself (/api/kitchen/test-pay/:token) with Öde and İptal, for
 * development, the demo and tests. No money moves. Attempts live in memory, so one server instance only.
 */
const attempts = new Map<string, { checkoutId: string; amount: string; outcome: 'ok' | 'fail' | null }>();

export const testProvider: PaymentProvider & {
  attempt(token: string): { checkoutId: string; amount: string } | null;
  choose(token: string, outcome: 'ok' | 'fail'): boolean;
} = {
  name: 'test',
  async start(req) {
    const token = randomBytes(16).toString('hex');
    attempts.set(token, { checkoutId: req.checkoutId, amount: req.amount, outcome: null });
    return { token, pageUrl: `${req.origin}/api/kitchen/test-pay/${token}` };
  },
  async result(token): Promise<CheckoutResult> {
    const a = attempts.get(token);
    if (!a || a.outcome !== 'ok') return { ok: false, paymentId: null, paidPrice: null, basketId: a?.checkoutId ?? null, message: 'Test ödemesi iptal edildi.' };
    return { ok: true, paymentId: `TEST-${token.slice(0, 12)}`, paidPrice: a.amount, basketId: a.checkoutId };
  },
  attempt(token) { const a = attempts.get(token); return a ? { checkoutId: a.checkoutId, amount: a.amount } : null; },
  choose(token, outcome) { const a = attempts.get(token); if (!a || a.outcome) return false; a.outcome = outcome; return true; },
};
