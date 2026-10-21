export function initTheme() {
  const root = document.documentElement;
  function refresh() { const dark = root.dataset.theme === 'dark'; document.querySelectorAll('.theme-toggle').forEach(button => button.setAttribute('aria-label', dark ? 'Açık temaya geç' : 'Koyu temaya geç')); const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#191a17' : '#fbf8f2'; }
  document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('fikirhane-theme', root.dataset.theme); } catch {} refresh(); }));
  refresh();
}
export function initMenu() {
  const menu = document.querySelector('.menu'), nav = document.querySelector('#nav');
  function close() { if (!menu || !nav) return; nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Menüyü aç'); }
  menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; nav.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç'); });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
}
export function escapeHTML(value) { return String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])); }
