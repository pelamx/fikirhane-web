import type { Config } from '../../config.ts';
import { ApiError } from '../../errors.ts';
import { paytr } from './paytr.ts';
import { testProvider } from './test.ts';

/** What a hosted card page needs: who pays, what for and where to come back. Amounts are strings with two decimals. */
export interface CheckoutRequest {
  /** Names the attempt in the provider's notification (letters and digits only). */
  reference: string;
  amount: string;
  currency: string;
  buyer: { firstName: string; lastName: string; email: string; ip: string };
  lines: { name: string; unitPrice: string; quantity: number }[];
  okUrl: string;
  failUrl: string;
  timeoutMinutes: number;
  /** This server's origin, for a page it serves itself (the test provider). */
  origin: string;
}
/** The provider's verified word on a payment: sent server to server, never read from the person's browser. */
export interface PaymentNotice { reference: string; ok: boolean; paidAmount: string | null; paymentId: string | null; message?: string }

export interface PaymentProvider {
  name: string;
  start(req: CheckoutRequest): Promise<{ pageUrl: string }>;
  /** Checks a payment notification's signature; null when it is not authentic. */
  notification(form: Record<string, string>): PaymentNotice | null;
}

export function kitchenProvider(config: Config): PaymentProvider {
  if (config.kitchenPayment === 'test') return testProvider;
  if (config.kitchenPayment === 'paytr' && config.paytr) return paytr(config.paytr);
  throw new ApiError(503, 'payment_unavailable', 'Mutfakta online ödeme henüz açık değil; ödemeyi görevliye yapabilirsin.');
}
