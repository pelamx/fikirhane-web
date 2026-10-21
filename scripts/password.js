// Forgot password: request a link by email, or (with #t=<token> in the address) set a new password.
import { initTheme } from './shared.js';
import { api, apiAvailable } from './api.js';
initTheme();
const $ = selector => document.querySelector(selector);

function busy(form, on) { form.querySelector('[type=submit]').disabled = on; }
function fail(id, message) { const el = $(id); el.textContent = message; el.hidden = false; }

async function requestPanel() {
  $('#request-panel').hidden = false;
  const { email_enabled: enabled } = await api('/auth/password-reset').catch(() => ({ email_enabled: true }));
  if (!enabled) { $('#request-form').hidden = true; $('#request-unavailable').hidden = false; return; }
  $('#request-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target; busy(form, true); $('#request-error').hidden = true;
    try {
      await api('/auth/password-reset/request', { method: 'POST', body: { email: $('#request-email').value.trim() } });
      form.hidden = true; $('#request-sent').hidden = false;
    } catch (err) { fail('#request-error', err.message); }
    finally { busy(form, false); }
  });
}

function confirmPanel(token) {
  // Keep the token out of the address bar and history once it has been read.
  history.replaceState(null, '', location.pathname);
  $('#confirm-panel').hidden = false;
  $('.entry-story p').textContent = 'Yeni şifreni iki kez yaz. Kaydettiğinde bütün cihazlardan çıkış yapılır.';
  $('#confirm-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target; $('#confirm-error').hidden = true;
    const password = $('#new-password').value;
    if (password !== $('#new-password-again').value) { fail('#confirm-error', 'İki şifre aynı değil.'); return; }
    busy(form, true);
    try {
      await api('/auth/password-reset/confirm', { method: 'POST', body: { token, password } });
      form.hidden = true; $('#confirm-done').hidden = false;
    } catch (err) {
      fail('#confirm-error', err.message);
      if (err.code === 'reset_token_invalid') { form.hidden = true; $('#request-again').hidden = false; }
    } finally { busy(form, false); }
  });
}

// A reset link opened in a tab that already shows this page only changes the fragment; start over to read it.
window.addEventListener('hashchange', () => { if (location.hash.includes('t=')) location.reload(); });

(async () => {
  if (!await apiAvailable()) { $('#password-loading').textContent = 'Şifre yenileme yalnızca sunucuya bağlıyken çalışır.'; return; }
  $('#password-loading').hidden = true;
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token) confirmPanel(token); else await requestPanel();
})().catch(() => { $('#password-loading').textContent = 'Şu anda bağlanamıyoruz. Biraz sonra tekrar dener misin?'; });
