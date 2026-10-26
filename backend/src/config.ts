import { resolve } from 'node:path';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

export type PaymentMode = 'pay_at_venue' | 'online';
/** How a kitchen tab is paid: not at all (off), a fake card page for development and the demo (test), or iyzico. */
export type KitchenPayment = 'off' | 'test' | 'iyzico';

export interface Config {
  databaseUrl: string;
  port: number;
  corsOrigins: string[];
  cookieSameSite: 'Lax' | 'Strict' | 'None';
  cookieSecure: boolean;
  paymentMode: PaymentMode;
  siteDir: string | null;
  visitorReservationWindowDays: number;
  visitorMaxActiveBookings: number;
  membershipPeriodMonths: number;
  sessionDays: number;
  pendingPaymentHoldMinutes: number;
  cancellationLockHours: number;
  jobIntervalSeconds: number;
  trustProxy: boolean;
  loginAttemptsPer15Min: number;
  signupsPerHour: number;
  /** Public address of the site, used in emailed links. Render sets RENDER_EXTERNAL_URL automatically. */
  publicSiteUrl: string | null;
  resendApiKey: string | null;
  brevoApiKey: string | null;
  mailFrom: string;
  passwordResetMinutes: number;
  /** Whether people without a membership may pick their own seat (true: everyone can, as on fikirhane.co). */
  visitorSeatSelection: boolean;
  /** How early before a session its QR pass opens the door. */
  checkinEarlyMinutes: number;
  passwordResetRequestsPerHour: number;
  /** Visit requests (Tur planla) accepted per network per hour. */
  tourRequestsPerHour: number;
  kitchenPayment: KitchenPayment;
  iyzico: { apiKey: string; secretKey: string; baseUrl: string } | null;
  /** How long an online payment may stay open before the tab unlocks again. */
  kitchenCheckoutMinutes: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const sameSite = process.env.COOKIE_SAMESITE ?? 'Lax';
  if (!['Lax', 'Strict', 'None'].includes(sameSite)) throw new Error('COOKIE_SAMESITE must be Lax, Strict or None');
  const paymentMode = process.env.PAYMENT_MODE ?? 'pay_at_venue';
  if (paymentMode !== 'pay_at_venue' && paymentMode !== 'online') throw new Error('PAYMENT_MODE must be pay_at_venue or online');
  const kitchenPayment = process.env.KITCHEN_PAYMENT || 'off';
  if (!['off', 'test', 'iyzico'].includes(kitchenPayment)) throw new Error('KITCHEN_PAYMENT must be off, test or iyzico');
  const iyzico = process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY
    ? { apiKey: process.env.IYZICO_API_KEY, secretKey: process.env.IYZICO_SECRET_KEY,
        baseUrl: (process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com').replace(/\/+$/, '') }
    : null;
  if (kitchenPayment === 'iyzico' && !iyzico) throw new Error('KITCHEN_PAYMENT=iyzico requires IYZICO_API_KEY and IYZICO_SECRET_KEY');
  const siteDir = process.env.SITE_DIR ?? '..';
  const config: Config = {
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane',
    port: int('PORT', 8080),
    corsOrigins: list('CORS_ORIGINS'),
    cookieSameSite: sameSite as Config['cookieSameSite'],
    cookieSecure: (process.env.COOKIE_SECURE ?? 'true') !== 'false',
    paymentMode,
    siteDir: siteDir ? resolve(import.meta.dirname, '..', siteDir) : null,
    visitorReservationWindowDays: int('VISITOR_RESERVATION_WINDOW_DAYS', 7),
    visitorMaxActiveBookings: int('VISITOR_MAX_ACTIVE_BOOKINGS', 2),
    membershipPeriodMonths: int('MEMBERSHIP_PERIOD_MONTHS', 12),
    sessionDays: int('SESSION_DAYS', 30),
    pendingPaymentHoldMinutes: int('PENDING_PAYMENT_HOLD_MINUTES', 10),
    cancellationLockHours: int('CANCELLATION_LOCK_HOURS', 24),
    jobIntervalSeconds: int('JOB_INTERVAL_SECONDS', 60),
    trustProxy: process.env.TRUST_PROXY === 'true',
    loginAttemptsPer15Min: int('LOGIN_ATTEMPTS_PER_15_MIN', 10),
    signupsPerHour: int('SIGNUPS_PER_HOUR', 5),
    publicSiteUrl: (process.env.PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '') || null,
    resendApiKey: process.env.RESEND_API_KEY || null,
    brevoApiKey: process.env.BREVO_API_KEY || null,
    mailFrom: process.env.MAIL_FROM || 'Fikirhane <onboarding@resend.dev>',
    passwordResetMinutes: int('PASSWORD_RESET_MINUTES', 60),
    visitorSeatSelection: (process.env.VISITOR_SEAT_SELECTION ?? 'true') !== 'false',
    checkinEarlyMinutes: int('CHECKIN_EARLY_MINUTES', 15),
    passwordResetRequestsPerHour: int('PASSWORD_RESET_REQUESTS_PER_HOUR', 5),
    tourRequestsPerHour: int('TOUR_REQUESTS_PER_HOUR', 5),
    kitchenPayment: kitchenPayment as KitchenPayment,
    iyzico,
    kitchenCheckoutMinutes: int('KITCHEN_CHECKOUT_MINUTES', 15),
    ...overrides,
  };
  if (config.cookieSameSite === 'None' && !config.cookieSecure) throw new Error('COOKIE_SAMESITE=None requires COOKIE_SECURE=true');
  return config;
}
