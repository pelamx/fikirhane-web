/**
 * Which catalogue permissions no endpoint checks, so the role screens can say so instead of suggesting a right that does
 * nothing. test/permission-wiring.test.ts keeps these lists honest against the source.
 */

/** In the catalogue (PERMISSIONS.md) for features that are not built yet; granting them changes nothing today. */
export const UNWIRED = new Set([
  'booking.override_capacity', 'freepass.override_limit', 'integration.manage', 'integration.view', 'pricing_rule.create', 'pricing_rule.disable',
  'pricing_rule.update', 'sponsorship.override_limit', 'stock.override_negative', 'system_settings.view', 'transaction.adjust', 'user.view_sensitive',
]);

/** Member rights: every signed-in account has them (public catalogue, own bookings, own profile), so they are not checked one by one. */
export const SIGNED_IN = new Set([
  'booking.cancel_own', 'booking.create', 'booking.view_own', 'club.join', 'club.view', 'event.view', 'membership.apply', 'membership.view_own',
  'user.update_own', 'user.view_own',
]);

export type Wiring = 'unwired' | 'signed_in';
export const wiringOf = (code: string): Wiring | null => UNWIRED.has(code) ? 'unwired' : SIGNED_IN.has(code) ? 'signed_in' : null;
