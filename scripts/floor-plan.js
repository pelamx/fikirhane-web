// Coworking floor plans (coworking/): the named areas on both plans open their description in a side card (desktop) or a
// bottom sheet (phones). Names, texts and plan positions all live in AREAS; x/y are percentages of the plan image, and
// zone is the area's outline (percent points) tinted while it is selected.
import { escapeHTML as esc } from './shared.js';

const FLOORS = { giris: 'Giriş katı', cati: 'Çatı katı' };

export const AREAS = [
  { id: 'fikirhane', name: 'Fikirhane', plan: 'giris', x: 20, y: 48.9,
    text: 'İnsanların tanıştığı, fikirlerini paylaştığı ve yeni iş birlikleri geliştirdiği buluşma alanı. Diğer üyelerle sohbet etmek ve profesyonel çevreni genişletmek için bir araya gel.',
    zone: [[0.8, 2.3], [30.6, 2.3], [30.6, 95.7], [6.8, 95.7]] },
  { id: 'atolye', name: 'Atölye', plan: 'giris', x: 79.1, y: 90.5,
    text: 'Atölye, daha çok sessiz ve odaklı çalışma alanımız.',
    zone: [[61.1, 48.9], [93.1, 48.2], [96.6, 96.8], [61.1, 96.2]] },
  { id: 'demhane', name: 'Demhane', plan: 'giris', x: 45.9, y: 25.2,
    text: 'Mutfak ve çay, kahve gibi içecek makinelerinin bulunduğu bölge.',
    zone: [[31.3, 5], [60.6, 5], [60.6, 78.2], [54.9, 78.2], [54.9, 48.2], [31.3, 48.2]] },
  { id: 'kapsul', name: 'Kapsül', plan: 'giris', x: 85.3, y: 25.2,
    text: 'Görüşmelerin yapılacağı 4 kişilik toplantı odası.',
    link: { href: '../toplanti-odasi/#kapsul', label: 'Kapsül' },
    zone: [[79.4, 3.2], [90, 2.7], [91.9, 45.5], [81.6, 45.5]] },
  { id: 'ateshane', name: 'Ateşhane', plan: 'giris', x: 99.4, y: 50, side: 'right',
    text: 'Sigara içme alanı olarak kullanılabilecek balkon.',
    zone: [[92.6, 34.2], [98.6, 32.9], [99.3, 63.1], [94.9, 67.6], [93.8, 50]] },
  { id: 'studio', name: 'Studio', plan: 'cati', x: 54.6, y: 38.9,
    text: 'Hem toplantıların hem de özel etkinliklerin yapılabileceği alan.',
    link: { href: '../toplanti-odasi/#studio', label: 'Studio' },
    zone: [[33.5, 1.7], [50.4, 0.8], [51.1, 30.8], [72.1, 30.8], [72.1, 76.6], [99.4, 77.5], [99.6, 94.9], [39.1, 94.5]] },
  { id: 'seyirhane', name: 'Seyirhane', plan: 'cati', x: 18.9, y: 49.6,
    text: '180 derece Boğaz manzaralı terasımız.',
    zone: [[0.4, 7], [32.8, 1.1], [39.1, 94.9], [11.9, 98.3]] },
];

const root = document.querySelector('[data-floors]');
const panel = root.querySelector('#area-panel');
const backdrop = root.querySelector('.area-backdrop');
const title = panel.querySelector('#area-title');
const sheet = matchMedia('(max-width: 1199px)');
const byId = Object.fromEntries(AREAS.map(a => [a.id, a]));
let opener = null, lockedAt = null;

const trigger = (a, attrs, inner) =>
  `<button type="button" ${attrs} data-area="${a.id}" aria-haspopup="dialog" aria-controls="area-panel" aria-expanded="false">${inner}</button>`;
const plus = '<span class="area-plus" aria-hidden="true">+</span>';

