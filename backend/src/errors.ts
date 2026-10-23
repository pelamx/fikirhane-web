/** An error that is safe to show to API clients. `code` is stable and machine-readable; the frontend localizes it. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new ApiError(400, code, message, details);
export const unauthorized = () => new ApiError(401, 'unauthenticated', 'Sign in to continue.');
export const forbidden = (message = 'You do not have permission for this action.') => new ApiError(403, 'forbidden', message);
export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found.`);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const unprocessable = (code: string, message: string) => new ApiError(422, code, message);

interface PgError { code?: string; constraint_name?: string; table_name?: string; column_name?: string; message?: string; where?: string; routine?: string }

const END = 'Bitiş, başlangıçtan önce olamaz.';
const STAMPED = 'Bu durum yalnızca ilgili işlemle verilir (zamanı ve yapanı kaydedilir); düzenle yerine işlem düğmesini kullan.';
/**
 * Rules that tie two or more columns together (named in migrations/0106_named_rules.sql): the field the form should
 * point at and a Turkish message. test/schema.test.ts fails when a new rule has no entry here.
 */
export const RULES: Record<string, [path: string, message: string]> = {
  audit_log_user_actor: ['actor_user_id', 'Kullanıcı işlemlerinde işlemi yapan kişi kayıtlı olmalı.'],
  auth_identities_password_hash: ['secret_hash', 'Şifreyle giriş için şifre gerekli.'],
  bookings_seat_required: ['id_seat', 'Koltuk bazlı rezervasyonda koltuk seçilmeli.'],
  bookings_table_required: ['id_table', 'Masa bazlı rezervasyonda masa seçilmeli.'],
  bookings_seat_only_for_seat_unit: ['id_seat', 'Koltuk yalnızca koltuk bazlı rezervasyonda seçilir.'],
  bookings_table_only_for_table_unit: ['id_table', 'Masa yalnızca masa bazlı rezervasyonda seçilir.'],
  bookings_user_or_guest: ['guest_first_name', 'Rezervasyon bir üyeye ait olmalı ya da misafirin adı ve e-postası veya telefonu girilmeli.'],
  bookings_cancelled_at: ['booking_status', STAMPED],
  bookings_waitlist_no_place: ['id_seat', 'Bekleme listesindeki rezervasyona masa ya da koltuk atanmaz.'],
  bookings_final_price: ['final_price', 'Son fiyat, liste fiyatı eksi indirim olmalı.'],
  campaigns_end_after_start: ['end_at', END],
  club_sponsorships_end_after_start: ['end_date', END],
  club_sponsorships_one_primary: ['is_primary_sponsor', 'Bu kulübün bu tarihlerde zaten aktif bir ana sponsoru var.'],
  club_users_active_no_end: ['end_date', 'Aktif üyeliğin bitiş tarihi olamaz; bitirirken durumu da değiştir.'],
  club_users_end_after_start: ['end_date', END],
  document_items_gross: ['quantity', 'Brüt tutar, miktar × birim fiyat olmalı.'],
  document_items_net: ['discount_amount', 'Net tutar, brüt tutar eksi indirim olmalı.'],
  document_items_total: ['tax_rate', 'Satır toplamı, net tutar artı vergi olmalı.'],
  documents_one_party: ['id_organization', 'Belge ya bir kişiye ya bir kuruma kesilir, ikisine birden değil.'],
  documents_grand_total: ['grand_total', 'Genel toplam, ara toplam eksi indirim artı vergi olmalı.'],
  documents_posted_numbered: ['status', STAMPED],
  documents_cancelled_at: ['status', STAMPED],
  event_clubs_primary_is_organizer: ['is_primary', 'Ana kulüp yalnızca düzenleyen rolündeki kulüp olabilir.'],
  event_organizations_end_after_start: ['end_at', END],
  events_end_after_start: ['end_datetime', 'Bitiş, başlangıçtan sonra olmalı.'],
  events_price_currency: ['currency_code', 'Fiyat girildiyse para birimi de seçilmeli.'],
  event_users_end_after_start: ['end_at', END],
  financial_categories_group_direction: ['category_group', 'Grup, seçilen yönle (gelir / gider) uyumlu olmalı.'],
  freepasses_until_after_from: ['valid_until', 'Geçerlilik bitişi, başlangıçtan sonra olmalı.'],
  freepasses_cancelled_at: ['status', STAMPED],
  freepass_redemptions_reversed_at: ['status', STAMPED],
  invitations_has_invitee: ['invited_user_id', 'Davet edilen bir üye seç ya da misafirin e-postasını veya telefonunu gir.'],
  invitations_has_inviter: ['invited_by_user_id', 'Davet eden kişi, kurum ya da kampanya belirtilmeli.'],
  invitations_cancelled_at: ['status', STAMPED],
  items_service_not_stocked: ['is_stock_tracked', 'Hizmetlerin stok takibi olmaz; stok takibini ve stok davranışını boş bırak.'],
  membership_applications_submitted_at: ['status', STAMPED],
  membership_applications_reviewed: ['status', STAMPED],
  organization_roles_end_after_start: ['end_date', END],
  organization_users_active_no_end: ['end_date', 'Aktif üyeliğin bitiş tarihi olamaz; bitirirken durumu da değiştir.'],
  organization_users_end_after_start: ['end_date', END],
  password_reset_tokens_expiry: ['expires_at', 'Bağlantının bitişi, oluşturulmasından sonra olmalı.'],
  password_reset_tokens_admin_creator: ['created_by_user_id', 'Yönetici bağlantısını oluşturan kişi kayıtlı olmalı.'],
  role_permissions_revoked_at: ['status', STAMPED],
  sponsorship_usage_reference_pair: ['reference_id', 'Referans türü ve referans birlikte girilmeli ya da ikisi de boş bırakılmalı.'],
  stock_movements_sign: ['quantity', 'Miktarın işareti hareket türüne uymuyor (giriş artı, çıkış eksi).'],
  stock_movements_reason_required: ['reason_code', 'Fire ve elle düzeltmede gerekçe kodu seçilmeli.'],
  transaction_allocations_reversed: ['status', STAMPED],
  transactions_distinct_accounts: ['to_account_id', 'Kaynak ve hedef hesap aynı olamaz.'],
  transactions_collection_accounts: ['to_account_id', 'Tahsilatta yalnızca hedef (giriş) hesabı seçilir.'],
  transactions_payment_accounts: ['from_account_id', 'Gider ödemesi ve iadede yalnızca kaynak (çıkış) hesabı seçilir.'],
  transactions_transfer_accounts: ['from_account_id', 'Transferde hem kaynak hem hedef hesap seçilmeli.'],
  transactions_adjustment_accounts: ['from_account_id', 'Düzeltmede kaynak ya da hedef hesaptan yalnızca biri seçilir.'],
  transactions_adjustment_description: ['description', 'Düzeltme kaydında açıklama zorunlu.'],
  transactions_posted_at: ['status', STAMPED],
  transactions_reversed: ['status', STAMPED],
  user_acquisitions_not_self_referral: ['referrer_user_id', 'Kişi kendini yönlendirmiş olamaz.'],
  user_memberships_end_after_start: ['end_date', END],
  user_memberships_cancelled_at: ['status', STAMPED],
  user_roles_revoked_at: ['status', STAMPED],
  user_skills_verified: ['is_verified', 'Doğrulanmış beceride doğrulayan ve doğrulama zamanı kayıtlı olmalı.'],
};

