// Space pages (coworking/, toplanti-odasi/, etkinlik-alani/, language-meetup/): theme, top menu and membership entry links.
import { initTheme } from './shared.js';
import './topnav.js';
import { ready, getSession, siteUrl } from './session.js';
initTheme();

function updateEntryLinks() {
  const session = getSession();
  document.querySelectorAll('[data-member-entry]').forEach(link => {
    link.href = siteUrl(session ? 'member/#anasayfa' : 'uyelik/');
    if (link.classList.contains('join-link')) link.innerHTML = session ? 'Üye alanım <span>↗</span>' : 'Aramıza katıl <span>↗</span>';
  });
  document.querySelectorAll('[data-club-entry]').forEach(link => {
    link.href = siteUrl((session ? 'member/#kulup/' : 'uyelik/?club=') + link.dataset.clubEntry);
  });
}
window.addEventListener('fikirhane-session', updateEntryLinks);
updateEntryLinks();
ready().catch(() => {});
