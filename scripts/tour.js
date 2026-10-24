// "Tur planla" (tur/): a visit request written as a short note. The next weekdays become day choices; signed-in people get
// their name and e-mail filled in. The server checks the date, the contact details and the rate limit again.
import { initTheme, escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';
import { ready, getSession, siteUrl } from './session.js';
import './topnav.js';
initTheme();

const TZ = 'Europe/Istanbul';
const form = document.querySelector('#tour-form');
const error = document.querySelector('#tour-error');
const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const at = key => new Date(`${key}T12:00:00+03:00`);
const weekday = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, weekday: 'long' });
const short = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long' });
const SLOT = { morning: 'sabah', afternoon: 'öğleden sonra' };

/** The next ten weekdays, starting tomorrow. */
function nextWeekdays(n = 10) {
  const days = [];
  for (let d = at(dayKey(new Date())); days.length < n;) {
    d = new Date(d.getTime() + 86_400_000);
    if (![0, 6].includes(d.getUTCDay())) days.push(dayKey(d));
  }
  return days;
}

document.querySelector('#tour-days').innerHTML = nextWeekdays().map((k, i) =>
  `<label><input type="radio" name="preferred_date" value="${k}"${i === 0 ? ' required' : ''}><span><b>${esc(weekday.format(at(k)))}</b>${esc(short.format(at(k)))}</span></label>`).join('');

function updateEntryLinks() {
  const session = getSession();
  document.querySelectorAll('[data-member-entry]').forEach(link => {
    link.href = siteUrl(session ? 'member/#anasayfa' : 'uyelik/');
    if (link.classList.contains('join-link')) link.innerHTML = session ? 'Üye alanım <span>↗</span>' : 'Aramıza katıl <span>↗</span>';
  });
}
window.addEventListener('fikirhane-session', updateEntryLinks);
updateEntryLinks();
ready().catch(() => {});

function fail(message) { error.textContent = message; error.hidden = false; error.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

let online = false;
(async () => {
  online = await apiAvailable();
  if (!online) { fail('Bu önizlemede not gönderilemiyor; tur talepleri yalnızca sunucuya bağlıyken alınır.'); return; }
  try {
    const me = await api('/me');
    if (!form.first_name.value) form.first_name.value = me.user.first_name ?? '';
    if (!form.contact_email.value && me.user.email) form.contact_email.value = me.user.email;
  } catch {}
})();

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const f = new FormData(form);
  const value = k => String(f.get(k) ?? '').trim();
  if (!value('first_name')) { fail('Sana nasıl seslenelim? Adını yaz.'); form.first_name.focus(); return; }
  if (!value('preferred_date')) { fail('Hangi gün gelmek istediğini seç.'); return; }
  if (!value('preferred_slot')) { fail('Sabah mı, öğleden sonra mı?'); return; }
  if (!value('contact_email') && !value('contact_phone')) { fail('Sana ulaşabilmemiz için e-posta adresini ya da telefonunu yaz.'); form.contact_email.focus(); return; }
  if (!online) { fail('Bu önizlemede not gönderilemiyor; tur talepleri yalnızca sunucuya bağlıyken alınır.'); return; }
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    await api('/tours', { method: 'POST', body: {
      first_name: value('first_name'), contact_email: value('contact_email') || null, contact_phone: value('contact_phone') || null,
      preferred_date: value('preferred_date'), preferred_slot: value('preferred_slot'), interests: f.getAll('interests'),
      note: value('note') || null, website: value('website') || undefined } });
    const day = `${weekday.format(at(value('preferred_date')))}, ${short.format(at(value('preferred_date')))}`;
    form.outerHTML = `<div class="tour-note tour-thanks" tabindex="-1" id="tour-thanks"><p class="tour-line">Notun bize ulaştı, <b>${esc(value('first_name'))}</b>.</p>
      <p class="tour-line">${esc(day)} ${esc(SLOT[value('preferred_slot')])} için seninle ${value('contact_phone') ? 'telefonla' : 'e-postayla'} iletişime geçip saati netleştireceğiz.</p>
      <p class="space-note">Bu arada mekânlara göz atabilir ya da <a class="text-link" href="${siteUrl('rezervasyon/')}">programa bakabilirsin ↗</a></p></div>`;
    document.querySelector('#tour-thanks').focus();
  } catch (err) {
    button.disabled = false;
    fail(err?.message ?? 'Not gönderilemedi. Biraz sonra tekrar dener misin?');
  }
});
