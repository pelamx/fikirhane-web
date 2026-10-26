import type { PaymentProvider } from './provider.ts';

/**
 * KITCHEN_PAYMENT=test: a card page this server shows itself (/api/kitchen/test-pay/:reference) with Öde and İptal, for
 * development, the demo and tests. No money moves; its answer is settled by that page, not by a notification.
 * Attempts live in memory, so one server instance only.
 */
const attempts = new Map<string, { amount: string; okUrl: string; failUrl: string }>();

export const testProvider: PaymentProvider & { attempt(reference: string): { amount: string; okUrl: string; failUrl: string } | null } = {
  name: 'test',
  async start(req) {
    attempts.set(req.reference, { amount: req.amount, okUrl: req.okUrl, failUrl: req.failUrl });
    return { pageUrl: `${req.origin}/api/kitchen/test-pay/${req.reference}` };
  },
  notification: () => null,
  attempt: reference => attempts.get(reference) ?? null,
};
