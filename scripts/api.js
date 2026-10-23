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
  not_editable: 'Bu tablodaki kayıtlar buradan değiştirilemez.',
  not_deletable: 'Bu kayıt silinemez; durumunu değiştirebilirsin.',
  invalid_transition: 'Bu durum değişikliğine izin verilmiyor.',
  rule_violation: 'Bu değişiklik bir iş kuralına aykırı.',
  not_allowed: 'Bu değişikliğe izin verilmiyor.',
  duplicate: 'Bu kayıt zaten var (aynı kod ya da aynı ilişki).',
  invalid_reference: 'Seçilen bağlı kayıt bulunamadı.',
  reason_required: 'Bir gerekçe yazmalısın (en az 3 karakter).',
  management_role: 'Kulüpteki görevini devretmeden ayrılamazsın. Fikirhane ekibine yaz.',
};

// Database rule messages (guard triggers) in Turkish; the server sends them in English.
const RULES = [
  [/^Accounts must be active and in the transaction currency/, 'Hesaplar aktif olmalı ve işlemle aynı para biriminde olmalı.'],
  [/^A document cannot be posted without lines/, 'Satırı olmayan belge kesinleştirilemez.'],
  [/^Allocations exceed document total/, 'Eşleştirmeler belge toplamını aşıyor.'],
  [/^Allocations exceed transaction amount/, 'Eşleştirmeler ödeme tutarını aşıyor.'],
  [/^A posted transaction can only be reversed/, 'Kesinleşmiş para hareketi yalnızca geri alınabilir.'],
  [/^Booking unit must match the event option/, 'Rezervasyon birimi etkinlik seçeneğiyle aynı olmalı.'],
  [/^Cancelled documents are final/, 'İptal edilmiş belge değiştirilemez.'],
  [/^(\w+)\.(\w+) cannot be changed/, 'Bu alan oluşturulduktan sonra değiştirilemez ($2).'],
  [/^Category direction does not match document direction/, 'Kategori yönü (gelir/gider) belgenin yönüyle uyuşmuyor.'],
  [/^Close the membership and create a new one/, 'Üyeliğin tipi ya da sahibi değiştirilemez; üyeliği kapatıp yenisini oluştur.'],
  [/^Club is not open for new members/, 'Kulüp yeni üyeye açık değil.'],
  [/^Club member role is not active/, 'Kulüp rolü aktif değil.'],
  [/^Club relations of a non-draft event cannot be deleted/, 'Taslak olmayan etkinliğin kulüp bağlantısı silinemez.'],
  [/^Document total (\S+) does not match lines (\S+)/, 'Belge toplamı ($1) satırların toplamıyla ($2) uyuşmuyor.'],
  [/^Finalized transactions cannot be edited/, 'Kesinleşmiş para hareketi düzenlenemez; geri alıp yeniden gir.'],
  [/^Financial center and category must be active/, 'Finans merkezi ve kategori aktif olmalı.'],
  [/^Freepass usage limit reached/, 'Freepass kullanım hakkı doldu.'],
  [/^Hard delete is not allowed/, 'Kayıt silinemez; durumunu değiştir.'],
  [/^Interest is not active/, 'İlgi alanı aktif değil.'],
  [/^(\w+) is append-only/, 'Bu kayıtlar değiştirilemez ve silinemez; yalnızca yenisi eklenir.'],
  [/^Lines of a (\w+) document cannot be changed/, 'Kesinleşmiş ya da iptal edilmiş belgenin satırları değiştirilemez.'],
  [/^Location and setup must be active/, 'Mekân ve yerleşim düzeni aktif olmalı.'],
  [/^Membership type is not active/, 'Üyelik tipi aktif değil.'],
  [/^Only pending transactions can be deleted/, 'Yalnızca bekleyen para hareketi silinebilir.'],
  [/^Only posted documents can receive allocations/, 'Yalnızca kesinleşmiş belgeye ödeme eşleştirilebilir.'],
  [/^Only posted transactions can be allocated/, 'Yalnızca kesinleşmiş ödeme eşleştirilebilir.'],
  [/^Option capacity (\S+) exceeds setup capacity (\S+)/, 'Seçenek kapasitesi ($1), yerleşim düzeninin kapasitesini ($2) aşıyor.'],
  [/^Option has bookings/, 'Bu seçeneğin rezervasyonları var; mekân, düzen ya da birim değişmez, yeni seçenek oluştur.'],
  [/^Posted documents are locked/, 'Kesinleşmiş belge kilitli; iptal edip yeniden düzenle.'],
  [/^Posted or cancelled documents cannot be deleted/, 'Kesinleşmiş ya da iptal edilmiş belge silinemez.'],
  [/^Role is not active/, 'Rol aktif değil.'],
  [/^Seat is not bookable for this option/, 'Bu koltuk bu seçenekte ayrılamaz.'],
  [/^Setup capacity exceeds location max capacity/, 'Yerleşim kapasitesi mekânın azami kapasitesini aşıyor.'],
  [/^Skill is not active/, 'Beceri aktif değil.'],
  [/^Sponsor organization must be active/, 'Sponsor kurum aktif olmalı.'],
  [/^Sponsorship plan must be active/, 'Sponsorluk paketi aktif olmalı.'],
  [/^Stock movements require a stock-tracked item/, 'Stok hareketi yalnızca stok takibi yapılan ürüne girilebilir.'],
  [/^Table is not bookable for this option/, 'Bu masa bu seçenekte ayrılamaz.'],
  [/^Transaction and document currencies differ/, 'Ödeme ve belge para birimleri farklı.'],
  [/^Transaction status (\w+) is final/, 'Bu para hareketinin durumu artık değişmez.'],
  [/^Transfers are never allocated to documents/, 'Hesaplar arası transfer belgeye eşleştirilmez.'],
];
const ruleText = message => { for (const [re, tr] of RULES) if (re.test(message ?? '')) return message.replace(new RegExp(re.source + '.*$', 's'), tr); return null; };

export class ApiError extends Error {
  constructor(status, code, message, details) {
    // A rule that names its field already carries a Turkish message from the server.
    const own = code === 'rule_violation' && Array.isArray(details) && details.length ? message : null;
    super(own ?? (['rule_violation', 'not_allowed'].includes(code) ? ruleText(message) : null) ?? MESSAGES[code] ?? message ?? 'Bir şeyler ters gitti. Tekrar dener misin?');
    this.status = status; this.code = code; this.details = details;
  }
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
  if (!res.ok) throw new ApiError(res.status, data?.error?.code, data?.error?.message, data?.error?.details);
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
