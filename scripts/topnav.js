// One top menu beside the logo on every page, over the site's four shells: visitor (the public site), member, host and
// admin. The current shell's links are inline; one Hesabım drop-down holds the other shells this account may open (from
// /me's `shells`) and the account. When the links do not fit beside the logo — on phones, or a wide staff menu with large
// text — everything folds under ☰. Pages announce their current place with a 'fikirhane-nav' event, and the host and
// admin shells publish their own areas with 'fikirhane-menu'.
import { escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';

const base = new URL('../', import.meta.url);
const url = path => new URL(path, base).href;
const path = location.pathname.replace(new URL('.', base).pathname, '/');
const area = path.startsWith('/admin') ? 'admin' : path.startsWith('/host') ? 'host' : path.startsWith('/member') ? 'member' : 'site';
const onHome = path === '/' || path === '/index.html';

const SITE = onHome
  ? [['#kulupler', 'Kulüpler'], ['#takvim', 'Buluşma takvimi'], ['#mekan', 'Mekân & topluluk'], [url('rezervasyon/'), 'Rezervasyon']]
  : [[url(''), 'Keşfet'], [url('rezervasyon/'), 'Rezervasyon']];
const MEMBER = [['member/#anasayfa', 'Ana sayfam'], ['member/#kesfet', 'Kulüpleri keşfet'], ['member/#kuluplerim', 'Kulüplerim'],
  ['member/#bulusmalar', 'Buluşmalar'], ['rezervasyon/', 'Rezervasyon yap']].map(([h, t]) => [url(h), t]);
const HOST = [['host/#genel', 'Bugün'], ['host/#etkinlikler', 'Program'], ['host/#kontrol', 'Giriş kontrol']].map(([h, t]) => [url(h), t]);
const ADMIN = [['admin/#genel', 'Genel bakış'], ['admin/#veri', 'Tüm tablolar']].map(([h, t]) => [url(h), t]);
const ACCOUNT = [[url('member/#profil'), 'Profilim'], [url('member/#bulusmalar'), 'Rezervasyonlarım']];
const SHELLS = [['site', url(''), 'Keşfet'], ['member', url('member/#anasayfa'), 'Üye alanım'], ['host', url('host/#genel'), 'Host paneli'],
  ['admin', url('admin/#genel'), 'Yönetim']];

const header = document.querySelector('header');
const brand = header?.querySelector('.brand');
let nav = document.querySelector('#topnav');
if (header && !nav) {
  nav = Object.assign(document.createElement('nav'), { id: 'topnav', className: 'topnav' });
  nav.setAttribute('aria-label', 'Ana menü');
  brand ? brand.after(nav) : header.prepend(nav);
}
const toggle = Object.assign(document.createElement('button'), { className: 'topnav-toggle', type: 'button', textContent: '☰' });
toggle.setAttribute('aria-label', 'Menüyü aç'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'topnav');
header?.append(toggle);

let current = null, me = null, published = null;
const links = list => list.map(([href, text]) => `<a href="${esc(href)}">${esc(text)}</a>`).join('');

function draw() {
  if (!nav) return;
  const shells = me?.shells ?? [];
  const primary = published ?? { admin: ADMIN, host: HOST, member: MEMBER }[area] ?? SITE;
  const elsewhere = SHELLS.filter(([s]) => s !== area && (s === 'site' || s === 'member' || shells.includes(s)));
  nav.innerHTML = `<div class="topnav-main">${links(primary)}</div>`
    + (me ? `<details class="topnav-more topnav-account"><summary>Hesabım</summary><div>`
        + (elsewhere.length ? `<span class="topnav-group">Geç</span>${links(elsewhere.map(([, h, t]) => [h, t]))}<span class="topnav-group">Hesap</span>` : '')
        + `${links(ACCOUNT)}<button type="button" data-topnav-signout>Çıkış yap</button></div></details>`
      : area !== 'site' || !document.querySelector('[data-member-entry]') ? `<a class="topnav-login" href="${esc(url('uyelik/?giris'))}">Giriş yap</a>` : '');
  mark();
  fit();
}

/** Folds the menu under ☰ whenever its links do not fit beside the logo, at any width. */
const folded = window.matchMedia('(max-width:1180px)');
function fit() {
  if (!header || !nav || nav.classList.contains('open')) return;
  header.classList.remove('topnav-compact');
  if (folded.matches) return;
  const main = nav.querySelector('.topnav-main');
  const overflow = header.scrollWidth > header.clientWidth + 1 || nav.scrollWidth > nav.clientWidth + 1 || (main && main.scrollWidth > main.clientWidth + 1);
  header.classList.toggle('topnav-compact', overflow);
}
let fitFrame = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fit); });
document.fonts?.ready.then(fit);

/** Highlights the link of the current place: the page's own hint, else the exact address. */
function mark() {
  if (!nav) return;
  const here = current ? url(current) : location.origin + location.pathname + location.hash.split('?')[0];
  nav.querySelectorAll('a').forEach(a => {
    const on = a.href === here || (!current && !a.hash && a.href === location.origin + location.pathname);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  nav.querySelectorAll('.topnav-more:not(.topnav-account)').forEach(d => d.classList.toggle('has-current', !!d.querySelector('[aria-current]')));
}

window.addEventListener('fikirhane-nav', e => { current = e.detail?.href ?? null; mark(); });
window.addEventListener('fikirhane-menu', e => { published = e.detail.map(([h, t]) => [url(h), t]); draw(); });
window.addEventListener('hashchange', () => { if (!current) mark(); close(); });
function close() { nav?.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Menüyü aç'); nav?.querySelectorAll('details[open]').forEach(d => d.open = false); }
toggle.addEventListener('click', () => { const open = !nav.classList.contains('open'); nav.classList.toggle('open', open); nav.querySelectorAll('details').forEach(d => d.open = open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç'); });
document.addEventListener('click', e => {
  if (e.target.closest('[data-topnav-signout]')) {
    api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}).finally(() => location.assign(url('')));
    return;
  }
  if (e.target.closest('#topnav a')) { close(); return; }
  if (!nav?.classList.contains('open')) nav?.querySelectorAll('details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

draw();
(async () => {
  if (!await apiAvailable()) return;
  try { me = await api('/me'); draw(); } catch {}
})();