/** Field and message for a CHECK / EXCLUDE violation: a named rule, or a single-column check named <table>_<column>_check. */
function ruleError(pg: PgError): ApiError {
  const name = pg.constraint_name ?? '';
  const known = RULES[name];
  if (known) return new ApiError(422, 'rule_violation', known[1], [{ path: known[0], message: `${known[0]}: ${known[1]}` }]);
  const column = pg.table_name && name.startsWith(`${pg.table_name}_`) ? /^(\w+?)_check\d*$/.exec(name.slice(pg.table_name.length + 1))?.[1] : undefined;
  if (column) return new ApiError(422, 'rule_violation', 'İşaretli alan kurala uymuyor.', [{ path: column, message: `${column}: değer kurala uymuyor (biçim, aralık ya da izin verilen değerler).` }]);
  return unprocessable('rule_violation', 'The data violates a business rule.');
}

/** Maps PostgreSQL errors raised by constraints and guard triggers onto ApiErrors. Returns null for unknown errors. */
export function fromPgError(err: unknown): ApiError | null {
  const pg = err as PgError;
  if (!pg || typeof pg.code !== 'string') return null;
  if (pg.code === '23505') return conflict('duplicate', 'This record already exists.');
  if (pg.code === '23502') return badRequest('validation_failed', `${pg.column_name ?? 'A field'} is required.`,
    pg.column_name ? [{ path: pg.column_name, message: `${pg.column_name}: zorunlu` }] : undefined);
  if (pg.code === '23503') return unprocessable('invalid_reference', 'A referenced record does not exist.');
  // Guard triggers raise with readable messages (routine exec_stmt_raise); plain CHECK constraint names stay internal.
  const raised = pg.routine === 'exec_stmt_raise';
  if ((pg.code === '23514' || pg.code === '23P01') && raised && pg.message) return unprocessable('rule_violation', pg.message);
  if (pg.code === '23514' || pg.code === '23P01') return ruleError(pg);
  if (pg.code === '23001') return conflict('not_allowed', raised && pg.message ? pg.message : 'This change is not allowed.');
  if (pg.code === '22P02' || pg.code === '22007' || pg.code === '22008') return badRequest('invalid_input', 'A value has an invalid format.');
  return null;
}
