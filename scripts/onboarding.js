import { initTheme } from './shared.js';
import { getSession, getSavedPreview, startPreview, resumePreview, destination, siteUrl } from './session.js';
initTheme();
const params = new URLSearchParams(location.search);
const next = siteUrl(destination(params));
const error = document.querySelector('#entry-error');
function showError() { error.textContent = 'Önizlemeyi kaydetmek için tarayıcı depolamasına izin verip tekrar dene.'; error.hidden = false; }
if (getSession()) location.replace(next);
const saved = getSavedPreview();
if (saved) {
  document.querySelector('#resume-preview').hidden = false;
  document.querySelector('#entry-name').value = saved.profile.name;
  document.querySelector('#resume-button').addEventListener('click', () => { try { resumePreview(); location.assign(next); } catch { showError(); } });
}
const selectedClub = params.get('club');
document.querySelectorAll('[name="club"]').forEach(input => { input.checked = input.value === selectedClub; });
document.querySelector('#entry-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = document.querySelector('#entry-name').value.trim();
  if (!name) { document.querySelector('#entry-name').setCustomValidity('Adını yazabilir misin?'); document.querySelector('#entry-name').reportValidity(); return; }
  try { startPreview(name, [...document.querySelectorAll('[name="club"]:checked')].map(input => input.value)); location.assign(next); } catch { showError(); }
});
document.querySelector('#entry-name').addEventListener('input', event => event.target.setCustomValidity(''));
