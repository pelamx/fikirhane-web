// Admin shell: back-office views over the API. Every action is re-checked on the server; hiding a link here is UX only.
import { initTheme, escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';
import { siteUrl } from './session.js';
import { columnLabel, valueLabel } from './admin-labels.js';
initTheme();

const content = document.querySelector('#admin-content');
const menu = document.querySelector('.member-menu');
const sidebar = document.querySelector('.member-sidebar');

const GROUPS = { identity: 'Kimlik ve erişim', profile: 'Profil', membership: 'Üyelik', clubs: 'Kulüpler ve kurumlar', growth: 'Büyüme ve sponsorluk', events: 'Etkinlik ve mekân', finance: 'Finans ve stok' };
const TABLE_LABELS = {
  users: 'Kullanıcılar', user_emails: 'E-posta adresleri', roles: 'Roller', permissions: 'Yetkiler', role_permissions: 'Rol yetkileri', user_roles: 'Kullanıcı rolleri', audit_log: 'Denetim kaydı',
  skills: 'Beceriler', user_skills: 'Kullanıcı becerileri', interests: 'İlgi alanları', user_interests: 'Kullanıcı ilgi alanları', needs: 'İhtiyaçlar', offers: 'Katkılar',
  membership_types: 'Üyelik tipleri', user_memberships: 'Üyelikler', membership_applications: 'Üyelik başvuruları',
  clubs: 'Kulüpler', club_users: 'Kulüp üyeleri', club_member_roles: 'Kulüp rolleri', organizations: 'Kurumlar', organization_users: 'Kurum kullanıcıları', organization_roles: 'Kurum rolleri',
  campaigns: 'Kampanyalar', invitations: 'Davetler', freepasses: 'Freepass’ler', freepass_redemptions: 'Freepass kullanımları', user_acquisitions: 'Kazanım kaynakları',
  sponsorship_plans: 'Sponsorluk paketleri', club_sponsorships: 'Kulüp sponsorlukları', sponsorship_usage: 'Sponsorluk kullanımları',
  event_series: 'Etkinlik serileri', events: 'Etkinlikler', event_options: 'Etkinlik seçenekleri', event_clubs: 'Etkinlik kulüpleri', event_organizations: 'Etkinlik kurumları', event_users: 'Etkinlik görevlileri',
  bookings: 'Rezervasyonlar', locations: 'Mekânlar', space_setups: 'Yerleşim düzenleri', tables: 'Masalar', seats: 'Koltuklar',
  accounts: 'Hesaplar', financial_centers: 'Finans merkezleri', financial_categories: 'Finans kategorileri', documents: 'Belgeler', document_items: 'Belge satırları',
  transactions: 'Para hareketleri', transaction_allocations: 'Ödeme eşleştirmeleri', items: 'Ürün ve hizmetler', stock_movements: 'Stok hareketleri', stock_counts: 'Stok sayımları', stock_count_items: 'Sayım satırları',
};
const STATUS = {
  draft: 'Taslak', submitted: 'Gönderildi', under_review: 'İnceleniyor', approved: 'Onaylandı', waitlisted: 'Bekleme listesi', declined: 'Reddedildi', withdrawn: 'Geri çekildi',
  published: 'Yayında', cancelled: 'İptal', completed: 'Tamamlandı', archived: 'Arşiv', active: 'Aktif', inactive: 'Pasif', ended: 'Sona erdi', expired: 'Süresi doldu',
  confirmed: 'Onaylı', pending_payment: 'Ödeme bekliyor', checked_in: 'Giriş yaptı', no_show: 'Gelmedi', suspended: 'Askıda', revoked: 'Geri alındı',
};
// What a reference column means when it is not simply "the" link (e.g. bookings.cancelled_by_user_id → who cancelled).
const REF_ROLES = {
  id_user: 'kişi', actor_user_id: 'işlemi yapan', approved_by_user_id: 'onaylayan', assigned_by_user_id: 'atayan', booked_by_user_id: 'ayırtan',
  cancelled_by_user_id: 'iptal eden', claimed_by_user_id: 'kullanan', created_by_user_id: 'oluşturan', granted_by_user_id: 'veren',
  invited_by_user_id: 'davet eden', invited_user_id: 'davet edilen', issued_by_user_id: 'veren', posted_by_user_id: 'kesinleştiren',
  referrer_user_id: 'yönlendiren', reversed_by_user_id: 'geri alan', reviewed_by_user_id: 'inceleyen', revoked_by_user_id: 'geri alan',
  updated_by_user_id: 'son düzenleyen', verified_by_user_id: 'doğrulayan',
};
/** Role of a reference column, or '' when it is the plain link named after the target's key (bookings.id_event → events). */
const refRole = (column, targetPk) => column === targetPk && column !== 'id_user' ? '' : REF_ROLES[column] ?? columnLabel(column).toLocaleLowerCase('tr');
const AUDIT_REFS = ['created_by_user_id', 'updated_by_user_id'];

const EVENT_TYPES = { workspace: 'Çalışma alanı', meetup: 'Buluşma', workshop: 'Atölye', talk: 'Konuşma', class: 'Ders', social: 'Sosyal' };
const OVERVIEW = [
  ['open_applications', 'Açık üyelik başvurusu', '#basvurular'], ['events_awaiting_publish', 'Yayın bekleyen etkinlik', '#etkinlikler/onay'],
  ['upcoming_events', 'Önümüzdeki 7 günde etkinlik', '#etkinlikler'], ['active_bookings', 'Aktif rezervasyon', '#veri/bookings'],
  ['active_memberships', 'Aktif üyelik', '#veri/user_memberships?status=active'], ['users', 'Aktif kullanıcı', '#veri/users'],
];
const EVENT_PERMS = ['event.create', 'event.publish', 'event.cancel', 'booking.view'];

let me = null, perms = new Set(), tables = [], toastTimer, busy = false, renderId = 0;
const resetLinks = {};
const can = p => perms.has(p);
const tableOf = name => tables.find(t => t.name === name);
const label = name => TABLE_LABELS[name] ?? name;

const dateTime = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const when = v => v ? dateTime.format(new Date(v)) : '—';
const money = (amount, currency) => amount == null ? '—' : Number(amount) === 0 ? 'Ücretsiz' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(amount));
const badge = (s, column = 'status', table = null) => `<span class="admin-status" data-status="${esc(s)}">${esc((table && tableOf(table)?.write?.enums?.[column]?.[s]) ?? STATUS[s] ?? valueLabel(column, s) ?? s)}</span>`;

function route() {
  const [path, search = ''] = location.hash.slice(1).split('?');
  const [view = 'genel', a, b] = path.split('/').map(decodeURIComponent);
  return { view, a, b, params: new URLSearchParams(search) };
}
function flash(message) { const toast = document.querySelector('#toast'); clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toastTimer = setTimeout(() => toast.hidden = true, 3500); }
function heading(eyebrow, title, copy = '') { return `<div class="member-heading"><span class="section-label">${eyebrow}</span><h1>${title}</h1>${copy ? `<p>${copy}</p>` : ''}</div>`; }
const empty = (title, copy = '') => `<div class="admin-empty"><h2>${title}</h2>${copy ? `<p>${copy}</p>` : ''}</div>`;

