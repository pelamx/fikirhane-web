// Entry pass card (QR + date and session) shared by the reservation page and the member area.
import { escapeHTML as esc } from './shared.js';
import { api } from './api.js';
import { API_BASE } from './config.js';

const passUrl = (id, file) => `${API_BASE}/me/bookings/${encodeURIComponent(id)}/${file}`;

export async function passCard(bookingId) {
  const { pass } = await api(`/me/bookings/${encodeURIComponent(bookingId)}/pass`);
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(`${pass.date}T12:00:00+03:00`));
  const from = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(pass.valid_from));
  return `<div class="pass-card">
    <img class="pass-qr" src="${passUrl(pass.id_booking, 'qr.svg')}" width="220" height="220" alt="Giriş QR kodu: ${esc(date)}, ${esc(pass.session)}">
    <div class="pass-info"><span class="section-label">GİRİŞ KODU</span><strong>${esc(pass.event_title)}</strong>
      <dl><div><dt>Tarih</dt><dd>${esc(date)}</dd></div><div><dt>Seans</dt><dd>${esc(pass.session)}</dd></div>
      <div><dt>Yer</dt><dd>${esc(pass.location)}${pass.seat ? ` · ${esc(pass.seat)}` : ''}</dd></div>${pass.holder ? `<div><dt>Ad</dt><dd>${esc(pass.holder)}</dd></div>` : ''}</dl>
      <p class="pass-note">${pass.checked_in_at ? 'Giriş yapıldı.' : `Bu kod yalnızca bu seans için geçerli; girişte ${esc(from)}'den itibaren okutulabilir.`}</p>
      <a class="shell-secondary pass-download" href="${passUrl(pass.id_booking, 'qr.png')}" download>QR kodu indir <span>↓</span></a></div></div>`;
}
