/**
 * V1 pricing (EVENTS rule 14, EVENT_OPTIONS rule 18, MEMBERSHIP_TYPES rule 11):
 *   list  = event.base_price + option.price_adjustment
 *   final = list - membership discount (discount_rate % of list), or 0 with a freepass.
 * Amounts are computed in integer kuruş to avoid floating-point drift, then rendered as 2-decimal strings.
 */
export interface PriceQuote {
  listAmount: string;
  discountAmount: string;
  finalPrice: string;
  currency: string;
  reason: 'freepass' | 'membership' | 'none';
}

const toCents = (value: string | number) => {
  const [whole, frac = ''] = String(value).split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(Number.parseInt(whole, 10)) * 100 + Number.parseInt((frac + '00').slice(0, 2), 10));
};
const fromCents = (cents: number) => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

export function quote(input: {
  basePrice: string | null;
  priceAdjustment: string | null;
  currency: string | null;
  discountRate: string | null;
  freepass: boolean;
}): PriceQuote | null {
  if (input.basePrice === null || input.currency === null) return null;
  const list = Math.max(0, toCents(input.basePrice) + toCents(input.priceAdjustment ?? '0'));
  let discount = 0;
  let reason: PriceQuote['reason'] = 'none';
  if (input.freepass) {
    discount = list;
    reason = 'freepass';
  } else if (input.discountRate !== null && toCents(input.discountRate) > 0) {
    // discount_rate is a percentage with 2 decimals; round half up to the kuruş.
    discount = Math.round((list * toCents(input.discountRate)) / 10000);
    reason = 'membership';
  }
  return { listAmount: fromCents(list), discountAmount: fromCents(discount), finalPrice: fromCents(list - discount), currency: input.currency, reason };
}

export const isZero = (amount: string) => toCents(amount) === 0;
