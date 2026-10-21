import { initTheme } from './shared.js';
import './topnav.js';
import { ready, mode, getSession, getSavedPreview, startPreview, resumePreview, register, login, destination, siteUrl } from './session.js';
initTheme();
const params = new URLSearchParams(location.search);
const selectedClub = params.get('club');
const $ = selector => document.querySelector(selector);

function previewEntry(next) {
  const error = $('#entry-error');
  const showError = () => { error.textContent = 'Önizlemeyi kaydetmek için tarayıcı depolamasına izin verip tekrar dene.'; error.hidden = false; };
  $('#preview-entry').hidden = false;
  const saved = getSavedPreview();
  if (saved) {
    $('#resume-preview').hidden = false;
    $('#entry-name').value = saved.profile.name;
    $('#resume-button').addEventListener('click', () => { try { resumePreview(); location.assign(next()); } catch { showError(); } });
  }
  document.querySelectorAll('[name="club"]').forEach(input => { input.checked = input.value === selectedClub; });
  $('#entry-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#entry-name').value.trim();
    if (!name) { $('#entry-name').setCustomValidity('Adını yazabilir misin?'); $('#entry-name').reportValidity(); return; }
    try { startPreview(name, [...document.querySelectorAll('[name="club"]:checked')].map(input => input.value)); location.assign(next()); } catch { showError(); }
  });
  $('#entry-name').addEventListener('input', event => event.target.setCustomValidity(''));
}

function accountEntry(next) {
  const error = $('#account-error');
  const forms = { register: $('#register-form'), login: $('#login-form') };
  $('#account-entry').hidden = false;
  document.querySelectorAll('[name="reg-club"]').forEach(input => { input.checked = input.value === selectedClub; });
  function show(which) {
    for (const [key, form] of Object.entries(forms)) form.hidden = key !== which;
    document.querySelectorAll('[data-auth]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.auth === which)));
    $('#account-title').textContent = which === 'login' ? 'Tekrar hoş geldin.' : 'Önce bir merhaba.';
    error.hidden = true;
  }
  document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => show(b.dataset.auth)));
  if (params.get('giris') !== null) show('login');
  async function submit(form, action) {
    const button = form.querySelector('[type=submit]');
    button.disabled = true; error.hidden = true;
    try { await action(); location.assign(next()); }
    catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { button.disabled = false; }
  }
  forms.register.addEventListener('submit', event => {
    event.preventDefault();
    submit(forms.register, () => register({
      firstName: $('#reg-first').value.trim(), lastName: $('#reg-last').value.trim(), email: $('#reg-email').value.trim(),
      password: $('#reg-password').value, clubIds: [...document.querySelectorAll('[name="reg-club"]:checked')].map(i => i.value),
    }));
  });
  forms.login.addEventListener('submit', event => {
    event.preventDefault();
    submit(forms.login, () => login($('#login-email').value.trim(), $('#login-password').value));
  });
}

ready().then(() => {
  const next = () => siteUrl(destination(params));
  if (getSession()) { location.replace(next()); return; }
  $('#entry-loading').hidden = true;
  if (mode() === 'api') accountEntry(next); else previewEntry(next);
}).catch(() => { $('#entry-loading').textContent = 'Şu anda bağlanamıyoruz. Biraz sonra tekrar dener misin?'; });