/** Opens the shared dialog; resolves to the typed text (or '' when no input is asked), or null on cancel. */
function ask({ title, copy = '', input = null, ok = 'Onayla', required = false }) {
  const dialog = document.querySelector('#admin-dialog');
  const field = document.querySelector('#admin-dialog-input');
  document.querySelector('#admin-dialog-title').textContent = title;
  document.querySelector('#admin-dialog-copy').textContent = copy;
  document.querySelector('#admin-dialog-label').textContent = input ?? '';
  document.querySelector('#admin-dialog-ok').textContent = ok;
  field.hidden = !input; field.required = !!(input && required); field.value = '';
  dialog.showModal();
  if (input) field.focus();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? field.value.trim() : null), { once: true }));
}

// ---------- values ----------

function cell(table, col, value, labels, { full = false } = {}) {
  if (value == null || value === '') return '<span class="admin-null">—</span>';
  if (col.ref) {
    const text = labels?.[col.ref.table]?.[value];
    return `<a class="admin-ref" href="#kayit/${esc(col.ref.table)}/${esc(value)}">${text ? esc(text) : `<code>${esc(String(value).slice(0, 8))}</code>`}</a>`;
  }
  if (col.name === tableOf(table)?.pk) return `<code>${esc(String(value).slice(0, 8))}</code>`;
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (col.name === 'status' || col.name.endsWith('_status')) return badge(String(value), col.name, table);
  const coded = (typeof value === 'string' && tableOf(table)?.write?.enums?.[col.name]?.[value]) || valueLabel(col.name, value);
  if (coded) return `<span title="${esc(value)}">${esc(coded)}</span>`;
  if (col.type.startsWith('timestamp')) return esc(when(value));
  if (col.type === 'date') return esc(dateOnly.format(new Date(value)));
  if (typeof value === 'object') { const json = JSON.stringify(value); return `<code>${esc(full ? json : json.slice(0, 80))}</code>`; }
  const text = String(value);
  return esc(full || text.length <= 80 ? text : text.slice(0, 78) + '…');
}

