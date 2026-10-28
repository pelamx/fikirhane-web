// "İletişim" (iletisim/): a message to the team, written as a short note. Signed-in people get their name and e-mail
// filled in. The server checks the contact details and the rate limit again; staff answer from the host shell.
import { initTheme, escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';
import { ready, getSession, siteUrl } from './session.js';
import './topnav.js';
initTheme();

const form = document.querySelector('#contact-form');
const error = document.querySelector('#contact-error');
const OFFLINE = 'Bu önizlemede mesaj gönderilemiyor; mesajlar yalnızca sunucuya bağlıyken alınır.';

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
  if (!online) { fail(OFFLINE); return; }
  try {
    const me = await api('/me');
    if (!form.full_name.value) form.full_name.value = [me.user.first_name, me.user.last_name].filter(Boolean).join(' ');
    if (!form.contact_email.value && me.user.email) form.contact_email.value = me.user.email;
  } catch {}
})();

form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true;
  const f = new FormData(form);
  const value = k => String(f.get(k) ?? '').trim();
  if (!value('full_name')) { fail('Sana nasıl seslenelim? Adını yaz.'); form.full_name.focus(); return; }
  if (!value('message')) { fail('Mesajını yazmayı unuttun.'); form.message.focus(); return; }
  if (!value('contact_email') && !value('contact_phone')) { fail('Sana dönebilmemiz için e-posta adresini ya da telefonunu yaz.'); form.contact_email.focus(); return; }
  if (!online) { fail(OFFLINE); return; }
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    await api('/contact', { method: 'POST', body: {
      full_name: value('full_name'), contact_email: value('contact_email') || null, contact_phone: value('contact_phone') || null,
      topic: value('topic') || 'general', message: value('message'), website: value('website') || undefined } });
    form.outerHTML = `<div class="tour-note tour-thanks" tabindex="-1" id="contact-thanks"><p class="tour-line">Mesajın bize ulaştı, <b>${esc(value('full_name').split(' ')[0])}</b>.</p>
      <p class="tour-line">Sana ${value('contact_phone') && !value('contact_email') ? 'telefonla' : 'e-postayla'} döneceğiz.</p>
      <p class="space-note">Bu arada <a class="text-link" href="${siteUrl('#sss')}">sık sorulan sorulara bakabilirsin ↗</a></p></div>`;
    document.querySelector('#contact-thanks').focus();
  } catch (err) {
    button.disabled = false;
    fail(err?.message ?? 'Mesaj gönderilemedi. Biraz sonra tekrar dener misin?');
  }
});
