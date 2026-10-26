// Host and admin shells (host/, admin/): the same app over the API, with a different set of areas. Host is daily work —
// today's program, the door, applications, each staff role's own records, and what a club lead or event host runs.
// Admin is the back office — every table and relation, roles and permissions, system settings. Every action is
// re-checked on the server; which shell shows a screen is UX only.
import { initTheme, escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';
import { siteUrl } from './session.js';
import { API_BASE } from './config.js';
import { columnLabel, valueLabel } from './admin-labels.js';
import './topnav.js';
initTheme();

const content = document.querySelector('#admin-content');
const SHELL = document.body.dataset.shell === 'host' ? 'host' : 'admin';
const SHELL_NAME = { host: 'Host paneli', admin: 'Yönetim' }[SHELL];

const GROUPS = { identity: 'Kimlik ve erişim', profile: 'Profil', membership: 'Üyelik', clubs: 'Kulüpler ve kurumlar', growth: 'Büyüme ve sponsorluk', events: 'Etkinlik ve mekân', finance: 'Finans ve stok' };
// Each shell is organised by area; each area has tabs for its own screens and tables.
const HOST_MODULES = [
  { key: 'program', icon: '▦', title: 'Program', copy: 'Etkinlikler, katılımcılar ve kapıda giriş.',
    views: [{ tab: 'program', label: 'Program', href: '#etkinlikler', show: () => EVENT_PERMS.some(can) },
      { tab: 'kontrol', label: 'Giriş kontrol', href: '#kontrol', show: () => can('booking.checkin') || can('event_attendance.manage') || scope.events.length > 0 }],
    tables: ['bookings'] },
  { key: 'sorumluluk', icon: '◎', title: 'Sorumluluklarım', copy: 'Yürüttüğün kulüpler ve görev aldığın etkinlikler.',
    views: [{ tab: 'kuluplerim', label: 'Kulüplerim', href: '#kuluplerim', show: () => scope.clubs.length > 0 },
      { tab: 'etkinliklerim', label: 'Etkinliklerim', href: '#etkinliklerim', show: () => scope.events.length > 0 }],
    tables: [] },
  { key: 'uyeler', icon: '◯', title: 'Üyeler', copy: 'Başvurular, kişiler ve üyelikler.',
    views: [{ tab: 'basvurular', label: 'Başvurular', href: '#basvurular', show: () => can('membership.view') },
      { tab: 'turlar', label: 'Tur talepleri', href: '#turlar', show: () => can('tour.view') }],
    tables: ['users', 'user_memberships', 'membership_applications'] },
  { key: 'kafeterya', icon: '▤', title: 'Kafeterya ve stok', copy: 'Satış, ürünler, stok hareketleri ve sayımlar.',
    views: [{ tab: 'satis', label: 'Satış', href: '#satis', show: () => can('cafeteria_sale.create') },
      { tab: 'hesaplar', label: 'Açık hesaplar', href: '#hesaplar', show: () => SHELL === 'host' && can('cafeteria_sale.create') },
      { tab: 'etiketler', label: 'QR etiketleri', href: '#etiketler', show: () => SHELL === 'host' && can('cafeteria_sale.create') },
      { tab: 'eksikler', label: 'Eksikler', href: '#eksikler', show: () => can('stock.view') }],
    tables: ['items', 'stock_movements', 'stock_counts', 'stock_count_items'] },
  { key: 'finans', icon: '₺', title: 'Finans', copy: 'Belgeler, para hareketleri, ödeme eşleştirmeleri, hesaplar ve raporlar.',
    views: [{ tab: 'raporlar', label: 'Raporlar', href: '#raporlar', show: () => can('report.view'), last: true }],
    tables: ['documents', 'document_items', 'transactions', 'transaction_allocations', 'accounts', 'financial_centers', 'financial_categories'] },
  { key: 'buyume', icon: '↗', title: 'Büyüme', copy: 'Kampanyalar, davetler, freepass’ler ve üyelerin nereden geldiği.',
    tables: ['campaigns', 'invitations', 'freepasses', 'freepass_redemptions', 'user_acquisitions'] },
];
const ADMIN_MODULES = [
  { key: 'uyeler', icon: '◯', title: 'Üyeler', copy: 'Kişiler, üyelikler, başvurular ve roller.',
    tables: ['users', 'user_memberships', 'membership_applications', 'user_roles', 'user_emails', 'needs', 'offers'] },
  { key: 'kulupler', icon: '◎', title: 'Kulüpler', copy: 'Kalıcı topluluklar, üyeleri ve kulüp içi roller.',
    tables: ['clubs', 'club_users', 'club_member_roles'] },
  { key: 'etkinlikler', icon: '▦', title: 'Etkinlikler', copy: 'Etkinlik kayıtları, seçenekler, görevliler ve rezervasyonlar.',
    tables: ['events', 'event_series', 'event_options', 'event_clubs', 'event_organizations', 'event_users', 'bookings'] },
  { key: 'mekan', icon: '⌗', title: 'Mekânlar', copy: 'Alanlar, yerleşim düzenleri, masalar ve koltuklar.',
    tables: ['locations', 'space_setups', 'tables', 'seats'] },
  { key: 'kurumlar', icon: '◇', title: 'Kurumlar ve sponsorluk', copy: 'Şirketler, üniversiteler, partnerler ve kulüp sponsorlukları.',
    tables: ['organizations', 'organization_users', 'organization_roles', 'sponsorship_plans', 'club_sponsorships', 'sponsorship_usage'] },
  { key: 'buyume', icon: '↗', title: 'Büyüme', copy: 'Kampanyalar, davetler, freepass’ler ve üyelerin nereden geldiği.',
    tables: ['campaigns', 'invitations', 'freepasses', 'freepass_redemptions', 'user_acquisitions'] },
  { key: 'finans', icon: '₺', title: 'Finans', copy: 'Satış ve alış belgeleri, para hareketleri, ödeme eşleştirmeleri, hesaplar ve raporlar.',
    views: [{ tab: 'raporlar', label: 'Raporlar', href: '#raporlar', show: () => can('report.view'), last: true }],
    tables: ['documents', 'document_items', 'transactions', 'transaction_allocations', 'accounts', 'financial_centers', 'financial_categories'] },
  { key: 'stok', icon: '▤', title: 'Stok', copy: 'Ürün ve hizmet kataloğu, stok hareketleri, sayımlar ve eksikler.',
    views: [{ tab: 'eksikler', label: 'Eksikler', href: '#eksikler', show: () => can('stock.view') }],
    tables: ['items', 'stock_movements', 'stock_counts', 'stock_count_items'] },
  { key: 'sistem', icon: '⚙', title: 'Sistem', copy: 'Roller ve yetkiler, üyelik tipleri, denetim kaydı.',
    views: [{ tab: 'harita', label: 'Tüm tablolar', href: '#veri', show: () => tables.length > 0, last: true }],
    tables: ['roles', 'role_permissions', 'permissions', 'membership_types', 'audit_log'] },
];
const MODULES = SHELL === 'host' ? HOST_MODULES : ADMIN_MODULES;
// Daily-work screens live in the host shell; the admin shell sends them there.
const HOST_VIEWS = ['basvurular', 'turlar', 'etkinlikler', 'etkinlik', 'yeni-etkinlik', 'kontrol', 'kuluplerim', 'etkinliklerim', 'satis'];
const hostTables = new Set(HOST_MODULES.flatMap(m => m.tables));
const moduleOfTable = name => MODULES.find(m => m.tables.includes(name));
const moduleTabs = m => [...(m.views ?? []).filter(v => !v.last && v.show()).map(v => ({ tab: v.tab, label: v.label, href: v.href })),
  ...m.tables.filter(t => tableOf(t)).map(t => ({ tab: t, label: label(t), href: `#veri/${t}` })),
  ...(m.views ?? []).filter(v => v.last && v.show()).map(v => ({ tab: v.tab, label: v.label, href: v.href }))];
const visibleModules = () => MODULES.filter(m => moduleTabs(m).length);

/** Which area and tab a route belongs to, for the menu and the tab bar. */
function placeOf(view, a) {
  if (view === 'basvurular' || view === 'turlar') return ['uyeler', view];
  if (view === 'kontrol') return ['program', 'kontrol'];
  if (view === 'satis' || view === 'hesaplar' || view === 'etiketler') return ['kafeterya', view];
  if (view === 'eksikler') return [SHELL === 'host' ? 'kafeterya' : 'stok', 'eksikler'];
  if (view === 'raporlar') return ['finans', 'raporlar'];
  if (['etkinlikler', 'etkinlik', 'yeni-etkinlik'].includes(view)) return ['program', 'program'];
  if (view === 'kuluplerim' || view === 'etkinliklerim') return ['sorumluluk', view];
  if (view === 'veri' && !a) return ['sistem', 'harita'];
  if (['veri', 'kayit', 'yeni', 'duzenle'].includes(view) && a) return [moduleOfTable(a)?.key ?? 'sistem', a];
  if (view === 'm' && a) return [a, null];
  return ['genel', null];
}

function tabBar(moduleKey, tab) {
  const m = MODULES.find(x => x.key === moduleKey);
  if (!m) return '';
  return `<nav class="admin-tabs" aria-label="${esc(m.title)}">${moduleTabs(m).map(t => `<a href="${t.href}"${t.tab === tab ? ' aria-current="page"' : ''}>${esc(t.label)}</a>`).join('')}</nav>`;
}

const TABLE_LABELS = {
  users: 'Kullanıcılar', user_emails: 'E-posta adresleri', roles: 'Roller', permissions: 'Yetkiler', role_permissions: 'Rol yetkileri', user_roles: 'Kullanıcı rolleri', audit_log: 'Denetim kaydı',
  skills: 'Beceriler', user_skills: 'Kullanıcı becerileri', interests: 'İlgi alanları', user_interests: 'Kullanıcı ilgi alanları', needs: 'Üye ihtiyaçları', offers: 'Üye katkıları',
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
  new: 'Yeni', contacted: 'İletişime geçildi', scheduled: 'Saati belli', visited: 'Geldi',
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
const OVERVIEW = SHELL === 'host' ? [
  ['new_tours', 'Yeni tur talebi', '#turlar'], ['open_applications', 'Açık üyelik başvurusu', '#basvurular'], ['events_awaiting_publish', 'Yayın bekleyen etkinlik', '#etkinlikler/onay'],
  ['upcoming_events', 'Önümüzdeki 7 günde etkinlik', '#etkinlikler'], ['active_bookings', 'Aktif rezervasyon', '#veri/bookings'],
] : [
  ['users', 'Aktif kullanıcı', '#veri/users'], ['active_memberships', 'Aktif üyelik', '#veri/user_memberships?status=active'],
  ['active_bookings', 'Aktif rezervasyon', '#veri/bookings'], ['open_applications', 'Açık üyelik başvurusu', '#veri/membership_applications'],
];
const CLUB_ROLES = { CLUB_LEAD: 'Kulüp lideri', CO_LEAD: 'Yardımcı lider', MODERATOR: 'Moderatör', MEMBER: 'Üye', SPONSOR_REPRESENTATIVE: 'Sponsor temsilcisi' };
const SCOPE_ROLES = { club: 'Kulübünün etkinliği', host: 'Host', tutor: 'Eğitmen', facilitator: 'Kolaylaştırıcı', moderator: 'Moderatör', staff: 'Görevli' };
const EVENT_PERMS = ['event.create', 'event.publish', 'event.cancel', 'booking.view'];

let me = null, perms = new Set(), tables = [], scope = { clubs: [], events: [] }, toastTimer, busy = false, renderId = 0;
const resetLinks = {};
const can = p => perms.has(p);
const tableOf = name => tables.find(t => t.name === name);
const label = name => TABLE_LABELS[name] ?? name;
const hasShell = s => me?.shells?.includes(s);
/** A daily-work screen: here in the host shell; from the admin shell, in the host shell when this account has it. */
const opsHref = hash => SHELL === 'host' ? '#' + hash : hasShell('host') ? siteUrl('host/#' + hash) : null;

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
  // Fixed record codes (CASH_TRY …) stay on the record page; lists hide them when every record has a name to show instead.
  const named = meta.label.length > 0 && meta.label.every(n => meta.columns.find(c => c.name === n)?.nullable === false);
  const cols = meta.columns.filter(c => c.name !== meta.pk && !['created_by_user_id', 'updated_by_user_id', 'updated_at'].includes(c.name)
    && !(named && c.name.endsWith('_code') && c.name !== 'currency_code' && !meta.label.includes(c.name)));
  const score = c => meta.label.includes(c.name) ? 0 : c.name.endsWith('status') ? 1 : c.ref && !c.name.endsWith('_by_user_id') ? 2 : c.name.endsWith('_by_user_id') ? 6
    : /^(direction|grand_total|amount|transaction_type|movement_type|quantity|document_date|start_datetime|transaction_at)$/.test(c.name) ? 1.5
    : /(_name|_title|_code|email|amount|price|quantity|capacity|_date|_datetime)$/.test(c.name) ? 3 : c.name === 'created_at' ? 5 : 4;
  return cols.map((c, i) => [c, score(c), i]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).slice(0, max).map(x => x[0]).sort((x, y) => meta.columns.indexOf(x) - meta.columns.indexOf(y));
}

// Columns may also be computed ones ({ name, label, render }) that are not in the table itself.
function rowsTable(table, items, labels, columns) {
  const meta = tableOf(table);
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${columns.map(c => `<th scope="col">${esc(c.label ?? columnLabel(c.name, c.name === meta.pk))}</th>`).join('')}<th scope="col"><span class="visually-hidden">Kayıt</span></th></tr></thead><tbody>${items.map(r => `<tr>${columns.map(c => `<td>${c.render ? c.render(r) : cell(table, c, r[c.name], labels)}</td>`).join('')}<td><a class="admin-open" href="#kayit/${esc(table)}/${esc(r[meta.pk])}" aria-label="Kaydı aç">↗</a></td></tr>`).join('')}</tbody></table></div>`;
}

const STAFF_ROLES = { FIKIRHANE_ADMIN: 'Admin', TECH_ADMIN: 'Teknik admin', ACCOUNTING: 'Muhasebe', MARKETING: 'Pazarlama', KITCHEN_STAFF: 'Mutfak' };

/** The users list's Roller column: staff roles and the active plan by its name (Basic, Plus); Üyeliksiz when neither. */
function peopleColumn(columns, people) {
  const chip = (kind, code, text) => `<span class="admin-status" data-kind="${kind}" title="${esc(code)}">${esc(text)}</span>`;
  const kinds = p => {
    const chips = [...(p?.roles ?? []).map(r => chip('staff', r.code, STAFF_ROLES[r.code] ?? r.name)),
      ...(p?.membership ? [chip('member', p.membership.code, p.membership.name)] : [])];
    if (!chips.length && p && 'membership' in p) chips.push(chip('none', 'Aktif üyeliği yok', 'Üyeliksiz'));
    return chips.length ? `<span class="admin-kinds">${chips.join('')}</span>` : '<span class="admin-null">—</span>';
  };
  const column = { name: 'people', label: 'Roller', render: r => kinds(people[r.id_user]) };
  const at = columns.findIndex(c => c.name === 'last_name') + 1;
  return at ? [...columns.slice(0, at), column, ...columns.slice(at)] : [column, ...columns];
}

const WIRING = { unwired: ['Özelliğe bağlı değil', 'Bu yetki için henüz bir ekran ya da işlem yok; vermek bugün bir şey değiştirmez.'],
  signed_in: ['Girişle açık', 'Giriş yapan herkes bu işlemi yapabilir; yetki tek tek kontrol edilmez.'] };

/** Permission and role-permission lists: a Kullanım column for rights that are not tied to a feature, from the list's `wiring`. */
function wiringColumn(columns, wiring) {
  const chip = w => w ? `<span class="admin-status" data-kind="${w === 'unwired' ? 'none' : 'member'}" title="${esc(WIRING[w][1])}">${esc(WIRING[w][0])}</span>` : '<span class="admin-null">—</span>';
  return [...columns, { name: 'wiring', label: 'Kullanım', render: r => chip(wiring[r.id_permission]) }];
}

// ---------- views ----------

async function overview() {
  const [data, tours] = await Promise.all([api('/admin/overview').catch(() => ({})),
    SHELL === 'host' && can('tour.view') ? api('/host/tours').catch(() => null) : null]);
  if (tours) data.new_tours = tours.items.filter(r => r.status === 'new').length;
  const tiles = OVERVIEW.filter(([k]) => k in data);
  const mods = visibleModules();
  const intro = SHELL === 'host' ? 'Günün işleri burada: program, kapı, başvurular ve sorumlu olduğun kayıtlar. Gördüklerin rollerine göre belirlenir.'
    : 'Fikirhane’nin bütün kayıtları ve ilişkileri, roller ve yetkiler burada. Gördüklerin rollerine göre belirlenir.';
  const mine = SHELL === 'host' && scope.events.length ? `<section class="admin-section"><div class="member-section-top"><h2>Sıradaki etkinliklerin</h2><a class="text-link" href="#etkinliklerim">Tümü ↗</a></div>${scopeEvents(scope.events.slice(0, 5))}</section>` : '';
  return heading(SHELL === 'host' ? 'HOST PANELİ' : 'YÖNETİM', `Merhaba, <em>${esc(me.user.first_name)}.</em>`, intro)
    + (tiles.length ? `<div class="admin-stats">${tiles.map(([k, text, href]) => `<a href="${href}"><strong>${data[k]}</strong><span>${text} <span>↗</span></span></a>`).join('')}</div>` : '')
    + mine
    + `<section class="admin-section"><div class="member-section-top"><h2>Bölümler</h2></div><div class="admin-groups">${mods.map(m => `<a href="#m/${m.key}" class="admin-group"><span class="section-label">${m.icon} ${esc(m.title.toLocaleUpperCase('tr'))}</span><small>${esc(m.copy)}</small><small class="admin-group-tabs">${moduleTabs(m).slice(0, 4).map(t => esc(t.label)).join(' · ')}${moduleTabs(m).length > 4 ? ' …' : ''}</small></a>`).join('')}</div></section>`;
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
  // Club leads and event hosts cannot read the event record; their scope carries the title and time.
  const mine = scope.events.find(x => x.id_event === id);
  const title = esc(e?.event_title ?? mine?.event_title ?? 'Etkinlik');
  const checkin = can('booking.checkin') || can('event_attendance.manage') || scope.events.some(x => x.id_event === id);
  const options = record?.related.find(r => r.table === 'event_options' && r.column === 'id_event');
  return heading('ETKİNLİK', title, e ? `${esc(when(e.start_datetime))} — ${esc(when(e.end_datetime))} · ${esc(money(e.base_price, e.currency_code))}`
    : mine ? `${esc(when(mine.start_datetime))} — ${esc(when(mine.end_datetime))} · ${esc(SCOPE_ROLES[mine.role] ?? mine.role)}` : '')
    + (e ? `<div class="admin-actions admin-actions-top">${badge(e.status)}${eventActions({ ...e, id_event: id }).replace(/<a class="shell-secondary" href="#etkinlik[^>]*>Katılımcılar<\/a>/, '')}<a class="text-link" href="#kayit/events/${esc(id)}">Tüm alanlar ve ilişkiler ↗</a></div>` : '')
    + (options?.items.length ? `<section class="admin-section"><h2 class="admin-h2">Seçenekler</h2>${rowsTable('event_options', options.items, options.labels, summaryColumns(tableOf('event_options')))}</section>` : '')
    + `<section class="admin-section"><h2 class="admin-h2">Katılımcılar${people ? ` <small>(${people.items.length})</small>` : ''}</h2>`
    + (!people ? '<p class="admin-muted">Bu etkinliğin katılımcılarını görme yetkin yok.</p>'
      : people.items.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Katılımcı</th><th scope="col">Yer</th><th scope="col">Durum</th><th scope="col">Ödeme</th><th scope="col">Tutar</th><th scope="col">Giriş</th></tr></thead><tbody>${people.items.map(p => `<tr><td>${p.first_name ? `${esc(p.first_name)} ${esc(p.last_name)}` : '<span class="admin-muted">Misafir</span>'}</td><td>${esc(p.option_code)}${p.seat_code ? ` · ${esc(p.seat_code)}` : ''}</td><td>${badge(p.booking_status)}</td><td>${esc(valueLabel('payment_status', p.payment_status) ?? p.payment_status)}</td><td>${esc(money(p.final_price, e?.currency_code))}</td><td>${p.checkin_at ? esc(when(p.checkin_at)) : checkin && p.booking_status === 'confirmed' ? `<button class="shell-secondary" data-checkin="${p.id_booking}">Giriş yaptı</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="admin-muted">Henüz rezervasyon yok.</p>') + '</section>';
}

// ---------- visit requests from "Tur planla" (host shell) ----------

const TOUR_INTERESTS = { coworking: 'Çalışma alanı', meeting_room: 'Toplantı odası', event_space: 'Etkinlik alanı', clubs: 'Kulüpler' };
const TOUR_SLOTS = { morning: 'sabah (10.00–14.00)', afternoon: 'öğleden sonra (14.00–18.00)' };
const TOUR_NEXT = [['contacted', 'İletişime geçildi'], ['scheduled', 'Saati belli'], ['visited', 'Geldi'], ['cancelled', 'İptal']];
const longDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

async function tours(params) {
  const filter = params.get('durum') === 'kapali' ? 'kapali' : 'acik';
  const { items } = await api(`/host/tours?durum=${filter}`);
  const manage = can('tour.manage');
  return heading('ZİYARETLER', 'Tur <em>talepleri.</em>', 'Gelip görmek isteyenler. Ara ya da yaz, saati birlikte netleştir; durumu buradan işaretle.')
    + `<div class="event-filter admin-filter">${[['acik', 'Açık'], ['kapali', 'Gelen ve iptal']].map(([k, label]) => `<a href="#turlar?durum=${k}" aria-pressed="${k === filter}" class="admin-chip">${label}</a>`).join('')}</div>`
    + (items.length ? `<div class="admin-cards">${items.map(r => {
      const contact = [r.contact_phone ? `<a class="text-link" href="tel:${esc(r.contact_phone.replace(/[^+0-9]/g, ''))}">${esc(r.contact_phone)}</a>` : '',
        r.contact_email ? `<a class="text-link" href="mailto:${esc(r.contact_email)}">${esc(r.contact_email)}</a>` : ''].filter(Boolean).join(' · ');
      return `<article class="admin-card"><div class="admin-card-top"><div><h2>${esc(r.first_name)}</h2><p>${esc(longDate.format(new Date(`${String(r.preferred_date).slice(0, 10)}T12:00:00+03:00`)))}, ${esc(TOUR_SLOTS[r.preferred_slot] ?? r.preferred_slot)} · ${contact}</p></div>${badge(r.status)}</div>`
        + (r.interests?.length ? `<p><b>İlgilendiği:</b> ${esc(r.interests.map(i => TOUR_INTERESTS[i] ?? i).join(', '))}</p>` : '')
        + (r.note ? `<blockquote>${esc(r.note)}</blockquote>` : '')
        + (r.staff_note ? `<p class="admin-muted">Ekip notu: ${esc(r.staff_note)}${r.handled_by ? ` (${esc(r.handled_by)})` : ''}</p>` : '')
        + `<p class="admin-muted">Gönderildi: ${esc(when(r.created_at))}</p>`
        + (manage ? `<div class="admin-actions">${TOUR_NEXT.filter(([s]) => s !== r.status).map(([s, label]) => `<button class="${s === 'cancelled' ? 'shell-secondary admin-danger' : 'shell-secondary'}" data-tour="${esc(r.id_tour_request)}" data-tour-status="${s}">${label}</button>`).join('')}</div>` : '')
        + '</article>';
    }).join('')}</div>` : empty(filter === 'acik' ? 'Bekleyen tur talebi yok.' : 'Henüz kapanan tur talebi yok.', filter === 'acik' ? '“Tur planla” sayfasından gelen notlar burada görünür.' : ''));
}

// ---------- what a club lead or event host runs (host shell) ----------

function scopeEvents(list) {
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Tarih</th><th scope="col">Etkinlik</th><th scope="col">Görevin</th><th scope="col">Durum</th><th scope="col">Doluluk</th><th scope="col"><span class="visually-hidden">İşlemler</span></th></tr></thead><tbody>${list.map(e =>
    `<tr><td>${esc(when(e.start_datetime))}</td><td>${esc(e.event_title)}</td><td>${esc(SCOPE_ROLES[e.role] ?? e.role)}</td><td>${badge(e.status)}</td><td>${e.booked} / ${e.capacity}</td><td><a class="text-link" href="#etkinlik/${esc(e.id_event)}">Katılımcılar ↗</a></td></tr>`).join('')}</tbody></table></div>`;
}

async function myEvents() {
  return heading('SORUMLULUKLARIM', 'Görev aldığın <em>etkinlikler.</em>', 'Görev aldığın ve yürüttüğün kulüplerin yaklaşan etkinlikleri. Katılımcıları görür, girişleri işaretlersin.')
    + (scope.events.length ? scopeEvents(scope.events) : empty('Yaklaşan bir görevin yok.', 'Bir etkinlikte görev aldığında ya da kulübünün etkinliği olduğunda burada görünür.'));
}

async function myClubs() {
  if (!scope.clubs.length) return heading('SORUMLULUKLARIM', 'Yürüttüğün <em>kulüpler.</em>') + empty('Yürüttüğün bir kulüp yok.');
  const lists = await Promise.all(scope.clubs.map(c => api(`/host/clubs/${c.id_club}/members`).catch(err => err.status === 403 ? null : Promise.reject(err))));
  return heading('SORUMLULUKLARIM', 'Yürüttüğün <em>kulüpler.</em>', 'Lideri ya da moderatörü olduğun kulüpler ve üyeleri.')
    + scope.clubs.map((c, i) => `<section class="admin-section"><div class="member-section-top"><h2 class="admin-h2">${esc(c.club_name)} <small>${esc(CLUB_ROLES[c.role_code] ?? c.role_name)}</small></h2></div>`
      + (!lists[i] ? '<p class="admin-muted">Bu kulübün üyelerini görme yetkin yok.</p>'
        : lists[i].items.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Üye</th><th scope="col">Kulüp rolü</th><th scope="col">Seviye</th><th scope="col">Katıldığı tarih</th></tr></thead><tbody>${lists[i].items.map(m =>
          `<tr><td>${esc(m.first_name)} ${esc(m.last_name ?? '')}</td><td>${esc(CLUB_ROLES[m.role_code] ?? m.role_name)}</td><td>${m.club_level ? esc(valueLabel('club_level', m.club_level) ?? m.club_level) : '—'}</td><td>${esc(dateOnly.format(new Date(m.start_date)))}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="admin-muted">Henüz üye yok.</p>') + '</section>').join('');
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
  const groups = MODULES.map(m => [m.title, m.tables.map(tableOf).filter(Boolean)]).filter(([, list]) => list.length);
  return heading('SİSTEM', 'Tüm <em>tablolar.</em>', 'Bütün kayıt türleri, bölümlerine göre. Birine girince kayıtlarını görür, yetkin varsa ekler ve düzenlersin; bir kayda girince ona bağlı bütün kayıtları görürsün.')
    + groups.map(([name, list]) => `<section class="admin-section"><h2 class="admin-h2">${esc(name)}</h2><div class="admin-tables">${list.map(t => `<a href="#veri/${t.name}" class="admin-table-card"><strong>${esc(label(t.name))}</strong><small>${t.columns.length} alan · ${t.write?.can_create ? 'ekleyebilirsin' : t.write?.can_update ? 'düzenleyebilirsin' : 'görüntüleme'}</small></a>`).join('')}</div></section>`).join('');
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
  return heading(esc(moduleOfTable(name)?.title ?? GROUPS[meta.group] ?? '').toLocaleUpperCase('tr'), esc(label(name)), `${data.total} kayıt`)
    + aboutTable(meta)
    + `<div class="admin-toolbar"><form id="data-search" class="admin-search" role="search"><label class="visually-hidden" for="data-q">Ara</label><input id="data-q" name="q" value="${esc(params.get('q') ?? '')}" placeholder="Metin alanlarında ara"><button class="shell-secondary" type="submit">Ara</button></form><a class="admin-chip" aria-pressed="${all}" href="${link({ tum: all ? null : '1', sayfa: null })}">${all ? 'Özet sütunlar' : 'Tüm sütunlar'}</a><a class="text-link" href="#veri">Tablolar ↗</a>${EXPORTS[name] && can(EXPORTS[name][0]) ? `<a class="text-link" href="${exportUrl(EXPORTS[name][1])}" download>Bu ayı indir (CSV) ↓</a>` : ''}${meta.write?.can_create ? `<a class="shell-primary admin-new" href="#yeni/${name}${prefill.size ? '?' + prefill : ''}">Yeni kayıt <span>+</span></a>` : ''}</div>`
    + (filters.length ? `<div class="admin-filters">${filters.map(([k, v]) => `<a class="admin-chip" aria-pressed="true" href="${link({ [k]: null, sayfa: null })}" aria-label="Filtreyi kaldır: ${esc(columnLabel(k))}">${filterLabel(k, v)} ✕</a>`).join('')}</div>` : '')
    + (data.items.length ? rowsTable(name, data.items, data.labels, data.people ? peopleColumn(columns, data.people) : data.wiring ? wiringColumn(columns, data.wiring) : columns) : empty('Kayıt bulunamadı.'))
    + (pages > 1 ? `<nav class="admin-pager" aria-label="Sayfalar">${page > 0 ? `<a class="shell-secondary" href="${link({ sayfa: page - 1 || null })}">← Önceki</a>` : ''}<span>${page + 1} / ${pages}</span>${page + 1 < pages ? `<a class="shell-secondary" href="${link({ sayfa: page + 1 })}">Sonraki →</a>` : ''}</nav>` : '')
;
}

async function record(name, id) {
  const meta = tableOf(name);
  if (!meta) return empty('Bu tabloyu görme yetkin yok ya da tablo yok.');
  const data = await api(`/admin/data/${name}/${encodeURIComponent(id)}`);
  const refTitle = meta.columns.filter(c => c.ref && !c.name.endsWith('_by_user_id')).map(c => data.labels?.[c.ref.table]?.[data.row[c.name]]).filter(Boolean).slice(0, 2).join(' · ');
  const title = meta.label.map(c => data.row[c]).filter(Boolean).join(' ') || refTitle || `${label(name)} kaydı`;
  const related = data.related.filter(r => r.total > 0);
  const emptyRelated = data.related.filter(r => r.total === 0);
  return heading(esc(label(name)).toLocaleUpperCase('tr'), esc(title))
    + recordBar(meta, data.row, id)
    + (name === 'events' && opsHref('etkinlik/' + id) ? `<div class="admin-actions admin-actions-top"><a class="shell-secondary" href="${esc(opsHref('etkinlik/' + id))}">Katılımcılar ve işlemler ↗</a></div>` : '')
    + (name === 'users' ? await rolePanel(id, data) + resetPanel(id) : '')
    + `<section class="admin-section"><dl class="admin-fields">${meta.columns.map(c => `<div><dt><b>${esc(columnLabel(c.name, c.name === meta.pk))}</b></dt><dd>${cell(name, c, data.row[c.name], data.labels, { full: true })}</dd></div>`).join('')}</dl></section>`
    + related.map(r => { const src = tableOf(r.table); return `<section class="admin-section"><div class="member-section-top"><h2 class="admin-h2">${esc(label(r.table))} <small>${refRole(r.column, meta.pk) ? `· ${esc(refRole(r.column, meta.pk))} olarak ` : ''}(${r.total})</small></h2><span class="admin-related-links">${src.write?.can_create && src.write.create_columns.includes(r.column) ? `<a class="text-link" href="#yeni/${r.table}?${encodeURIComponent(r.column)}=${encodeURIComponent(id)}">Ekle +</a>` : ''}${r.total > r.items.length ? `<a class="text-link" href="#veri/${r.table}?${encodeURIComponent(r.column)}=${encodeURIComponent(id)}">Tümünü gör ↗</a>` : ''}</span></div>${rowsTable(r.table, r.items, r.labels, summaryColumns(src, 5))}</section>`; }).join('')
    + (emptyRelated.length ? `<p class="admin-muted admin-empty-rel">Bağlı kaydı olmayanlar: ${[...new Set(emptyRelated.map(r => r.table))].map(t => { const w = tableOf(t)?.write; const col = emptyRelated.find(r => r.table === t && w?.create_columns.includes(r.column))?.column; return esc(label(t)) + (w?.can_create && col ? ` <a class="text-link" href="#yeni/${t}?${encodeURIComponent(col)}=${encodeURIComponent(id)}">ekle +</a>` : ''); }).join(', ')}</p>` : '');
}

// ---------- forms (create / edit) from the table documents ----------

// The table documents' purpose and rules were the build spec; the database and server enforce them, so staff only
// see how records of this table come about when it is not a plain form.
function aboutTable(meta) {
  const mode = { append_only: 'Bu tabloya yalnızca yeni kayıt eklenir; kayıtlar değiştirilmez.', read_only: 'Bu tablo yalnızca görüntülenir.', workflow_only: 'Bu kayıtlar kendi akışlarıyla oluşur (ör. üye işlemleri); buradan elle girilmez.' }[meta.write?.mode] ?? '';
  return mode ? `<p class="admin-muted admin-mode-note">${esc(mode)}</p>` : '';
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

const REF_LIMIT = 200;
/** Options for a reference field; past REF_LIMIT rows the form adds a search box that asks the server (?q=). */
async function refChoices(table, q = '') {
  const meta = tableOf(table);
  if (!meta) return null;
  const res = await api(`/admin/data/${table}?limit=${q ? 50 : REF_LIMIT}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const show = summaryColumns(meta, 3);
  const choices = res.items.map(r => {
    const text = meta.label.map(c => r[c]).filter(Boolean).join(' ')
      || show.map(c => c.ref ? res.labels?.[c.ref.table]?.[r[c.name]] : r[c.name]).filter(v => v != null && v !== '').map(String).join(' · ')
      || String(r[meta.pk]).slice(0, 8);
    return { id: String(r[meta.pk]), text: text + (r.status && r.status !== 'active' ? ` (${optionLabel(meta, 'status', r.status)})` : '') };
  });
  return Object.assign(choices, { total: res.total });
}
const choiceOptions = (choices, v, required) => `<option value="">${required ? '— seç —' : '— seçilmedi —'}</option>${v && !choices.some(c => c.id === String(v)) ? `<option value="${esc(v)}" selected>${esc(String(v).slice(0, 8))}</option>` : ''}${choices.map(c => `<option value="${esc(c.id)}"${String(v) === c.id ? ' selected' : ''}>${esc(c.text)}</option>`).join('')}`;
const CURRENCIES = ['TRY', 'EUR', 'USD'];
/** Allowed values of a column whose list depends on another field's current value (financial_categories.category_group). */
const dependentValues = (meta, col, row) => {
  const dep = meta.write?.dependent_options?.[col.name];
  return dep ? dep.options[row[dep.on]] ?? [...new Set(Object.values(dep.options).flat())] : null;
};

const localDateTime = v => { if (!v) return ''; const d = new Date(v); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function inputFor(meta, col, value, choices, { locked = false, required = false, allowed = null, row = {} } = {}) {
  const id = `f-${col.name}`, attrs = `id="${id}" name="${esc(col.name)}"${required ? ' required' : ''}${locked ? ' disabled' : ''}`;
  const v = value == null ? '' : value;
  const dependent = dependentValues(meta, col, row);
  if (dependent) {
    return `<select ${attrs} data-depends-on="${esc(meta.write.dependent_options[col.name].on)}"><option value="">— seç —</option>${dependent.map(o => `<option value="${esc(o)}"${String(v) === o ? ' selected' : ''}>${esc(optionLabel(meta, col.name, o))}</option>`).join('')}</select>`;
  }
  if (col.name === 'currency_code' && !col.options) {
    const list = v && !CURRENCIES.includes(String(v).trim()) ? [String(v).trim(), ...CURRENCIES] : CURRENCIES;
    return `<select ${attrs}>${col.nullable ? '<option value="">— seçilmedi —</option>' : ''}${list.map(c => `<option${String(v).trim() === c || (!v && !col.nullable && c === 'TRY') ? ' selected' : ''}>${c}</option>`).join('')}</select>`;
  }
  if (col.options) {
    const opts = allowed ? col.options.filter(o => allowed.includes(o)) : col.options;
    return `<select ${attrs}>${col.nullable || !required ? '<option value="">— seçilmedi —</option>' : ''}${opts.map(o => `<option value="${esc(o)}"${String(v) === o ? ' selected' : ''}>${esc(optionLabel(meta, col.name, o))}</option>`).join('')}</select>`;
  }
  if (col.ref && choices) {
    const search = choices.total > choices.length
      ? `<input type="search" class="admin-ref-search" data-ref-search="${esc(col.ref.table)}" data-for="${id}" placeholder="${choices.total} kayıt var; ara…" aria-label="${esc(columnLabel(col.name))} ara">` : '';
    return `${search}<select ${attrs}>${choiceOptions(choices, v, required)}</select>`;
  }
  if (col.type === 'boolean') {
    return col.nullable
      ? `<select ${attrs}><option value="">—</option><option value="true"${v === true ? ' selected' : ''}>Evet</option><option value="false"${v === false ? ' selected' : ''}>Hayır</option></select>`
      : `<label class="admin-check"><input type="checkbox" ${attrs}${v === true ? ' checked' : ''}> Evet</label>`;
  }
  if (col.type === 'date') return `<input type="date" ${attrs} value="${esc(String(v).slice(0, 10))}">`;
  if (col.type.startsWith('timestamp')) return `<input type="datetime-local" ${attrs} value="${esc(localDateTime(v))}">`;
  if (['integer', 'smallint', 'bigint'].includes(col.type)) return `<input type="number" step="1" ${attrs} value="${esc(v)}">`;
  if (['numeric', 'double precision', 'real'].includes(col.type)) return `<input inputmode="decimal" ${attrs} value="${esc(v)}" placeholder="0,00" data-decimal>`;
  if (/(^|_)email$/.test(col.name)) return `<input type="email" ${attrs} value="${esc(v)}">`;
  if (col.type === 'jsonb' || col.type === 'json') return `<textarea rows="4" ${attrs}>${esc(v === '' ? '' : JSON.stringify(v, null, 2))}</textarea>`;
  if (col.ref) return `<input ${attrs} value="${esc(v)}" placeholder="kayıt numarası (ID)"><small class="admin-help">${esc(label(col.ref.table))} tablosunu görme yetkin yok; kaydın numarasını (ID) yapıştırabilirsin.</small>`;
  if (LONG_TEXT.test(col.name)) return `<textarea rows="3" ${attrs}>${esc(v)}</textarea>`;
  return `<input ${attrs} value="${esc(v)}"${col.pattern ? ` data-pattern="${esc(col.pattern)}"` : ''}${/_code$/.test(col.name) && col.pattern ? ' autocapitalize="characters"' : ''}>`
    + (col.pattern && /^\^\[A-Z(0-9)?_\]/.test(col.pattern) ? `<small class="admin-help">Büyük harf${col.pattern.includes('0-9') ? ', rakam' : ''} ve _ (ör. YENI_KOD).</small>` : '');
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
    return `<div class="admin-field${locked ? ' admin-field-locked' : ''}" data-field="${esc(c.name)}"><label for="f-${esc(c.name)}">${esc(columnLabel(c.name))}${required(c) && !locked ? ' <span class="admin-req" aria-label="zorunlu">*</span>' : ''}${locked ? ' <span class="admin-muted">(değiştirilemez)</span>' : ''}</label>`
      + (locked ? `<div class="admin-locked-value">${cell(table, c, row[c.name], record?.labels, { full: true })}</div>` : inputFor(meta, c, row[c.name], c.ref ? choices[c.ref.table] : null, { required: required(c), allowed, row }))
      + (help ? `<small class="admin-help">${esc(help)}</small>` : '') + (w.derived?.[c.name] ? `<small class="admin-help">Hesaplama: ${esc(w.derived[c.name])}</small>` : '')
      + `<small class="admin-field-error" data-error-for="${esc(c.name)}" hidden></small></div>`;
  };
  const editable = shown.filter(c => names.includes(c.name)), fixed = shown.filter(c => !names.includes(c.name));
  return heading(esc(label(table)).toLocaleUpperCase('tr'), editing ? `${esc(meta.label.map(c => row[c]).filter(Boolean).join(' ') || label(table))} <em>düzenle.</em>` : `Yeni <em>kayıt.</em>`)
    + aboutTable(meta)
    + `<form id="record-form" class="admin-form admin-record-form" data-table="${table}" data-id="${esc(id ?? '')}" novalidate><div class="admin-form-grid">${editable.map(field).join('')}</div>`
    + `<p class="form-error" id="record-error" role="alert" hidden></p><div class="admin-actions"><button class="shell-primary" type="submit">${editing ? 'Değişiklikleri kaydet' : 'Kaydet'} <span>↗</span></button><a class="shell-secondary" href="${editing ? `#kayit/${table}/${esc(id)}` : `#veri/${table}`}">Vazgeç</a></div>`
    + (fixed.length ? `<details class="admin-about"><summary>Değiştirilemeyen alanlar (${fixed.length})</summary><div class="admin-form-grid">${fixed.map(field).join('')}</div></details>` : '')
    + '</form>';
}

function formValues(form, meta, editing, original) {
  const values = {};
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.disabled || el.closest('.admin-field')?.hidden) continue;
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

/** Shows, hides and requires fields by the table's conditional rules (transactions: the accounts follow the type). */
function formDynamics(form) {
  const meta = tableOf(form.dataset.table), rule = meta?.write?.conditional;
  if (!rule) return;
  const value = form.querySelector(`[name="${CSS.escape(rule.on)}"]`)?.value ?? '';
  const now = rule.cases[value] ?? {};
  const all = new Set(Object.values(rule.cases).flatMap(c => [...(c.hide ?? []), ...(c.require ?? [])]));
  for (const name of all) {
    const field = form.querySelector(`.admin-field[data-field="${CSS.escape(name)}"]`);
    if (!field || field.classList.contains('admin-field-locked')) continue;
    field.hidden = !!now.hide?.includes(name);
    const input = field.querySelector('[name]'), mark = field.querySelector('.admin-req');
    if (input && !input.dataset.required) input.dataset.required = input.required ? 'static' : 'no';
    const must = !!now.require?.includes(name) || input?.dataset.required === 'static';
    if (input) input.required = must;
    if (must && !mark) field.querySelector('label')?.insertAdjacentHTML('beforeend', ' <span class="admin-req" aria-label="zorunlu">*</span>');
    if (!must && mark) mark.remove();
  }
}

/** The checks the browser can make before asking the server: required, code formats, numbers, e-mail. */
function checkForm(form) {
  const errors = [];
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.disabled || el.closest('.admin-field')?.hidden || el.type === 'checkbox') continue;
    const v = el.value.trim();
    if (!v) { if (el.required) errors.push({ path: el.name, message: 'zorunlu' }); continue; }
    if (el.dataset.pattern && !new RegExp(el.dataset.pattern).test(v)) errors.push({ path: el.name, message: /^\^\[A-Z(0-9)?_\]/.test(el.dataset.pattern) ? `yalnızca büyük harf${el.dataset.pattern.includes('0-9') ? ', rakam' : ''} ve _ kullan` : 'biçimi geçersiz' });
    else if (el.hasAttribute('data-decimal') && !/^-?\d{1,14}([.,]\d{1,6})?$/.test(v)) errors.push({ path: el.name, message: 'sayı olmalı (ör. 12,50)' });
    else if (el.type === 'number' && !Number.isInteger(Number(v))) errors.push({ path: el.name, message: 'tam sayı olmalı' });
    else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push({ path: el.name, message: 'geçerli bir e-posta olmalı' });
  }
  return errors;
}

let refSearchTimer;
content.addEventListener('input', event => {
  const box = event.target.closest('[data-ref-search]'); if (!box) return;
  clearTimeout(refSearchTimer);
  refSearchTimer = setTimeout(async () => {
    const select = content.querySelector(`#${CSS.escape(box.dataset.for)}`); if (!select) return;
    const choices = await refChoices(box.dataset.refSearch, box.value.trim()).catch(() => null); if (!choices) return;
    const keep = select.value && !choices.some(c => c.id === select.value) ? [...select.options].find(o => o.value === select.value) : null;
    select.innerHTML = choiceOptions(choices, select.value, select.required);
    if (keep) { keep.selected = true; select.append(keep); }
    if (box.value.trim() && choices.length === 1) select.value = choices[0].id;
  }, 250);
});

content.addEventListener('change', event => {
  const form = event.target.closest('#record-form'); if (!form) return;
  const meta = tableOf(form.dataset.table);
  for (const dep of form.querySelectorAll(`[data-depends-on="${CSS.escape(event.target.name)}"]`)) {
    const col = meta.columns.find(c => c.name === dep.name);
    const values = dependentValues(meta, col, { [event.target.name]: event.target.value });
    const keep = values.includes(dep.value) ? dep.value : '';
    dep.innerHTML = `<option value="">— seç —</option>${values.map(o => `<option value="${esc(o)}"${o === keep ? ' selected' : ''}>${esc(optionLabel(meta, col.name, o))}</option>`).join('')}`;
  }
  if (event.target.name === meta?.write?.conditional?.on) formDynamics(form);
});

// ---------- door check (QR) ----------

const loginUrl = () => siteUrl(`uyelik/?giris&next=${encodeURIComponent(SHELL + '/' + location.hash)}`);
const tokenFrom = text => /(?:k=)?([0-9a-f]{64})/i.exec(String(text ?? ''))?.[1]?.toLowerCase() ?? null;

async function doorCheck(params) {
  const k = tokenFrom(params.get('k'));
  const form = `<form id="pass-form" class="admin-search admin-pass-form"><label class="visually-hidden" for="pass-input">QR bağlantısı ya da kod</label><input id="pass-input" name="code" placeholder="QR bağlantısını ya da kodu yapıştır" autocomplete="off"><button class="shell-secondary" type="submit">Kontrol et</button></form>`;
  const intro = heading('GİRİŞ KONTROL', 'Kapıda <em>QR kontrol.</em>', 'Katılımcının QR kodunu telefonunun kamerasıyla okut; açılan sayfada rezervasyonun bu seans için geçerli olup olmadığını görürsün. QR yalnızca kendi tarihindeki seans aralığında (başlangıçtan 15 dakika önce açılır) giriş verir.');
  if (!k) return intro + form;
  let data;
  try { data = await api(`/admin/pass?k=${k}`); }
  catch (err) { return intro + `<div class="admin-pass admin-pass-bad"><strong>${err?.status === 404 ? 'Geçersiz QR kodu.' : esc(err?.message ?? 'Kontrol edilemedi.')}</strong></div>` + form; }
  const { pass, verdict } = data;
  const tone = verdict.ok ? 'ok' : verdict.code === 'already_checked_in' ? 'done' : 'bad';
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(`${pass.date}T12:00:00+03:00`));
  return intro + `<div class="admin-pass admin-pass-${tone}"><span class="admin-pass-mark" aria-hidden="true">${tone === 'ok' ? '✓' : tone === 'done' ? '✓' : '✕'}</span>
    <div><strong>${esc(verdict.message)}</strong>
    <dl><div><dt>Etkinlik</dt><dd>${esc(pass.event_title)}</dd></div><div><dt>Tarih</dt><dd>${esc(date)}</dd></div><div><dt>Seans</dt><dd>${esc(pass.session)}</dd></div>
    <div><dt>Yer</dt><dd>${esc(pass.location)}${pass.seat ? ` · ${esc(pass.seat)}` : ''}</dd></div><div><dt>Kişi</dt><dd>${esc(pass.holder || '—')}</dd></div>
    <div><dt>Durum</dt><dd>${badge(pass.status, 'booking_status')}</dd></div></dl>
    ${verdict.ok ? `<button class="shell-primary admin-pass-go" data-pass-checkin="${k}">Girişi onayla <span>→</span></button>` : ''}
    <p class="admin-muted"><a class="text-link" href="#kayit/bookings/${esc(pass.id_booking)}">Rezervasyon kaydı ↗</a> · <a class="text-link" href="#etkinlik/${esc(pass.id_event)}">Etkinliğin katılımcıları ↗</a></p></div></div>` + form;
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

// ---------- cafeteria counter (host shell, cafeteria_sale.create) ----------

/** An amount as money, zero included (money() says Ücretsiz for prices). */
const tl = (amount, currency) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(amount ?? 0));

/** Line total as the server computes it: gross = round(qty × price, 2), plus tax on it. */
const lineTotal = (item, qty) => { const gross = Math.round(qty * Number(item.price) * 100) / 100; return gross + Math.round(gross * Number(item.tax_rate)) / 100; };
const timeOnly = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
let counter = null;

async function cafeteria() {
  counter = await api('/host/cafeteria');
  const { items, payment, today } = counter;
  const cur = items[0]?.currency_code ?? 'TRY';
  const total = today.reduce((s, r) => s + Number(r.grand_total), 0);
  const pay = [['cash', 'Nakit al', payment.cash], ['card', 'Kartla al', payment.card]];
  return heading('KAFETERYA', 'Kafeterya <em>satışı.</em>', 'Ürünlerin adedini seç, ödeme yöntemine bas. Fiş kesilir, ürün stoktan düşer, tutar kasaya ya da POS hesabına işlenir.')
    + (items.length ? `<form id="sale-form" class="sale-layout"><div class="sale-items">${items.map(i => `<label class="sale-item"><span><b>${esc(i.item_name)}</b><small>${esc(tl(lineTotal(i, 1), i.currency_code))} · KDV dahil${i.is_stock_tracked ? ` · stok ${esc(String(Number(i.current_stock ?? 0)))}` : ''}</small></span><input type="number" name="qty" data-item="${esc(i.id_item)}" min="0" max="1000" step="1" value="0" inputmode="numeric" aria-label="${esc(i.item_name)} adedi"></label>`).join('')}</div>`
      + `<aside class="sale-summary"><h2 class="admin-h2">Sepet</h2><div id="sale-lines" class="admin-muted">Henüz ürün seçilmedi.</div><p class="sale-total">Toplam <strong id="sale-total">${esc(tl(0, cur))}</strong></p>`
      + `<div class="admin-actions">${pay.map(([k, text, account]) => `<button class="${k === 'cash' ? 'shell-primary' : 'shell-secondary'}" type="submit" name="payment" value="${k}" ${account ? '' : 'disabled'} title="${esc(account ? `${account} hesabına işlenir` : 'Bu ödeme için aktif hesap yok')}">${text}</button>`).join('')}</div>`
      + (!payment.cash || !payment.card ? `<p class="admin-muted">${!payment.cash ? 'Kasa hesabı yok. ' : ''}${!payment.card ? 'Kart için POS ya da banka hesabı yok. ' : ''}Muhasebe Hesaplar sekmesinden açabilir.</p>` : '')
      + '</aside></form>'
      : empty('Satışta ürün yok.', 'Kafeterya merkezine bağlı, satılabilir ve fiyatı girilmiş ürünler burada görünür. Ürün ve hizmetler sekmesinden ekleyebilirsin.'))
    + `<section class="admin-section"><h2 class="admin-h2">Bugünkü satışlar <small>(${today.length} fiş · ${esc(tl(total, cur))})</small></h2>`
    + (today.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Saat</th><th scope="col">Fiş</th><th scope="col">Ürünler</th><th scope="col">Ödeme</th><th scope="col">Tutar</th></tr></thead><tbody>${today.map(r => `<tr><td>${esc(timeOnly.format(new Date(r.posted_at)))}</td><td><code>${esc(r.document_number)}</code></td><td>${esc(r.lines)}</td><td>${r.payment_method === 'cash' ? 'Nakit' : 'Kart'}</td><td>${esc(tl(r.grand_total, r.currency_code))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-muted">Bugün henüz satış yok.</p>')
    + '</section>';
}

// ---------- kitchen tabs (mutfak/): open tabs closed at the desk, and the QR labels the products carry ----------

const dayTime = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function kitchenTabs() {
  const { items } = await api('/host/kitchen/tabs');
  const intro = heading('MUTFAK', 'Açık <em>hesaplar.</em>', 'Mutfakta QR okutarak hesabına ürün ekleyen ve henüz ödemeyenler. Online ödeyemeyen ya da ödemeden çıkan birinin hesabını burada nakit veya kartla kapatabilirsin.');
  if (!items.length) return intro + empty('Açık hesap yok.', 'Mutfak sayfasında (fikirhane/mutfak) hesabına ürün ekleyen biri olduğunda burada görünür.');
  return intro + `<div class="kitchen-desk">${items.map(t => `<article class="admin-card kitchen-desk-tab"><header><h2 class="admin-h2">${esc([t.first_name, t.last_name].filter(Boolean).join(' '))}</h2><small>${esc(dayTime.format(new Date(t.created_at)))}${t.earlier ? ' · önceki gün' : ''}${t.locked ? ' · online ödeme sürüyor' : ''}</small></header>`
    + `<ul>${t.lines.map(l => `<li><span>${esc(l.description)} × ${l.quantity}</span><span>${esc(tl(l.line_total, t.currency_code))}</span></li>`).join('')}</ul>`
    + `<p class="sale-total">Toplam <strong>${esc(tl(t.grand_total, t.currency_code))}</strong></p>`
    + `<div class="admin-actions"><button class="shell-primary" data-close-tab="${esc(t.id_document)}" data-method="cash" ${t.locked ? 'disabled' : ''}>Nakit al</button><button class="shell-secondary" data-close-tab="${esc(t.id_document)}" data-method="card" ${t.locked ? 'disabled' : ''}>Kartla al</button></div></article>`).join('')}</div>`;
}
async function kitchenLabels() {
  const { items } = await api('/host/kitchen/labels');
  const intro = heading('MUTFAK', 'QR <em>etiketleri.</em>', 'Her ürünün etiketi: yazdır, kes ve ürünün ya da rafının üzerine yapıştır. Okutulan etiket ürünü kişinin hesabına ekler. QR yalnızca ürünü tanıtır: fiyat değişirse hesaba yine güncel fiyat yazılır, yalnızca etiketteki fiyat eskir.')
    + `<div class="admin-actions kitchen-print"><button class="shell-primary" data-print>Etiketleri yazdır</button></div>`;
  if (!items.length) return intro + empty('Satışta ürün yok.', 'Kafeterya merkezine bağlı, satılabilir ve fiyatı girilmiş ürünler burada görünür.');
  return intro + `<div class="kitchen-labels">${items.map(i => `<figure class="kitchen-label">${i.qr_svg}<figcaption><strong>${esc(i.item_name)}</strong><span>${esc(tl(i.price, i.currency_code))}</span><small>Okut, hesabına ekle · fikirhane mutfak</small></figcaption></figure>`).join('')}</div>`;
}

/** Keeps the basket and total in step with the quantities typed on the counter. */
function saleBasket(form) {
  const picked = [...form.querySelectorAll('input[name=qty]')].map(i => [counter.items.find(x => x.id_item === i.dataset.item), Math.max(0, Math.floor(Number(i.value) || 0))]).filter(([item, q]) => item && q > 0);
  const cur = counter.items[0]?.currency_code ?? 'TRY';
  form.querySelector('#sale-lines').innerHTML = picked.length ? picked.map(([item, q]) => `<div class="sale-line"><span>${esc(item.item_name)} × ${q}</span><span>${esc(tl(lineTotal(item, q), cur))}</span></div>`).join('') : 'Henüz ürün seçilmedi.';
  form.querySelector('#sale-total').textContent = tl(picked.reduce((s, [item, q]) => s + lineTotal(item, q), 0), cur);
  return picked;
}

// ---------- shortages (stock.view): what to buy before the counter runs out ----------

const UNITS = { piece: 'adet', kg: 'kg', gram: 'g', liter: 'L', ml: 'ml', pack: 'paket' };
const qty = (v, unit) => `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(Number(v))} ${UNITS[unit] ?? unit ?? ''}`.trim();

async function shortages() {
  const { items, without_level } = await api('/admin/stock/shortages');
  const receive = can('stock.receive');
  return heading('STOK', 'Azalan <em>ürünler.</em>', 'Stoğu yeniden sipariş seviyesine inen ürünler. “Alınacak”, hedef stoğa dönmek için gereken miktar; hedef yoksa sipariş seviyesine göre hesaplanır.')
    + (items.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Ürün</th><th scope="col">Mevcut</th><th scope="col">Sipariş seviyesi</th><th scope="col">Hedef</th><th scope="col">Alınacak</th><th scope="col">Depo</th><th scope="col"><span class="visually-hidden">İşlemler</span></th></tr></thead><tbody>${items.map(i => `<tr><td><a href="#kayit/items/${esc(i.id_item)}"><b>${esc(i.item_name)}</b></a></td><td>${Number(i.current_stock) <= 0 ? `<span class="admin-status" data-status="cancelled">Bitti</span>` : esc(qty(i.current_stock, i.unit))}</td><td>${esc(qty(i.reorder_level, i.unit))}</td><td>${i.target_stock ? esc(qty(i.target_stock, i.unit)) : '—'}</td><td><b>${esc(qty(i.to_buy, i.unit))}</b></td><td>${esc(i.storage_area ?? '—')}</td><td>${receive ? `<a class="text-link" href="#yeni/stock_movements?${new URLSearchParams({ id_item: i.id_item, movement_type: 'purchase_receive', quantity: Number(i.to_buy) || '' })}">Stok girişi ↗</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Eksik ürün yok.', 'Bütün ürünler sipariş seviyesinin üstünde.'))
    + (without_level ? `<p class="admin-muted">${without_level} stoklu üründe sipariş seviyesi tanımlı değil; bu ürünler listeye giremez. <a class="text-link" href="#veri/items?reorder_level=">Ürünleri gör ↗</a></p>` : '');
}

// ---------- finance reports (report.view; exports need report.export / document.export / transaction.export) ----------

const EXPORTS = { documents: ['document.export', 'export/documents.csv'], transactions: ['transaction.export', 'export/transactions.csv'] };
const exportUrl = (path, p = {}) => `${API_BASE}/admin/${path}${new URLSearchParams(p).size ? '?' + new URLSearchParams(p) : ''}`;
const isoDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
function presetPeriods() {
  const [y, m] = isoDay(new Date()).split('-').map(Number);
  const pad = n => String(n).padStart(2, '0'), end = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return [['Bu ay', `${y}-${pad(m)}-01`, `${y}-${pad(m)}-${end(y, m)}`], ['Geçen ay', `${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${end(py, pm)}`], ['Bu yıl', `${y}-01-01`, `${y}-12-31`]];
}

async function reports(params) {
  if (!can('report.view')) return empty('Bu bölüm için yetkin yok.');
  const q = {}; for (const k of ['from', 'to']) if (/^\d{4}-\d{2}-\d{2}$/.test(params.get(k) ?? '')) q[k] = params.get(k);
  const r = await api(`/admin/reports/finance${Object.keys(q).length ? '?' + new URLSearchParams(q) : ''}`);
  const { from, to } = r.period, amount = (v, c = 'TRY') => Number(v) === 0 ? '—' : esc(tl(v, c));
  const table = (head, rows) => rows.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="admin-muted">Bu dönemde kayıt yok.</p>';
  const downloads = [['report.export', 'reports/finance.csv', 'Raporu indir'], ['document.export', 'export/documents.csv', 'Belgeleri indir'], ['transaction.export', 'export/transactions.csv', 'Para hareketlerini indir']]
    .filter(([perm]) => can(perm)).map(([, path, text]) => `<a class="text-link" href="${exportUrl(path, { from, to })}" download>${text} (CSV) ↓</a>`).join('');
  return heading('FİNANS', 'Dönem <em>raporu.</em>', 'Kesinleşmiş belgeler (vergi hariç tutarlar) ve kesinleşmiş para hareketleri. Belge, belge tarihine; para hareketi, gerçekleştiği güne sayılır.')
    + `<div class="admin-toolbar"><form id="report-form" class="admin-search"><label class="visually-hidden" for="report-from">Başlangıç</label><input id="report-from" name="from" type="date" value="${esc(from)}" required><label class="visually-hidden" for="report-to">Bitiş</label><input id="report-to" name="to" type="date" value="${esc(to)}" required><button class="shell-secondary" type="submit">Göster</button></form>`
    + presetPeriods().map(([text, f, t]) => `<a class="admin-chip" aria-pressed="${f === from && t === to}" href="#raporlar?from=${f}&to=${t}">${text}</a>`).join('') + '</div>'
    + (downloads ? `<div class="report-downloads">${downloads}</div>` : '')
    + `<div class="admin-stats report-totals"><div><strong>${amount(r.totals.income)}</strong><span>Gelir</span></div><div><strong>${amount(r.totals.expense)}</strong><span>Gider</span></div><div><strong>${amount(r.totals.net)}</strong><span>Net</span></div></div>`
    + `<section class="admin-section"><h2 class="admin-h2">Finans merkezleri</h2>${table(['Merkez', 'Gelir', 'Gider', 'Net'], r.centers.map(c => [esc(c.name), amount(c.income), amount(c.expense), amount(Number(c.income) - Number(c.expense))]))}</section>`
    + `<section class="admin-section"><h2 class="admin-h2">Kategoriler</h2>${table(['Kategori', 'Yön', 'Tutar', 'Vergi'], r.categories.map(c => [esc(c.name), c.direction === 'income' ? 'Gelir' : 'Gider', amount(c.amount), amount(c.tax)]))}</section>`
    + `<section class="admin-section"><h2 class="admin-h2">Hesap hareketleri</h2>${table(['Hesap', 'Giriş', 'Çıkış', 'Net'], r.cash.map(c => [esc(c.name), amount(c.money_in, c.currency_code), amount(c.money_out, c.currency_code), amount(Number(c.money_in) - Number(c.money_out), c.currency_code)]))}</section>`
    + (r.balances ? `<section class="admin-section"><h2 class="admin-h2">Hesap bakiyeleri <small>(bugün)</small></h2>${table(['Hesap', 'Bakiye', 'Mutabık bakiye', 'Mutabakat bekleyen'], r.balances.map(b => [esc(b.name), esc(tl(b.balance, b.currency_code)), esc(tl(b.reconciled, b.currency_code)), b.open_count ? `<a class="text-link" href="#veri/transactions?status=posted&reconciliation_status=unreconciled">${b.open_count} hareket ↗</a>` : '—']))}</section>` : '');
}

async function render() {
  const id = ++renderId;
  const { view, a, b, params } = route();
  if (view === 'm' && a) {
    const first = moduleTabs(MODULES.find(m => m.key === a) ?? { tables: [] })[0];
    if (first) { location.replace(first.href); return; }
  }
  if (SHELL === 'admin' && HOST_VIEWS.includes(view)) {
    const there = opsHref(location.hash.slice(1));
    if (there) { location.replace(there); return; }
    content.innerHTML = empty('Bu ekran host panelinde.', 'Program, kapıda giriş ve başvurular günlük işlerdir; bu hesabın host paneline erişimi yok.');
    return;
  }
  // A table outside the host areas belongs to the back office: open it there when this account has it.
  if (SHELL === 'host' && (['veri', 'kayit', 'yeni', 'duzenle'].includes(view) && (!a || !hostTables.has(a))) && hasShell('admin')) {
    location.replace(siteUrl('admin/' + location.hash)); return;
  }
  const [nav, tab] = placeOf(view, a);
  window.dispatchEvent(new CustomEvent('fikirhane-nav', { detail: { href: nav === 'genel' ? `${SHELL}/#genel` : `${SHELL}/#m/${nav}` } }));
  content.setAttribute('aria-busy', 'true');
  try {
    const html = view === 'basvurular' ? await applications(params)
      : view === 'etkinlikler' ? await eventList(params, a)
      : view === 'etkinlik' && a ? await eventDetail(a)
      : view === 'yeni-etkinlik' ? await newEvent()
      : view === 'veri' && a ? await dataTable(a, params)
      : view === 'veri' ? dataIndex()
      : view === 'kontrol' ? await doorCheck(params)
      : view === 'turlar' && SHELL === 'host' ? await tours(params)
      : view === 'satis' && SHELL === 'host' ? await cafeteria()
      : view === 'hesaplar' && SHELL === 'host' ? await kitchenTabs()
      : view === 'etiketler' && SHELL === 'host' ? await kitchenLabels()
      : view === 'raporlar' ? await reports(params)
      : view === 'eksikler' ? await shortages()
      : view === 'kuluplerim' && SHELL === 'host' ? await myClubs()
      : view === 'etkinliklerim' && SHELL === 'host' ? await myEvents()
      : view === 'kayit' && a && b ? await record(a, b)
      : view === 'yeni' && a ? await formView(a, null, params)
      : view === 'duzenle' && a && b ? await formView(a, b, params)
      : await overview();
    if (id !== renderId) return;
    content.innerHTML = (nav !== 'genel' ? tabBar(nav, tab) : '') + html;
    const recordForm = content.querySelector('#record-form'); if (recordForm) formDynamics(recordForm);
    document.title = `${content.querySelector('h1')?.textContent ?? SHELL_NAME} · Fikirhane ${SHELL_NAME.toLocaleLowerCase('tr')}`;
  } catch (err) {
    if (id !== renderId) return;
    if (err?.status === 401) { location.replace(loginUrl()); return; }
    content.innerHTML = empty(err?.status === 403 ? 'Bu bölüm için yetkin yok.' : err?.status === 404 ? 'Kayıt bulunamadı.' : 'Bu sayfa yüklenemedi.', esc(err?.message ?? ''));
  } finally { if (id === renderId) content.removeAttribute('aria-busy'); }
}

async function run(task, success) {
  if (busy) return; busy = true;
  try { await task(); if (success) flash(success); await render(); }
  catch (err) { if (err?.status === 401) { location.replace(loginUrl()); return; } flash(err?.message || 'İşlem tamamlanamadı.'); }
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
  if (t.hasAttribute('data-switch-account')) { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); location.assign(loginUrl()); return; }
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
  if (t.hasAttribute('data-print')) { window.print(); return; }
  if (t.dataset.closeTab) {
    const method = t.dataset.method;
    run(async () => {
      const r = await api(`/host/kitchen/tabs/${t.dataset.closeTab}/close`, { method: 'POST', body: { payment_method: method } });
      flash(`Hesap kapatıldı: ${r.document_number} · ${tl(r.grand_total, r.currency_code)} (${r.account}).`);
    });
    return;
  }
  if (t.dataset.tourStatus) {
    const label = TOUR_NEXT.find(([s]) => s === t.dataset.tourStatus)?.[1] ?? '';
    const note = await ask({ title: label, copy: 'Talebin durumu değişir; istersen ekip için kısa bir not bırak.', input: 'Not (isteğe bağlı)', ok: 'Kaydet' });
    if (note === null) return;
    run(() => api(`/host/tours/${t.dataset.tour}`, { method: 'PATCH', body: { status: t.dataset.tourStatus, ...(note ? { staff_note: note } : {}) } }), 'Kaydedildi.');
    return;
  }
  if (t.dataset.passCheckin) { run(() => api('/admin/pass/checkin', { method: 'POST', body: { k: t.dataset.passCheckin } }), 'Giriş onaylandı.'); return; }
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
    const problems = checkForm(form);
    if (problems.length) { showFieldErrors(form, problems); error.textContent = 'İşaretli alanları kontrol eder misin?'; error.hidden = false; return; }
    values = formValues(form, meta, !!id, original);
  } catch (err) { showFieldErrors(form, err.field ? [{ path: err.field, message: err.message }] : []); error.textContent = err.message; error.hidden = false; return; }
  if (id && !Object.keys(values).length) { flash('Değişiklik yok.'); location.hash = `kayit/${table}/${id}`; return; }
  busy = true; form.querySelector('[type=submit]').disabled = true;
  try {
    const res = await api(`/admin/data/${table}${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body: { values } });
    flash(id ? 'Değişiklikler kaydedildi.' : 'Kayıt oluşturuldu.');
    location.hash = `kayit/${table}/${res.id}`;
  } catch (err) {
    if (err?.status === 401) { location.replace(loginUrl()); return; }
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
  if (form.id === 'report-form') { const f = new FormData(form); location.hash = `raporlar?${new URLSearchParams({ from: f.get('from'), to: f.get('to') })}`; return; }
  if (form.id === 'sale-form') {
    const picked = saleBasket(form), method = event.submitter?.value;
    if (!picked.length) { flash('Önce en az bir ürün seç.'); return; }
    run(async () => {
      const r = await api('/host/cafeteria/sales', { method: 'POST', body: { payment_method: method, lines: picked.map(([item, quantity]) => ({ id_item: item.id_item, quantity })) } });
      flash(`Satış kaydedildi: ${r.document_number} · ${tl(r.grand_total, r.currency_code)} (${r.account}).`);
    });
    return;
  }
  if (form.id === 'pass-form') { const k = tokenFrom(new FormData(form).get('code')); if (!k) { flash('QR bağlantısında geçerli bir kod yok.'); return; } location.hash = `kontrol?k=${k}`; return; }
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

content.addEventListener('input', event => { if (event.target.name === 'qty') saleBasket(event.target.form); });

content.addEventListener('change', event => {
  if (event.target.name !== 'setup') return;
  const capacity = event.target.selectedOptions[0]?.dataset.capacity;
  const input = content.querySelector('input[name=capacity]');
  if (capacity && input) { input.max = capacity; if (!input.value || Number(input.value) > Number(capacity)) input.value = capacity; }
});

window.addEventListener('hashchange', () => { render().then(() => document.querySelector('#admin-main').focus({ preventScroll: true })); window.scrollTo({ top: 0 }); });

async function start() {
  const loading = document.querySelector('#admin-loading p');
  if (!await apiAvailable()) { loading.innerHTML = `${SHELL_NAME} yalnızca sunucuya bağlıyken çalışır. <a class="text-link" href="../">Keşif sayfasına dön ↗</a>`; return; }
  try { me = await api('/me'); } catch (err) { if (err.status === 401) { location.replace(loginUrl()); return; } throw err; }
  if (!hasShell(SHELL)) {
    const elsewhere = [['host', 'host/', 'Host paneline geç'], ['admin', 'admin/', 'Yönetime geç']].filter(([s]) => s !== SHELL && hasShell(s))
      .map(([, href, text]) => `<a class="text-link" href="${siteUrl(href)}">${text} ↗</a>`).join(' ');
    loading.innerHTML = `<b>${esc(me.user.email ?? me.user.first_name)}</b> hesabıyla giriş yaptın; bu hesap ${SHELL === 'host' ? 'host paneline' : 'yönetime'} giremiyor.<br><button class="shell-primary admin-switch" data-switch-account>Başka bir hesapla giriş yap <span>↗</span></button> ${elsewhere} <a class="text-link" href="${siteUrl('member/')}">Üye alanına dön ↗</a>`;
    return;
  }
  // Club leads and event hosts have no back-office permissions: the schema is refused and they work from their scope.
  let schema = { permissions: me.permissions, tables: [] };
  try { schema = await api('/admin/schema'); } catch (err) { if (err.status !== 403) throw err; }
  if (SHELL === 'host') scope = await api('/host/scope');
  perms = new Set(schema.permissions); tables = schema.tables;
  document.querySelector('#header-name').textContent = me.user.first_name;
  document.querySelector('#header-initial').textContent = me.user.first_name[0].toLocaleUpperCase('tr');
  window.dispatchEvent(new CustomEvent('fikirhane-menu', { detail: [[`${SHELL}/#genel`, SHELL === 'host' ? 'Bugün' : 'Genel bakış'],
    ...visibleModules().map(m => [`${SHELL}/#m/${m.key}`, m.title])] }));
  document.querySelector('#admin-loading').hidden = true;
  document.querySelector('#admin-shell').hidden = false;
  await render();
}
start().catch(() => { document.querySelector('#admin-loading p').textContent = `${SHELL_NAME} şu anda yüklenemedi. Biraz sonra tekrar dener misin?`; });
