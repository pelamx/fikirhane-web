import type { Config } from '../../config.ts';
import { ApiError } from '../../errors.ts';
import { iyzico } from './iyzico.ts';
import { testProvider } from './test.ts';

/** What a hosted card page needs: who pays, what for and where to come back. Amounts are strings with two decimals. */
export interface CheckoutRequest {
  checkoutId: string;
  amount: string;
  currency: string;
  buyer: { id: string; firstName: string; lastName: string; email: string; ip: string };
  lines: { id: string; name: string; amount: string }[];
  callbackUrl: string;
  /** This server's origin, for a page it serves itself (the test provider). */
  origin: string;
}
/** The provider's own word on a payment, asked by token (never read from the browser's callback). */
export interface CheckoutResult { ok: boolean; paymentId: string | null; paidPrice: string | null; basketId: string | null; message?: string }

export interface PaymentProvider {
  name: string;
  start(req: CheckoutRequest): Promise<{ token: string; pageUrl: string }>;
  result(token: string): Promise<CheckoutResult>;
}

export function kitchenProvider(config: Config): PaymentProvider {
  if (config.kitchenPayment === 'test') return testProvider;
  if (config.kitchenPayment === 'iyzico' && config.iyzico) return iyzico(config.iyzico);
  throw new ApiError(503, 'payment_unavailable', 'Mutfakta online ödeme henüz açık değil; ödemeyi görevliye yapabilirsin.');
}
