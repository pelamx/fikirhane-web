// Thin client for the Fikirhane API. The session lives in an httpOnly cookie; no token is ever stored in the browser.
import { API_BASE } from './config.js';

const MESSAGES = {
  unauthenticated: 'Oturumun sona erdi. Lütfen tekrar giriş yap.',
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_taken: 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.',
  rate_limited: 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
  account_inactive: 'Bu hesap şu anda aktif değil.',
  validation_failed: 'Bazı alanları kontrol eder misin?',
  already_booked: 'Bu buluşmada zaten bir rezervasyonun var.',
  sold_out: 'Bu alan doldu. Başka bir alanı deneyebilirsin.',
  seat_taken: 'Bu yer az önce doldu. Başka bir yer dene.',
  max_active_bookings: 'Aynı anda tutabileceğin rezervasyon sınırına ulaştın.',
  outside_reservation_window: 'Bu buluşmanın rezervasyonları henüz açılmadı.',
  option_required: 'Lütfen bir alan seç.',
  event_started: 'Bu buluşma başladı.',
  cancellation_locked: 'Buluşmaya 24 saatten az kaldığı için rezervasyon artık iptal edilemiyor. Fikirhane ekibine yazabilirsin.',
  not_cancellable: 'Bu rezervasyon artık iptal edilemiyor.',
  forbidden: 'Bu işlem için yetkin yok.',
  freepass_invalid: 'Freepass kodu geçerli değil.',
  freepass_expired: 'Bu freepass süresi dolmuş.',
  freepass_used: 'Bu freepass zaten kullanılmış.',
  freepass_not_eligible: 'Bu freepass bu buluşmada kullanılamıyor.',
  application_open: 'Açık bir üyelik başvurun zaten var.',
  already_member: 'Bu üyeliğe zaten sahipsin.',
  motivation_required: 'Kısaca neden katılmak istediğini yazar mısın?',
  reset_token_invalid: 'Bu bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı isteyebilirsin.',
  staff_account: 'Yönetici hesapları için sıfırlama bağlantısı oluşturulamaz; e-postayla şifre yenileme kullanılmalı.',
  management_role: 'Kulüpteki görevini devretmeden ayrılamazsın. Fikirhane ekibine yaz.',
};

export class ApiError extends Error {
  constructor(status, code, message) { super(MESSAGES[code] ?? message ?? 'Bir şeyler ters gitti. Tekrar dener misin?'); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method, credentials: 'include',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError(0, 'network', 'Sunucuya ulaşılamadı. Bağlantını kontrol et.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code, data?.error?.message);
  return data;
}

/** True when an API is configured and answering; otherwise the site runs as a browser-only preview. */
export async function apiAvailable() {
  if (!API_BASE) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(API_BASE + '/health', { credentials: 'include', signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok && (await res.json())?.service === 'fikirhane-api';
  } catch { return false; }
}