/** A handful of telling columns for list views: name/label, status, references, money and dates. */
function summaryColumns(meta, max = 6) {
  const cols = meta.columns.filter(c => c.name !== meta.pk && !['created_by_user_id', 'updated_by_user_id', 'updated_at'].includes(c.name));
  const score = c => meta.label.includes(c.name) ? 0 : c.name.endsWith('status') ? 1 : c.ref ? 2
    : /(_name|_title|_code|email|amount|price|quantity|capacity|_date|_datetime)$/.test(c.name) ? 3 : c.name === 'created_at' ? 5 : 4;
  return cols.map((c, i) => [c, score(c), i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).slice(0, max).map(x => x[0]).sort((x, y) => meta.columns.indexOf(x) - meta.columns.indexOf(y));
}

function rowsTable(table, items, labels, columns) {
  const meta = tableOf(table);
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${columns.map(c => `<th scope="col" title="${esc(c.name)}">${esc(columnLabel(c.name, c.name === meta.pk))}</th>`).join('')}<th scope="col"><span class="visually-hidden">Kayıt</span></th></tr></thead><tbody>${items.map(r => `<tr>${columns.map(c => `<td>${cell(table, c, r[c.name], labels)}</td>`).join('')}<td><a class="admin-open" href="#kayit/${esc(table)}/${esc(r[meta.pk])}" aria-label="Kaydı aç">↗</a></td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- views ----------

async function overview() {
  const data = await api('/admin/overview').catch(() => ({}));
  const tiles = OVERVIEW.filter(([k]) => k in data);
  const groups = Object.entries(GROUPS).map(([g, name]) => [g, name, tables.filter(t => t.group === g)]).filter(([, , list]) => list.length);
  return heading('YÖNETİM', `Merhaba, <em>${esc(me.user.first_name)}.</em>`, 'Fikirhane’nin üyeleri, etkinlikleri ve kayıtları burada. Gördüklerin rollerine göre belirlenir.')
    + (tiles.length ? `<div class="admin-stats">${tiles.map(([k, text, href]) => `<a href="${href}"><strong>${data[k]}</strong><span>${text} <span>↗</span></span></a>`).join('')}</div>` : '')
    + (groups.length ? `<section class="admin-section"><div class="member-section-top"><h2>Veri ve ilişkiler</h2><a class="text-link" href="#veri">Tümünü gör ↗</a></div><div class="admin-groups">${groups.map(([g, name, list]) => `<a href="#veri/${list[0].name}" class="admin-group"><span class="section-label">${esc(name)}</span><strong>${list.length}</strong><small>${list.slice(0, 4).map(t => esc(label(t.name))).join(' · ')}${list.length > 4 ? ' …' : ''}</small></a>`).join('')}</div></section>` : '');
}

async function applications(params) {
  const filter = params.get('durum') ?? 'acik';
  const status = { acik: '', bekleme: 'waitlisted', onay: 'approved', red: 'declined' }[filter] ?? '';
  const { items } = await api('/admin/membership-applications' + (status ? `?status=${status}` : ''));
  const chips = [['acik', 'Açık'], ['bekleme', 'Bekleme listesi'], ['onay', 'Onaylanan'], ['red', 'Reddedilen']];
  const decide = can('membership.approve'), reject = can('membership.reject');
  const userLink = id => tableOf('users') ? ` <a class="text-link" href="#kayit/users/${esc(id)}">Kayıt ↗</a>` : '';
  return heading('ÜYELİK', 'Üyelik <em>başvuruları.</em>', 'Başvuruyu incele, karar ver. Onaylanan üyelik hemen başlar ve indirimler aynı anda uygulanır.')
    + `<div class="event-filter admin-filter">${chips.map(([k, t]) => `<a href="#basvurular?durum=${k}" aria-pressed="${k === filter}" class="admin-chip">${t}</a>`).join('')}</div>`
    + (items.length ? `<div class="admin-cards">${items.map(a => {
      const open = ['submitted', 'under_review', 'waitlisted'].includes(a.status);
      return `<article class="admin-card"><div class="admin-card-top"><div><h2>${esc(a.first_name)} ${esc(a.last_name)}</h2><p>${esc(a.membership_type_code)} · ${esc(when(a.submitted_at))} · ${a.attended_events} katıldığı buluşma${userLink(a.id_user)}</p></div>${badge(a.status)}</div>`
        + (a.motivation_text ? `<blockquote>${esc(a.motivation_text)}</blockquote>` : '')
        + (a.offer_text ? `<p><b>Katkısı:</b> ${esc(a.offer_text)}</p>` : '') + (a.need_text ? `<p><b>İhtiyacı:</b> ${esc(a.need_text)}</p>` : '')
        + (a.decision_note ? `<p class="admin-muted">Not: ${esc(a.decision_note)}</p>` : '')
        + (open && (decide || reject) ? `<div class="admin-actions">${decide ? `<button class="shell-primary" data-decide="approved" data-id="${a.id_membership_application}">Onayla</button>${a.status === 'submitted' ? `<button class="shell-secondary" data-decide="under_review" data-id="${a.id_membership_application}">İncelemeye al</button>` : ''}${a.status !== 'waitlisted' ? `<button class="shell-secondary" data-decide="waitlisted" data-id="${a.id_membership_application}">Bekleme listesine al</button>` : ''}` : ''}${reject ? `<button class="shell-secondary admin-danger" data-decide="declined" data-id="${a.id_membership_application}">Reddet</button>` : ''}</div>` : '')
        + '</article>';
    }).join('')}</div>` : empty('Burada başvuru yok.', filter === 'acik' ? 'Yeni başvurular geldiğinde burada görünecek.' : ''));
}

async function eventList(params, sub) {
  const whenFilter = params.get('zaman') ?? 'upcoming';
  const status = sub === 'onay' ? 'submitted' : params.get('durum') ?? '';
  const { items } = await api(`/admin/events?when=${whenFilter}${status ? `&status=${status}` : ''}`);
  const chips = [['upcoming', 'Yaklaşan'], ['past', 'Geçmiş'], ['all', 'Tümü']];
  const statuses = [['', 'Her durum'], ['draft', 'Taslak'], ['submitted', 'Onay bekleyen'], ['published', 'Yayında'], ['cancelled', 'İptal']];
  const q = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); if (!v) p.delete(k); return '#etkinlikler?' + p; };
  return heading('ETKİNLİKLER', 'Program ve <em>katılım.</em>', 'Taslakları yayınla, katılımcıları gör, girişleri işaretle. Yayınlama; fiyat, seçenek ve mekân çakışmalarını sunucuda kontrol eder.')
    + `<div class="admin-toolbar"><div class="event-filter admin-filter">${chips.map(([k, t]) => `<a class="admin-chip" href="${q('zaman', k)}" aria-pressed="${k === whenFilter}">${t}</a>`).join('')}</div><div class="event-filter admin-filter">${statuses.map(([k, t]) => `<a class="admin-chip" href="${q('durum', k)}" aria-pressed="${k === status}">${t}</a>`).join('')}</div>${can('event.create') ? '<a class="shell-primary admin-new" href="#yeni-etkinlik">Yeni etkinlik <span>↗</span></a>' : ''}</div>`
    + (items.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Tarih</th><th scope="col">Etkinlik</th><th scope="col">Kulüp</th><th scope="col">Durum</th><th scope="col">Doluluk</th><th scope="col"><span class="visually-hidden">İşlemler</span></th></tr></thead><tbody>${items.map(e => `<tr><td>${esc(when(e.start_datetime))}</td><td><a href="#etkinlik/${e.id_event}"><b>${esc(e.event_title)}</b></a><br><small class="admin-muted">${esc(EVENT_TYPES[e.event_type] ?? e.event_type)} · ${esc(money(e.base_price, e.currency_code))}</small></td><td>${esc(e.clubs ?? '—')}</td><td>${badge(e.status)}</td><td>${e.booked} / ${e.capacity}${e.waitlisted ? ` <small class="admin-muted">+${e.waitlisted} bekleyen</small>` : ''}</td><td class="admin-row-actions">${eventActions(e)}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Bu filtreyle etkinlik yok.'));
}

function eventActions(e) {
  const live = !['cancelled', 'completed', 'archived'].includes(e.status);
  return (can('event.publish') && ['draft', 'submitted', 'approved'].includes(e.status) ? `<button class="shell-secondary" data-publish="${e.id_event}">Yayınla</button>` : '')
    + (can('event.cancel') && live ? `<button class="shell-secondary admin-danger" data-cancel-event="${e.id_event}">İptal et</button>` : '')
    + `<a class="shell-secondary" href="#etkinlik/${e.id_event}">Katılımcılar</a>`;
}

async function eventDetail(id) {
  const [record, people] = await Promise.all([
    tableOf('events') ? api(`/admin/data/events/${id}`) : null,
    api(`/admin/events/${id}/participants`).catch(err => err.status === 403 ? null : Promise.reject(err)),
  ]);
  const e = record?.row;
  const title = e ? esc(e.event_title) : 'Etkinlik';
  const checkin = can('booking.checkin') || can('event_attendance.manage');
  const options = record?.related.find(r => r.table === 'event_options' && r.column === 'id_event');
  return heading('ETKİNLİK', title, e ? `${esc(when(e.start_datetime))} — ${esc(when(e.end_datetime))} · ${esc(money(e.base_price, e.currency_code))}` : '')
    + (e ? `<div class="admin-actions admin-actions-top">${badge(e.status)}${eventActions({ ...e, id_event: id }).replace(/<a class="shell-secondary" href="#etkinlik[^>]*>Katılımcılar<\/a>/, '')}<a class="text-link" href="#kayit/events/${esc(id)}">Tüm alanlar ve ilişkiler ↗</a></div>` : '')
    + (options?.items.length ? `<section class="admin-section"><h2 class="admin-h2">Seçenekler</h2>${rowsTable('event_options', options.items, options.labels, summaryColumns(tableOf('event_options')))}</section>` : '')
    + `<section class="admin-section"><h2 class="admin-h2">Katılımcılar${people ? ` <small>(${people.items.length})</small>` : ''}</h2>`
    + (!people ? '<p class="admin-muted">Bu etkinliğin katılımcılarını görme yetkin yok.</p>'
      : people.items.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Katılımcı</th><th scope="col">Yer</th><th scope="col">Durum</th><th scope="col">Ödeme</th><th scope="col">Tutar</th><th scope="col">Giriş</th></tr></thead><tbody>${people.items.map(p => `<tr><td>${p.first_name ? `${esc(p.first_name)} ${esc(p.last_name)}` : '<span class="admin-muted">Misafir</span>'}</td><td>${esc(p.option_code)}${p.seat_code ? ` · ${esc(p.seat_code)}` : ''}</td><td>${badge(p.booking_status)}</td><td>${esc(valueLabel('payment_status', p.payment_status) ?? p.payment_status)}</td><td>${esc(money(p.final_price, e?.currency_code))}</td><td>${p.checkin_at ? esc(when(p.checkin_at)) : checkin && p.booking_status === 'confirmed' ? `<button class="shell-secondary" data-checkin="${p.id_booking}">Giriş yaptı</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="admin-muted">Henüz rezervasyon yok.</p>') + '</section>';
}

async function newEvent() {
  if (!can('event.create')) return empty('Etkinlik oluşturma yetkin yok.');
  const [setups, locations, clubs] = await Promise.all([
    api('/admin/data/space_setups?status=active&limit=200'), api('/admin/data/locations?status=active&limit=200'), api('/clubs'),
  ]);
  const locCode = Object.fromEntries(locations.items.map(l => [l.id_location, l]));
  const setupOptions = setups.items.filter(s => locCode[s.id_location]).map(s => `<option value="${esc(locCode[s.id_location].location_code)}|${esc(s.setup_code)}" data-capacity="${s.capacity ?? ''}">${esc(locCode[s.id_location].location_name)} — ${esc(s.setup_name ?? s.setup_code)}${s.capacity ? ` (${s.capacity} kişi)` : ''}</option>`).join('');
  return heading('ETKİNLİKLER', 'Yeni <em>etkinlik.</em>', 'Etkinlik taslak olarak kaydedilir. Kontrol edip yayınladığında üyeler görür.')
    + `<form id="event-form" class="profile-form admin-form"><div class="admin-form-grid">
      <label>Başlık<input name="event_title" required maxlength="160"></label>
      <label>Tür<select name="event_type">${Object.entries(EVENT_TYPES).map(([k, t]) => `<option value="${k}"${k === 'meetup' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Başlangıç<input name="start" type="datetime-local" required></label>
      <label>Bitiş<input name="end" type="datetime-local" required></label>
      <label>Kulüp<select name="club_code"><option value="">Kulüpsüz</option>${clubs.items.map(c => `<option value="${esc(c.club_code)}">${esc(c.club_name)}</option>`).join('')}</select></label>
      <label>Temel fiyat (TRY)<input name="base_price" inputmode="decimal" pattern="\\d{1,10}([.,]\\d{1,2})?" placeholder="0 = ücretsiz" required></label>
      <label>Mekân ve düzen<select name="setup" required>${setupOptions}</select></label>
      <label>Kapasite<input name="capacity" type="number" min="1" max="${setups.items.find(s => locCode[s.id_location])?.capacity ?? ''}" value="${setups.items.find(s => locCode[s.id_location])?.capacity ?? ''}" required></label>
    </div><label>Açıklama<textarea name="event_description" maxlength="5000" rows="5"></textarea></label>
    <div class="admin-actions"><button class="shell-primary" type="submit">Taslağı kaydet <span>↗</span></button><a class="shell-secondary" href="#etkinlikler">Vazgeç</a></div></form>`;
}

function dataIndex() {
  const groups = Object.entries(GROUPS).map(([g, name]) => [name, tables.filter(t => t.group === g)]).filter(([, list]) => list.length);
  return heading('VERİ', 'Kayıtlar ve <em>ilişkiler.</em>', 'Tablo dokümanlarındaki her tablo, alanları ve bağlantılarıyla. Bir kayda girince ona bağlı bütün kayıtları görürsün. Bu görünüm salt okunurdur.')
    + groups.map(([name, list]) => `<section class="admin-section"><h2 class="admin-h2">${esc(name)}</h2><div class="admin-tables">${list.map(t => `<a href="#veri/${t.name}" class="admin-table-card"><strong>${esc(label(t.name))}</strong><code>${esc(t.name)}</code><small>${t.columns.length} alan · ${t.columns.filter(c => c.ref).length} bağlantı · ${t.incoming.length} bağlanan tablo</small></a>`).join('')}</div></section>`).join('');
}

async function dataTable(name, params) {
  const meta = tableOf(name);
  if (!meta) return empty('Bu tabloyu görme yetkin yok ya da tablo yok.');
  const page = Math.max(0, Number(params.get('sayfa') ?? 0) | 0), limit = 50;
  const query = new URLSearchParams(params); query.delete('sayfa'); query.set('limit', limit); query.set('offset', page * limit);
  const data = await api(`/admin/data/${name}?${query}`);
  const filters = [...params].filter(([k]) => !['q', 'sayfa', 'tum'].includes(k));
  const all = params.get('tum') === '1';
  const columns = all ? meta.columns : summaryColumns(meta);
  const link = changes => { const p = new URLSearchParams(params); for (const [k, v] of Object.entries(changes)) v == null ? p.delete(k) : p.set(k, v); const s = p.toString(); return `#veri/${name}${s ? '?' + s : ''}`; };
  const filterLabel = (k, v) => { const col = meta.columns.find(c => c.name === k); const ref = col?.ref ? data.labels?.[col.ref.table]?.[v] : null; return `${esc(columnLabel(k, k === meta.pk))}: ${esc(ref ?? valueLabel(k, v) ?? STATUS[v] ?? (v === '' ? 'boş' : v.length > 12 ? v.slice(0, 8) + '…' : v))}`; };
  const pages = Math.ceil(data.total / limit);
  const prefill = new URLSearchParams(filters.filter(([k]) => meta.write?.create_columns.includes(k)));
  return heading(esc(GROUPS[meta.group] ?? '').toLocaleUpperCase('tr'), esc(label(name)), `<code>${esc(name)}</code> · ${data.total} kayıt`)
    + aboutTable(meta)
    + `<div class="admin-toolbar"><form id="data-search" class="admin-search" role="search"><label class="visually-hidden" for="data-q">Ara</label><input id="data-q" name="q" value="${esc(params.get('q') ?? '')}" placeholder="Metin alanlarında ara"><button class="shell-secondary" type="submit">Ara</button></form><a class="admin-chip" aria-pressed="${all}" href="${link({ tum: all ? null : '1', sayfa: null })}">${all ? 'Özet sütunlar' : 'Tüm sütunlar'}</a><a class="text-link" href="#veri">Tablolar ↗</a>${meta.write?.can_create ? `<a class="shell-primary admin-new" href="#yeni/${name}${prefill.size ? '?' + prefill : ''}">Yeni kayıt <span>+</span></a>` : ''}</div>`
    + (filters.length ? `<div class="admin-filters">${filters.map(([k, v]) => `<a class="admin-chip" aria-pressed="true" href="${link({ [k]: null, sayfa: null })}" aria-label="Filtreyi kaldır: ${esc(columnLabel(k))}">${filterLabel(k, v)} ✕</a>`).join('')}</div>` : '')
    + (data.items.length ? rowsTable(name, data.items, data.labels, columns) : empty('Kayıt bulunamadı.'))
    + (pages > 1 ? `<nav class="admin-pager" aria-label="Sayfalar">${page > 0 ? `<a class="shell-secondary" href="${link({ sayfa: page - 1 || null })}">← Önceki</a>` : ''}<span>${page + 1} / ${pages}</span>${page + 1 < pages ? `<a class="shell-secondary" href="${link({ sayfa: page + 1 })}">Sonraki →</a>` : ''}</nav>` : '')
    + relationMap(meta);
}

function relationMap(meta) {
  const out = meta.columns.filter(c => c.ref && !AUDIT_REFS.includes(c.name));
  const incoming = new Map();
  for (const r of meta.incoming) incoming.set(r.table, [...incoming.get(r.table) ?? [], refRole(r.column, meta.pk)]);
  if (!out.length && !incoming.size) return '';
  const roles = list => list.filter(Boolean).length ? ` <span class="admin-muted">${list.filter(Boolean).map(esc).join(' · ')}</span>` : '';
  const outList = out.length ? `<div><span class="section-label">${esc(label(meta.name).toLocaleUpperCase('tr'))} ŞUNLARA BAĞLI</span><ul>${out.map(c => `<li><a href="#veri/${c.ref.table}">${esc(label(c.ref.table))}</a>${roles([refRole(c.name, tableOf(c.ref.table)?.pk)])}</li>`).join('')}</ul></div>` : '';
  const inList = incoming.size ? `<div><span class="section-label">BUNLAR ${esc(label(meta.name).toLocaleUpperCase('tr'))} TABLOSUNA BAĞLI</span><ul>${[...incoming].map(([t, list]) => `<li><a href="#veri/${t}">${esc(label(t))}</a>${roles(list)}</li>`).join('')}</ul></div>` : '';
  return `<section class="admin-section admin-relations"><h2 class="admin-h2">İlişkiler</h2><p class="admin-muted admin-relations-help">Bir kayda girdiğinde, bu tablolardaki ona bağlı kayıtları da görürsün.</p><div class="admin-relation-grid${outList && inList ? '' : ' admin-relation-single'}">${outList}${inList}</div></section>`;
}

async function record(name, id) {
  const meta = tableOf(name);
  if (!meta) return empty('Bu tabloyu görme yetkin yok ya da tablo yok.');
  const data = await api(`/admin/data/${name}/${encodeURIComponent(id)}`);
  const refTitle = meta.columns.filter(c => c.ref && !c.name.endsWith('_by_user_id')).map(c => data.labels?.[c.ref.table]?.[data.row[c.name]]).filter(Boolean).slice(0, 2).join(' · ');
  const title = meta.label.map(c => data.row[c]).filter(Boolean).join(' ') || refTitle || `${label(name)} kaydı`;
  const related = data.related.filter(r => r.total > 0);
  const emptyRelated = data.related.filter(r => r.total === 0);
  return heading(esc(label(name)).toLocaleUpperCase('tr'), esc(title), `<code>${esc(name)}</code> · <code>${esc(id)}</code>`)
    + recordBar(meta, data.row, id)
    + (name === 'events' ? `<div class="admin-actions admin-actions-top"><a class="shell-secondary" href="#etkinlik/${esc(id)}">Katılımcılar ve işlemler ↗</a></div>` : '')
    + (name === 'users' ? await rolePanel(id, data) + resetPanel(id) : '')
    + `<section class="admin-section"><dl class="admin-fields">${meta.columns.map(c => `<div><dt><b>${esc(columnLabel(c.name, c.name === meta.pk))}</b> <code>${esc(c.name)}</code>${c.ref ? ` <small>→ ${esc(label(c.ref.table))}${refRole(c.name, tableOf(c.ref.table)?.pk) ? ` (${esc(refRole(c.name, tableOf(c.ref.table)?.pk))})` : ''}</small>` : ''}</dt><dd>${cell(name, c, data.row[c.name], data.labels, { full: true })}</dd></div>`).join('')}</dl></section>`
    + related.map(r => { const src = tableOf(r.table); return `<section class="admin-section"><div class="member-section-top"><h2 class="admin-h2">${esc(label(r.table))} <small>${refRole(r.column, meta.pk) ? `· ${esc(refRole(r.column, meta.pk))} olarak ` : ''}(${r.total})</small></h2><span class="admin-related-links">${src.write?.can_create && src.write.create_columns.includes(r.column) ? `<a class="text-link" href="#yeni/${r.table}?${encodeURIComponent(r.column)}=${encodeURIComponent(id)}">Ekle +</a>` : ''}${r.total > r.items.length ? `<a class="text-link" href="#veri/${r.table}?${encodeURIComponent(r.column)}=${encodeURIComponent(id)}">Tümünü gör ↗</a>` : ''}</span></div>${rowsTable(r.table, r.items, r.labels, summaryColumns(src, 5))}</section>`; }).join('')
    + (emptyRelated.length ? `<p class="admin-muted admin-empty-rel">Bağlı kaydı olmayanlar: ${[...new Set(emptyRelated.map(r => r.table))].map(t => { const w = tableOf(t)?.write; const col = emptyRelated.find(r => r.table === t && w?.create_columns.includes(r.column))?.column; return esc(label(t)) + (w?.can_create && col ? ` <a class="text-link" href="#yeni/${t}?${encodeURIComponent(col)}=${encodeURIComponent(id)}">ekle +</a>` : ''); }).join(', ')}</p>` : '');
}

// ---------- forms (create / edit) from the table documents ----------

function aboutTable(meta) {
  const w = meta.write;
  if (!w?.purpose && !w?.rules.length) return '';
  const mode = { crud: '', append_only: 'Bu tabloya yalnızca yeni kayıt eklenir; kayıtlar değiştirilmez.', read_only: 'Bu tablo yalnızca görüntülenir.', workflow_only: 'Bu kayıtlar kendi akışlarıyla oluşur (ör. üye işlemleri); buradan elle girilmez.' }[w.mode] ?? '';
  return `<details class="admin-about"><summary>Bu tablo hakkında</summary>${w.purpose ? `<p>${esc(w.purpose)}</p>` : ''}${mode ? `<p class="admin-muted">${esc(mode)}</p>` : ''}${w.rules.length ? `<ul>${w.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</details>`;
}

const optionLabel = (meta, col, v) => meta.write?.enums?.[col]?.[v] ?? STATUS[v] ?? valueLabel(col, v) ?? v;
const LONG_TEXT = /(description|notes|bio|_text|address|motivation|purpose|reason|note|content|message|body)/;

function recordBar(meta, row, id) {
  const w = meta.write;
  if (!w) return '';
  const actions = w.actions.filter(a => !a.from.length || a.from.includes(String(row[a.column] ?? '')));
  const deletable = w.deletable_when && (w.deletable_when.column === '*' || w.deletable_when.values.includes(String(row[w.deletable_when.column])));
  if (!w.update_columns.length && !actions.length && !deletable) return '';
  return `<div class="admin-actions admin-actions-top">${w.update_columns.length ? `<a class="shell-primary" href="#duzenle/${meta.name}/${esc(id)}">Düzenle</a>` : ''}`
    + actions.map(a => `<button class="shell-secondary${/cancel|reverse|reject|decline|revoke|suspend|archive/.test(a.action) ? ' admin-danger' : ''}" data-row-action="${esc(a.action)}" data-table="${meta.name}" data-id="${esc(id)}">${esc(a.label)}</button>`).join('')
    + (deletable ? `<button class="shell-secondary admin-danger" data-row-delete data-table="${meta.name}" data-id="${esc(id)}">Sil</button>` : '') + '</div>';
}

async function refChoices(table) {
  const meta = tableOf(table);
  if (!meta) return null;
  const res = await api(`/admin/data/${table}?limit=200`);
  const show = summaryColumns(meta, 3);
  return res.items.map(r => {
    const text = meta.label.map(c => r[c]).filter(Boolean).join(' ')
      || show.map(c => c.ref ? res.labels?.[c.ref.table]?.[r[c.name]] : r[c.name]).filter(v => v != null && v !== '').map(String).join(' · ')
      || String(r[meta.pk]).slice(0, 8);
    return { id: String(r[meta.pk]), text: text + (r.status && r.status !== 'active' ? ` (${optionLabel(meta, 'status', r.status)})` : '') };
  });
}

const localDateTime = v => { if (!v) return ''; const d = new Date(v); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function inputFor(meta, col, value, choices, { locked = false, required = false, allowed = null } = {}) {
  const id = `f-${col.name}`, attrs = `id="${id}" name="${esc(col.name)}"${required ? ' required' : ''}${locked ? ' disabled' : ''}`;
  const v = value == null ? '' : value;
  if (col.options) {
    const opts = allowed ? col.options.filter(o => allowed.includes(o)) : col.options;
    return `<select ${attrs}>${col.nullable || !required ? '<option value="">— seçilmedi —</option>' : ''}${opts.map(o => `<option value="${esc(o)}"${String(v) === o ? ' selected' : ''}>${esc(optionLabel(meta, col.name, o))}</option>`).join('')}</select>`;
  }
  if (col.ref && choices) {
    const known = choices.some(c => c.id === String(v));
    return `<select ${attrs}><option value="">${required ? '— seç —' : '— seçilmedi —'}</option>${!known && v ? `<option value="${esc(v)}" selected>${esc(String(v).slice(0, 8))}</option>` : ''}${choices.map(c => `<option value="${esc(c.id)}"${String(v) === c.id ? ' selected' : ''}>${esc(c.text)}</option>`).join('')}</select>`;
  }
  if (col.type === 'boolean') {
    return col.nullable
      ? `<select ${attrs}><option value="">—</option><option value="true"${v === true ? ' selected' : ''}>Evet</option><option value="false"${v === false ? ' selected' : ''}>Hayır</option></select>`
      : `<label class="admin-check"><input type="checkbox" ${attrs}${v === true ? ' checked' : ''}> Evet</label>`;
  }
  if (col.type === 'date') return `<input type="date" ${attrs} value="${esc(String(v).slice(0, 10))}">`;
  if (col.type.startsWith('timestamp')) return `<input type="datetime-local" ${attrs} value="${esc(localDateTime(v))}">`;
  if (['integer', 'smallint', 'bigint'].includes(col.type)) return `<input type="number" step="1" ${attrs} value="${esc(v)}">`;
  if (['numeric', 'double precision', 'real'].includes(col.type)) return `<input inputmode="decimal" ${attrs} value="${esc(v)}" placeholder="0,00">`;
  if (col.type === 'jsonb' || col.type === 'json') return `<textarea rows="4" ${attrs}>${esc(v === '' ? '' : JSON.stringify(v, null, 2))}</textarea>`;
  if (col.ref) return `<input ${attrs} value="${esc(v)}" placeholder="kayıt numarası">`;
  if (LONG_TEXT.test(col.name)) return `<textarea rows="3" ${attrs}>${esc(v)}</textarea>`;
  return `<input ${attrs} value="${esc(v)}"${col.pattern ? ` data-pattern="${esc(col.pattern)}"` : ''}>`;
}

async function formView(table, id, params) {
  const meta = tableOf(table);
  if (!meta?.write) return empty('Bu tabloyu görme yetkin yok ya da tablo yok.');
  const w = meta.write, editing = !!id;
  const names = editing ? w.update_columns : w.create_columns;
  if (!names.length) return empty(editing ? 'Bu kaydı düzenleme yetkin yok.' : 'Bu tabloya kayıt ekleme yetkin yok.', esc(aboutTable(meta) ? '' : ''));
  const record = editing ? await api(`/admin/data/${table}/${encodeURIComponent(id)}`) : null;
  const row = record?.row ?? Object.fromEntries([...params]);
  const shown = meta.columns.filter(c => names.includes(c.name) || (editing && c.name !== meta.pk && !['created_at', 'created_by_user_id', 'updated_at', 'updated_by_user_id'].includes(c.name)));
  const refs = [...new Set(shown.filter(c => c.ref && names.includes(c.name)).map(c => c.ref.table))];
  const choices = Object.fromEntries(await Promise.all(refs.map(async t => [t, await refChoices(t).catch(() => null)])));
  const required = c => !c.nullable && !c.hasDefault || w.required.includes(c.name);
  const field = c => {
    const locked = !names.includes(c.name);
    const help = w.help?.[c.name];
    const allowed = w.type_permissions?.column === c.name ? w.type_permissions.allowed : null;
    return `<div class="admin-field${locked ? ' admin-field-locked' : ''}"><label for="f-${esc(c.name)}">${esc(columnLabel(c.name))}${required(c) && !locked ? ' <span class="admin-req" aria-label="zorunlu">*</span>' : ''}${locked ? ' <span class="admin-muted">(değiştirilemez)</span>' : ''}</label>`
      + (locked ? `<div class="admin-locked-value">${cell(table, c, row[c.name], record?.labels, { full: true })}</div>` : inputFor(meta, c, row[c.name], c.ref ? choices[c.ref.table] : null, { required: required(c), allowed }))
      + (help ? `<small class="admin-help">${esc(help)}</small>` : '') + (w.derived?.[c.name] ? `<small class="admin-help">Hesaplama: ${esc(w.derived[c.name])}</small>` : '')
      + `<small class="admin-field-error" data-error-for="${esc(c.name)}" hidden></small></div>`;
  };
  const editable = shown.filter(c => names.includes(c.name)), fixed = shown.filter(c => !names.includes(c.name));
  return heading(esc(label(table)).toLocaleUpperCase('tr'), editing ? `${esc(meta.label.map(c => row[c]).filter(Boolean).join(' ') || label(table))} <em>düzenle.</em>` : `Yeni <em>kayıt.</em>`, `<code>${esc(table)}</code>`)
    + aboutTable(meta)
    + `<form id="record-form" class="admin-form admin-record-form" data-table="${table}" data-id="${esc(id ?? '')}" novalidate><div class="admin-form-grid">${editable.map(field).join('')}</div>`
    + `<p class="form-error" id="record-error" role="alert" hidden></p><div class="admin-actions"><button class="shell-primary" type="submit">${editing ? 'Değişiklikleri kaydet' : 'Kaydet'} <span>↗</span></button><a class="shell-secondary" href="${editing ? `#kayit/${table}/${esc(id)}` : `#veri/${table}`}">Vazgeç</a></div>`
    + (fixed.length ? `<details class="admin-about"><summary>Değiştirilemeyen alanlar (${fixed.length})</summary><div class="admin-form-grid">${fixed.map(field).join('')}</div></details>` : '')
    + '</form>';
}

function formValues(form, meta, editing, original) {
  const values = {};
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.disabled) continue;
    const col = meta.columns.find(c => c.name === el.name);
    if (!col) continue;
    let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (v !== true && v !== false && v !== '' && col.type.startsWith('timestamp')) v = new Date(v).toISOString();
    if (col.type === 'jsonb' || col.type === 'json') { if (v) { try { v = JSON.parse(v); } catch { throw Object.assign(new Error(`${columnLabel(col.name)}: geçerli JSON değil.`), { field: col.name }); } } }
    if (col.type === 'boolean' && el.tagName === 'SELECT') v = v === '' ? null : v === 'true';
    if (v === '') v = null;
    if (editing) {
      const before = original[col.name];
      const same = before == null ? v == null : col.type.startsWith('timestamp') ? v != null && new Date(before).getTime() === new Date(v).getTime()
        : typeof before === 'object' ? JSON.stringify(before) === JSON.stringify(v) : String(before) === String(v);
      if (same) continue;
    } else if (v === null) continue;
    values[col.name] = v;
  }
  return values;
}

function showFieldErrors(form, details) {
  form.querySelectorAll('[data-error-for]').forEach(e => { e.hidden = true; e.textContent = ''; });
  let first = null;
  for (const d of details ?? []) {
    const el = form.querySelector(`[data-error-for="${CSS.escape(d.path)}"]`);
    if (!el) continue;
    el.textContent = d.message.replace(/^[a-z_]+: /, ''); el.hidden = false; first ??= el;
  }
  first?.closest('.admin-field')?.querySelector('input,select,textarea')?.focus();
  return !!first;
}

function resetPanel(userId) {
  if (!can('user.reset_password')) return '';
  const link = resetLinks[userId];
  return `<section class="admin-section admin-card"><h2 class="admin-h2">Şifre sıfırlama</h2><p class="admin-muted">E-posta ulaşmıyorsa tek kullanımlık bir bağlantı oluşturup kişiye kendin iletebilirsin. Bağlantı 24 saat geçerli; yeni bağlantı eskisini geçersiz kılar. Yönetici hesapları için oluşturulamaz.</p>`
    + (link ? `<div class="admin-search admin-reset-link"><label class="visually-hidden" for="reset-link">Sıfırlama bağlantısı</label><input id="reset-link" readonly value="${esc(link.url)}"><button class="shell-secondary" data-copy="#reset-link">Kopyala</button></div><p class="admin-muted">Son geçerlilik: ${esc(when(link.expires_at))}. Bu bağlantıyı yalnızca hesabın sahibine ilet.</p>`
      : `<div class="admin-actions"><button class="shell-secondary" data-reset-link="${esc(userId)}">Sıfırlama bağlantısı oluştur</button></div>`) + '</section>';
}

async function rolePanel(userId, data) {
  if (!can('role.assign') && !can('role.revoke')) return '';
  const held = data.related.find(r => r.table === 'user_roles' && r.column === 'id_user')?.items.filter(r => r.status === 'active') ?? [];
  const roles = tableOf('roles') ? (await api('/admin/data/roles?status=active&limit=100')).items : [];
  const codeOf = Object.fromEntries(roles.map(r => [r.id_role, r]));
  return `<section class="admin-section admin-card"><h2 class="admin-h2">Global roller</h2><div class="admin-actions">${held.map(r => { const role = codeOf[r.id_role]; return `<span class="admin-role">${esc(role?.role_name ?? r.id_role)}${can('role.revoke') && role ? ` <button data-revoke="${esc(role.role_code)}" data-user="${esc(userId)}" aria-label="${esc(role.role_name)} rolünü geri al">✕</button>` : ''}</span>`; }).join('') || '<span class="admin-muted">Rol yok</span>'}</div>${can('role.assign') && roles.length ? `<form id="role-form" class="admin-search" data-user="${esc(userId)}"><label class="visually-hidden" for="role-code">Rol</label><select id="role-code" name="role_code">${roles.filter(r => !held.some(h => h.id_role === r.id_role)).map(r => `<option value="${esc(r.role_code)}">${esc(r.role_name)}</option>`).join('')}</select><button class="shell-secondary" type="submit">Rol ver</button></form>` : ''}</section>`;
}

// ---------- shell ----------

function navigation() {
  const items = [['genel', '⌂', 'Genel bakış', true], ['basvurular', '✎', 'Başvurular', can('membership.view')],
    ['etkinlikler', '▦', 'Etkinlikler', EVENT_PERMS.some(can)], ['veri', '◫', 'Veri ve ilişkiler', tables.length > 0]];
  document.querySelector('#admin-nav').innerHTML = '<span class="sidebar-label">FİKİRHANE YÖNETİMİ</span>'
    + items.filter(i => i[3]).map(([v, icon, text]) => `<a href="#${v}" data-view="${v}"><span>${icon}</span>${text}</a>`).join('');
}

async function render() {
  const id = ++renderId;
  const { view, a, b, params } = route();
  const nav = { etkinlik: 'etkinlikler', 'yeni-etkinlik': 'etkinlikler', kayit: 'veri', yeni: 'veri', duzenle: 'veri' }[view] ?? view;
  document.querySelectorAll('[data-view]').forEach(l => l.dataset.view === nav ? l.setAttribute('aria-current', 'page') : l.removeAttribute('aria-current'));
  content.setAttribute('aria-busy', 'true');
  try {
    const html = view === 'basvurular' ? await applications(params)
      : view === 'etkinlikler' ? await eventList(params, a)
      : view === 'etkinlik' && a ? await eventDetail(a)
      : view === 'yeni-etkinlik' ? await newEvent()
      : view === 'veri' && a ? await dataTable(a, params)
      : view === 'veri' ? dataIndex()
      : view === 'kayit' && a && b ? await record(a, b)
      : view === 'yeni' && a ? await formView(a, null, params)
      : view === 'duzenle' && a && b ? await formView(a, b, params)
      : await overview();
    if (id !== renderId) return;
    content.innerHTML = html;
    document.title = `${content.querySelector('h1')?.textContent ?? 'Yönetim'} · Fikirhane yönetim`;
  } catch (err) {
    if (id !== renderId) return;
    if (err?.status === 401) { location.replace(siteUrl('uyelik/?view=yonetim&giris')); return; }
    content.innerHTML = empty(err?.status === 403 ? 'Bu bölüm için yetkin yok.' : err?.status === 404 ? 'Kayıt bulunamadı.' : 'Bu sayfa yüklenemedi.', esc(err?.message ?? ''));
  } finally { if (id === renderId) content.removeAttribute('aria-busy'); }
}

async function run(task, success) {
  if (busy) return; busy = true;
  try { await task(); if (success) flash(success); await render(); }
  catch (err) { if (err?.status === 401) { location.replace(siteUrl('uyelik/?view=yonetim&giris')); return; } flash(err?.message || 'İşlem tamamlanamadı.'); }
  finally { busy = false; }
}

const DECISIONS = {
  approved: { title: 'Başvuruyu onayla', copy: 'Üyelik bugünden başlar.', input: 'Not (isteğe bağlı)', ok: 'Onayla', done: 'Başvuru onaylandı.' },
  under_review: { title: 'İncelemeye al', copy: 'Başvuru sahibi başvurusunun incelendiğini görür.', input: null, ok: 'İncelemeye al', done: 'Başvuru incelemede.' },
  waitlisted: { title: 'Bekleme listesine al', copy: 'Yer açıldığında yeniden değerlendirebilirsin.', input: 'Not (isteğe bağlı)', ok: 'Bekleme listesine al', done: 'Başvuru bekleme listesinde.' },
  declined: { title: 'Başvuruyu reddet', copy: 'Bu karar başvuru sahibine gösterilir.', input: 'Gerekçe', ok: 'Reddet', done: 'Başvuru reddedildi.' },
};

document.addEventListener('click', async event => {
  const t = event.target.closest('button'); if (!t) return;
  if (t.hasAttribute('data-switch-account')) { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); location.assign(siteUrl('uyelik/?view=yonetim&giris')); return; }
  if (t.hasAttribute('data-signout')) { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); location.assign(siteUrl('')); return; }
  if (t.dataset.decide) {
    const d = DECISIONS[t.dataset.decide];
    const note = await ask({ title: d.title, copy: d.copy, input: d.input, ok: d.ok, required: t.dataset.decide === 'declined' });
    if (note === null) return;
    run(() => api(`/admin/membership-applications/${t.dataset.id}/decision`, { method: 'POST', body: { decision: t.dataset.decide, decision_note: note || null, ...(t.dataset.decide === 'declined' ? { decision_reason: 'other' } : {}) } }), d.done);
  }
  if (t.dataset.publish) {
    if (await ask({ title: 'Etkinliği yayınla', copy: 'Yayınlanan etkinlik üyelere görünür ve rezervasyona açılır.', ok: 'Yayınla' }) === null) return;
    run(() => api(`/admin/events/${t.dataset.publish}/publish`, { method: 'POST', body: {} }), 'Etkinlik yayında.');
  }
  if (t.dataset.cancelEvent) {
    const reason = await ask({ title: 'Etkinliği iptal et', copy: 'Bütün aktif rezervasyonlar da iptal edilir. Bu işlem geri alınamaz.', input: 'İptal gerekçesi (en az 3 karakter)', ok: 'Etkinliği iptal et', required: true });
    if (reason === null) return;
    if (reason.length < 3) { flash('İptal gerekçesi en az 3 karakter olmalı.'); return; }
    run(async () => { const r = await api(`/admin/events/${t.dataset.cancelEvent}/cancel`, { method: 'POST', body: { reason } }); if (r?.cancelledBookings) flash(`Etkinlik iptal edildi, ${r.cancelledBookings} rezervasyon da iptal edildi.`); }, 'Etkinlik iptal edildi.');
  }
  if (t.dataset.resetLink) {
    if (await ask({ title: 'Sıfırlama bağlantısı oluştur', copy: 'Bu kişinin önceki sıfırlama bağlantıları geçersiz olur. Bağlantıyı yalnızca hesabın sahibine ilet.', ok: 'Oluştur' }) === null) return;
    const userId = t.dataset.resetLink;
    run(async () => { resetLinks[userId] = await api(`/admin/users/${userId}/password-reset-link`, { method: 'POST', body: {} }); }, 'Bağlantı oluşturuldu.');
  }
  if (t.dataset.copy) {
    const input = content.querySelector(t.dataset.copy);
    try { await navigator.clipboard.writeText(input.value); flash('Kopyalandı.'); } catch { input.select(); flash('Seçildi; Ctrl+C ile kopyala.'); }
  }
  if (t.dataset.rowAction) {
    const meta = tableOf(t.dataset.table), action = meta?.write?.actions.find(a => a.action === t.dataset.rowAction);
    if (!action) return;
    const reason = await ask({ title: action.label, copy: action.effects ?? 'Bu işlem kaydın durumunu değiştirir ve denetim kaydına yazılır.', input: action.needs_reason ? 'Gerekçe (en az 3 karakter)' : null, ok: action.label, required: action.needs_reason });
    if (reason === null) return;
    run(() => api(`/admin/data/${t.dataset.table}/${t.dataset.id}/actions/${action.action}`, { method: 'POST', body: { reason: reason || null } }), 'İşlem tamamlandı.');
  }
  if (t.hasAttribute('data-row-delete')) {
    if (await ask({ title: 'Kaydı sil', copy: 'Bu kayıt kalıcı olarak silinecek. Silme işlemi denetim kaydına yazılır.', ok: 'Sil' }) === null) return;
    const table = t.dataset.table;
    run(async () => { await api(`/admin/data/${table}/${t.dataset.id}`, { method: 'DELETE' }); location.hash = `veri/${table}`; }, 'Kayıt silindi.');
  }
  if (t.dataset.checkin) run(() => api(`/admin/bookings/${t.dataset.checkin}/checkin`, { method: 'POST', body: {} }), 'Giriş kaydedildi.');
  if (t.dataset.revoke) {
    if (await ask({ title: 'Rolü geri al', copy: `${t.dataset.revoke} rolü bu kullanıcıdan geri alınacak.`, ok: 'Geri al' }) === null) return;
    run(() => api(`/admin/users/${t.dataset.user}/roles/${t.dataset.revoke}`, { method: 'DELETE' }), 'Rol geri alındı.');
  }
});

async function saveRecord(form) {
  if (busy) return;
  const table = form.dataset.table, id = form.dataset.id || null, meta = tableOf(table);
  const error = form.querySelector('#record-error'); error.hidden = true;
  let values;
  try {
    const original = id ? (await api(`/admin/data/${table}/${encodeURIComponent(id)}`)).row : {};
    values = formValues(form, meta, !!id, original);
  } catch (err) { showFieldErrors(form, err.field ? [{ path: err.field, message: err.message }] : []); error.textContent = err.message; error.hidden = false; return; }
  if (id && !Object.keys(values).length) { flash('Değişiklik yok.'); location.hash = `kayit/${table}/${id}`; return; }
  busy = true; form.querySelector('[type=submit]').disabled = true;
  try {
    const res = await api(`/admin/data/${table}${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body: { values } });
    flash(id ? 'Değişiklikler kaydedildi.' : 'Kayıt oluşturuldu.');
    location.hash = `kayit/${table}/${res.id}`;
  } catch (err) {
    if (err?.status === 401) { location.replace(siteUrl('uyelik/?view=yonetim&giris')); return; }
    showFieldErrors(form, err.details);
    error.textContent = err.message; error.hidden = false;
  } finally { busy = false; form.querySelector('[type=submit]') && (form.querySelector('[type=submit]').disabled = false); }
}

content.addEventListener('submit', event => {
  const form = event.target; event.preventDefault();
  if (form.id === 'data-search') {
    const { a, params } = route(); const q = new FormData(form).get('q').toString().trim();
    q ? params.set('q', q) : params.delete('q'); params.delete('sayfa');
    location.hash = `veri/${a}${params.size ? '?' + params : ''}`;
  }
  if (form.id === 'record-form') { saveRecord(form); return; }
  if (form.id === 'role-form') {
    const code = new FormData(form).get('role_code');
    if (code) run(() => api(`/admin/users/${form.dataset.user}/roles`, { method: 'POST', body: { role_code: code } }), 'Rol verildi.');
  }
  if (form.id === 'event-form') {
    const f = new FormData(form);
    const start = new Date(f.get('start')), end = new Date(f.get('end'));
    if (!(end > start)) { flash('Bitiş, başlangıçtan sonra olmalı.'); return; }
    const [location_code, setup_code] = String(f.get('setup')).split('|');
    const body = {
      event_type: f.get('event_type'), event_title: f.get('event_title').trim(), event_description: f.get('event_description').trim() || null,
      start_datetime: start.toISOString(), end_datetime: end.toISOString(), base_price: String(f.get('base_price')).replace(',', '.'), currency_code: 'TRY',
      club_code: f.get('club_code') || null,
      options: [{ location_code, setup_code, option_code: location_code.slice(0, 30), capacity: Number(f.get('capacity')) }],
    };
    run(async () => { const r = await api('/admin/events', { method: 'POST', body }); location.hash = `etkinlik/${r.id_event}`; }, 'Taslak kaydedildi.');
  }
});

content.addEventListener('change', event => {
  if (event.target.name !== 'setup') return;
  const capacity = event.target.selectedOptions[0]?.dataset.capacity;
  const input = content.querySelector('input[name=capacity]');
  if (capacity && input) { input.max = capacity; if (!input.value || Number(input.value) > Number(capacity)) input.value = capacity; }
});

menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Yönetim menüsünü kapat' : 'Yönetim menüsünü aç'); sidebar.classList.toggle('open', open); });
function closeMenu() { sidebar.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Yönetim menüsünü aç'); }
window.addEventListener('hashchange', () => { closeMenu(); render().then(() => document.querySelector('#admin-main').focus({ preventScroll: true })); window.scrollTo({ top: 0 }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

async function start() {
  const loading = document.querySelector('#admin-loading p');
  if (!await apiAvailable()) { loading.innerHTML = 'Yönetim paneli yalnızca sunucuya bağlıyken çalışır. <a class="text-link" href="../">Keşif sayfasına dön ↗</a>'; return; }
  try { me = await api('/me'); } catch (err) { if (err.status === 401) { location.replace(siteUrl('uyelik/?view=yonetim&giris')); return; } throw err; }
  let schema;
  try { schema = await api('/admin/schema'); } catch (err) {
    if (err.status === 403) {
      loading.innerHTML = `<b>${esc(me.user.email ?? me.user.first_name)}</b> hesabıyla giriş yaptın; bu hesabın yönetim yetkisi yok.<br><button class="shell-primary admin-switch" data-switch-account>Başka bir hesapla giriş yap <span>↗</span></button> <a class="text-link" href="../member/">Üye alanına dön ↗</a>`;
      return;
    }
    throw err;
  }
  perms = new Set(schema.permissions); tables = schema.tables;
  document.querySelector('#header-name').textContent = me.user.first_name;
  document.querySelector('#header-initial').textContent = me.user.first_name[0].toLocaleUpperCase('tr');
  document.querySelector('#admin-roles').textContent = me.roles.filter(r => r !== 'USER').map(r => r.replace(/_/g, ' ')).join(' · ');
  navigation();
  document.querySelector('#admin-loading').hidden = true;
  document.querySelector('#admin-shell').hidden = false;
  await render();
}
start().catch(() => { document.querySelector('#admin-loading p').textContent = 'Yönetim paneli şu anda yüklenemedi. Biraz sonra tekrar dener misin?'; });
