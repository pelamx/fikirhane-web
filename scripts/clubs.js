// Kulüpler (kulupler/): the public clubs page. Theme, menu and join links come from space.js; with the API, each club also
// lists its next meetings (linking into the reservation flow) and says when the signed-in member is already in it.
import './space.js';
import { escapeHTML as esc } from './shared.js';
import { ready, mode, getCatalog, getSession, siteUrl } from './session.js';

const day = start => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(start));

function render() {
  if (mode() !== 'api') return;
  const { clubs, events } = getCatalog();
  const session = getSession();
  for (const box of document.querySelectorAll('[data-club-code]')) {
    const club = clubs.find(c => c.code === box.dataset.clubCode);
    if (!club) continue;
    const next = events.filter(e => e.clubId === club.id).slice(0, 3);
    box.querySelector('ul').innerHTML = next.map(e => `<li><a href="${esc(siteUrl(`rezervasyon/?tarih=${day(e.start)}&seans=${encodeURIComponent(e.id)}&adim=koltuk`))}"><strong>${esc(e.date)}</strong><span>${esc(e.time)} · ${esc(e.name)}</span></a></li>`).join('');
    box.hidden = !next.length;
    const join = box.closest('.club-entry').querySelector('[data-club-entry]');
    if (session?.clubIds.includes(club.id)) join.innerHTML = 'Kulübündesin <span>↗</span>';
  }
}

window.addEventListener('fikirhane-session', render);
ready().then(render).catch(() => {});
