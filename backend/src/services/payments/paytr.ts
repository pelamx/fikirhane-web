import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../errors.ts';
import type { CheckoutRequest, PaymentNotice, PaymentProvider } from './provider.ts';

/**
 * PayTR iFrame API: PayTR hosts the card page and 3D Secure, so card data never reaches this server.
 * 1. get-token with an HMAC-SHA256 signature (merchant key + salt) gives the card page.
 * 2. PayTR posts the result to the notification address set in its merchant panel (Bildirim URL:
 *    <site>/api/kitchen/notify), signed the same way; it is answered with a plain "OK".
 */
export function paytr(keys: { merchantId: string; merchantKey: string; merchantSalt: string; testMode: boolean }): PaymentProvider {
  const sign = (text: string) => createHmac('sha256', keys.merchantKey).update(text).digest('base64');
  const kurus = (amount: string) => String(Math.round(Number(amount) * 100));

  return {
    name: 'paytr',
    async start(req: CheckoutRequest) {
      const basket = Buffer.from(JSON.stringify(req.lines.map(l => [l.name, l.unitPrice, l.quantity]))).toString('base64');
      const amount = kurus(req.amount), test = keys.testMode ? '1' : '0', noInstallment = '1', maxInstallment = '0', currency = 'TL';
      const token = sign(keys.merchantId + req.buyer.ip + req.reference + req.buyer.email + amount + basket + noInstallment + maxInstallment + currency + test + keys.merchantSalt);
      const form = new URLSearchParams({
        merchant_id: keys.merchantId, user_ip: req.buyer.ip, merchant_oid: req.reference, email: req.buyer.email, payment_amount: amount,
        paytr_token: token, user_basket: basket, debug_on: keys.testMode ? '1' : '0', no_installment: noInstallment, max_installment: maxInstallment,
        user_name: `${req.buyer.firstName} ${req.buyer.lastName}`.trim(), user_address: 'Fikirhane, Kabataş Setüstü, Beyoğlu, İstanbul',
        // PayTR requires a phone number; accounts do not keep one, so the venue's placeholder is sent.
        user_phone: '05000000000',
        merchant_ok_url: req.okUrl, merchant_fail_url: req.failUrl, timeout_limit: String(req.timeoutMinutes), currency, test_mode: test, lang: 'tr',
      });
      const res = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      const json = await res?.json().catch(() => null) as { status?: string; token?: string; reason?: string } | null;
      if (json?.status !== 'success' || !json.token) {
        throw new ApiError(502, 'payment_provider', `Ödeme sayfası açılamadı${json?.reason ? `: ${json.reason}` : ''}. Biraz sonra tekrar dene ya da görevliye öde.`);
      }
      return { pageUrl: `https://www.paytr.com/odeme/guvenli/${json.token}` };
    },
    notification(form: Record<string, string>): PaymentNotice | null {
      const { merchant_oid: oid = '', status = '', total_amount: total = '', hash = '' } = form;
      const expected = Buffer.from(sign(oid + keys.merchantSalt + status + total));
      const given = Buffer.from(hash);
      if (!oid || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      return { reference: oid, ok: status === 'success', paidAmount: /^\d+$/.test(total) ? (Number(total) / 100).toFixed(2) : null,
        paymentId: `paytr-${oid}`, message: form.failed_reason_msg || undefined };
    },
  };
}