for (const map of root.querySelectorAll('.floor-map[data-plan]')) {
  map.insertAdjacentHTML('beforeend', AREAS.filter(a => a.plan === map.dataset.plan).map(a => {
    const at = `left:${a.x}%;top:${a.y}%`;
    const zone = `<span class="area-zone" data-zone="${a.id}" style="clip-path:polygon(${a.zone.map(([x, y]) => `${x}% ${y}%`).join(',')})"></span>`;
    return zone + trigger(a, `class="area-label${a.side ? ' on-' + a.side : ''}" style="${at}"`, `<span class="area-tag">${esc(a.name)}${plus}</span>`);
  }).join(''));
}
const list = root.querySelector('[data-area-list]');
list.innerHTML = AREAS.map(a =>
  `<li>${trigger(a, 'class="area-chip"', `<span><strong>${esc(a.name)}</strong><small>${FLOORS[a.plan]}</small></span>${plus}`)}</li>`).join('');
list.closest('.area-explore').hidden = false;

function lock(on) {
  if (on && lockedAt === null) {
    lockedAt = scrollY;
    Object.assign(document.body.style, { position: 'fixed', top: `-${lockedAt}px`, left: '0', right: '0' });
  } else if (!on && lockedAt !== null) {
    Object.assign(document.body.style, { position: '', top: '', left: '', right: '' });
    scrollTo({ top: lockedAt, behavior: 'instant' });
    lockedAt = null;
  }
}

function mode() {
  const modal = sheet.matches && !panel.hidden;
  panel.setAttribute('aria-modal', String(modal));
  backdrop.hidden = !modal;
  lock(modal);
}

// On phones the plans scroll sideways: bring the selected area's label into view.
function reveal(id) {
  for (const label of root.querySelectorAll(`.floor-map [data-area="${id}"]`)) {
    const box = label.closest('.floor-scroll'), r = label.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.left < b.left || r.right > b.right)
      box.scrollBy({ left: r.left + r.width / 2 - (b.left + b.width / 2), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
}

function open(id, from) {
  const a = byId[id];
  opener = from;
  panel.querySelector('#area-floor').textContent = FLOORS[a.plan];
  title.textContent = a.name;
  panel.querySelector('#area-text').innerHTML = `<p>${esc(a.text)}</p>`
    + (a.link ? `<a class="text-link" href="${a.link.href}">${esc(a.link.label)} sayfası <span aria-hidden="true">↗</span></a>` : '');
  for (const el of root.querySelectorAll('[data-area]')) el.setAttribute('aria-expanded', String(el.dataset.area === id));
  for (const el of root.querySelectorAll('[data-zone]')) el.classList.toggle('is-active', el.dataset.zone === id);
  root.classList.add('has-area');
  reveal(id);
  panel.hidden = false;
  mode();
  title.focus({ preventScroll: !sheet.matches });
}

function close(returnFocus = true) {
  if (panel.hidden) return;
  panel.hidden = true;
  for (const el of root.querySelectorAll('[data-area]')) el.setAttribute('aria-expanded', 'false');
  for (const el of root.querySelectorAll('[data-zone]')) el.classList.remove('is-active');
  root.classList.remove('has-area');
  mode();
  if (returnFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}

root.addEventListener('click', e => {
  const t = e.target.closest('[data-area]');
  if (t) open(t.dataset.area, t);
});
panel.querySelector('.area-close').addEventListener('click', () => close());
// A tap on the dimmed page switches to the area label under it, anywhere else closes the sheet.
backdrop.addEventListener('click', e => {
  const t = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest('[data-area]')).find(Boolean);
  if (t) open(t.dataset.area, t); else close();
});
document.addEventListener('click', e => {
  if (panel.hidden || panel.contains(e.target) || e.target.closest('[data-area]') || e.target === backdrop) return;
  close(!e.target.closest('a,button,input,select,textarea,[tabindex]'));
});
document.addEventListener('keydown', e => {
  if (panel.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key !== 'Tab' || panel.getAttribute('aria-modal') !== 'true') return;
  // The sheet is modal: Tab cycles inside it.
  const items = [...panel.querySelectorAll('a[href],button')];
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
sheet.addEventListener('change', mode);
