import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from '../../errors.ts';
import type { CheckoutRequest, CheckoutResult, PaymentProvider } from './provider.ts';

/**
 * iyzico Checkout Form: iyzico hosts the card page and 3D Secure, so card data never reaches this server.
 * Requests are signed with IYZWSv2 (HMAC-SHA256 over random key + path + body).
 */
export function iyzico(keys: { apiKey: string; secretKey: string; baseUrl: string }): PaymentProvider {
  async function call(path: string, payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    const rnd = `${Date.now()}${randomBytes(8).toString('hex')}`;
    const signature = createHmac('sha256', keys.secretKey).update(rnd + path + body).digest('hex');
    const auth = Buffer.from(`apiKey:${keys.apiKey}&randomKey:${rnd}&signature:${signature}`).toString('base64');
    const res = await fetch(keys.baseUrl + path, {
      method: 'POST', body, signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `IYZWSv2 ${auth}`, 'x-iyzi-rnd': rnd },
    });
    const json = await res.json().catch(() => null) as Record<string, any> | null;
    if (!json) throw new ApiError(502, 'payment_provider', 'Ödeme sağlayıcısına ulaşılamadı; biraz sonra tekrar dene.');
    return json;
  }

  return {
    name: 'iyzico',
    async start(req: CheckoutRequest) {
      const address = { contactName: `${req.buyer.firstName} ${req.buyer.lastName}`.trim(), city: 'Istanbul', country: 'Turkey', address: 'Fikirhane, Kabataş Setüstü, Beyoğlu' };
      const r = await call('/payment/iyzipos/checkoutform/initialize/auth/ecom', {
        locale: 'tr', conversationId: req.checkoutId, price: req.amount, paidPrice: req.amount, currency: req.currency,
        basketId: req.checkoutId, paymentGroup: 'PRODUCT', callbackUrl: req.callbackUrl, enabledInstallments: [1],
        buyer: { id: req.buyer.id, name: req.buyer.firstName, surname: req.buyer.lastName || '-', email: req.buyer.email,
          // iyzico requires a national ID number; the café does not ask for one, so its documented placeholder is sent.
          identityNumber: '11111111111', registrationAddress: address.address, city: address.city, country: address.country, ip: req.buyer.ip },
        billingAddress: address,
        basketItems: req.lines.map(l => ({ id: l.id, name: l.name, category1: 'Mutfak', itemType: 'VIRTUAL', price: l.amount })),
      });
      if (r.status !== 'success' || !r.token || !r.paymentPageUrl) {
        throw new ApiError(502, 'payment_provider', `Ödeme sayfası açılamadı${r.errorMessage ? `: ${r.errorMessage}` : ''}.`);
      }
      return { token: String(r.token), pageUrl: String(r.paymentPageUrl) };
    },
    async result(token: string): Promise<CheckoutResult> {
      const r = await call('/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', token });
      const ok = r.status === 'success' && r.paymentStatus === 'SUCCESS' && (r.fraudStatus === undefined || Number(r.fraudStatus) === 1);
      return { ok, paymentId: r.paymentId ? String(r.paymentId) : null, paidPrice: r.paidPrice != null ? Number(r.paidPrice).toFixed(2) : null,
        basketId: r.basketId ?? null, message: r.errorMessage };
    },
  };
}
