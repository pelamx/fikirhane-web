// One top menu beside the logo on every page, over the site's four shells: visitor (the public site), member, host and
// admin. The current shell's links are inline; the other shells this account may open (from /me's `shells`) and the
// account are drop-downs; everything sits under ☰ on phones. Pages announce their current place with a 'fikirhane-nav'
// event, and the host and admin shells publish their own areas with 'fikirhane-menu'.
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
const dropdown = (label, list, extra = '') => `<details class="topnav-more${extra ? ' topnav-account' : ''}"><summary>${esc(label)}</summary><div>${links(list)}${extra}</div></details>`;

function draw() {
  if (!nav) return;
  const shells = me?.shells ?? [];
  const primary = published ?? { admin: ADMIN, host: HOST, member: MEMBER }[area] ?? SITE;
  nav.innerHTML = `<div class="topnav-main">${links(primary)}</div>`
    + (me && area !== 'member' ? dropdown('Üye alanı', MEMBER) : '')
    + (shells.includes('host') && area !== 'host' ? dropdown('Host paneli', HOST) : '')
    + (shells.includes('admin') && area !== 'admin' ? dropdown('Yönetim', ADMIN) : '')
    + (me ? dropdown('Hesabım', ACCOUNT, '<button type="button" data-topnav-signout>Çıkış yap</button>')
      : area !== 'site' || !document.querySelector('[data-member-entry]') ? `<a class="topnav-login" href="${esc(url('uyelik/?giris'))}">Giriş yap</a>` : '');
  mark();
}

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
