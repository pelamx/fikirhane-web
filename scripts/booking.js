// Reservation flow: Seans → Koltuk → Bilgiler → Onay. State lives in the address (?tarih&seans&adim&salon&koltuk&alan) so a
// step can be shared, reloaded or resumed after signing in. The server re-checks every rule when the booking is made.
import { initTheme, escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';
import { siteUrl } from './session.js';
import { passCard } from './pass.js';
import { dayKey, addDays, mondayOf, range, dayTitle, money, optionsOf, cheapest, AREAS, inArea, availability as availabilityOf, firstDay as firstDayOf, weekPicker } from './program.js';
import './topnav.js';
initTheme();

const content = document.querySelector('#booking-content');
const aside = document.querySelector('#booking-aside');
const bar = document.querySelector('#booking-bar');
const STEPS = [['seans', 'Seans'], ['koltuk', 'Koltuk'], ['bilgiler', 'Bilgiler'], ['onay', 'Onay']];
const seatNo = code => String(Number(String(code).replace(/\D/g, '')) || code);

let me = null, policy = null, week = { start: null, items: [] }, detail = null, busy = false, toastTimer;
const cache = new Map();
const areaKey = () => { const k = new URLSearchParams(location.search).get('alan'); return k in AREAS ? k : ''; };
const areaOf = () => AREAS[areaKey()] ?? null;
const listed = () => inArea(week.items, areaKey());
const PASS_OK = ['confirmed', 'checked_in'];
const noSeatStep = e => optionsOf(e).length === 1 && optionsOf(e)[0].booking_unit !== 'seat';

function state() {
  const p = new URLSearchParams(location.search);
  return { date: p.get('tarih') || dayKey(new Date()), eventId: p.get('seans'), step: p.get('adim') || 'seans',
    optionId: p.get('salon'), seatId: p.get('koltuk'), auto: p.get('koltuk') === 'farketmez' };
}
function go(changes, replace = false) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) v == null || v === '' ? p.delete(k) : p.set(k, v);
  history[replace ? 'replaceState' : 'pushState'](null, '', `${location.pathname}?${p}`);
  render();
}
function flash(message) { const t = document.querySelector('#toast'); clearTimeout(toastTimer); t.textContent = message; t.hidden = false; toastTimer = setTimeout(() => t.hidden = true, 4000); }

// ---------- data ----------

async function loadWeek(start) {
  if (week.start === start) return;
  const from = new Date(`${start}T00:00:00+03:00`), to = new Date(from.getTime() + 7 * 86_400_000);
  const res = await api(`/events?from=${from.toISOString()}&to=${to.toISOString()}`);
  week = { start, items: res.items };
  policy = res.policy;
}
async function loadEvent(id) {
  if (!id) return null;
  if (!cache.has(id)) cache.set(id, api(`/events/${id}`).then(r => { policy = r.policy; return r.event; }).catch(err => { cache.delete(id); throw err; }));
  return cache.get(id);
}
const availability = e => availabilityOf(e, policy);

// ---------- steps ----------

function stepper(current) {
  const idx = STEPS.findIndex(([k]) => k === current);
  document.querySelector('#booking-steps').innerHTML = STEPS.map(([k, label], i) =>
    `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}"${i === idx ? ' aria-current="step"' : ''}><span>${i < idx ? '✓' : i + 1}</span>${label}</li>`).join('');
}

function sessionsStep(s) {
  const area = areaOf();
  return (area ? `<h1 class="booking-title">${esc(area.title)}</h1><p class="booking-lead">${esc(area.lead)}</p>`
    : `<h1 class="booking-title">Seansını seç</h1><p class="booking-lead">Günü ve seansı belirle; uygun seansları anında gör.</p>`)
    + weekPicker({ items: week.items, policy, date: s.date, area: areaKey(), selectedId: s.eventId });
}

function planView(e, option, s, canPick) {
  const plan = e.plans.find(p => p.id_event_option === option.id_event_option);
  const seats = e.seats.filter(x => x.id_event_option === option.id_event_option);
  if (!plan || !seats.length) return '';
  const ratio = Number(plan.map_aspect_ratio) || 1.6;
  return `<div class="booking-plan" style="aspect-ratio:${ratio}">${plan.map_image ? `<img src="${esc(siteUrl(plan.map_image))}" alt="" aria-hidden="true">` : ''}
    ${plan.tables.map(t => `<div class="plan-table" style="left:${t.position_x * 100}%;top:${t.position_y * 100}%;width:${t.width * 100}%;height:${t.height * 100}%"><span>${esc(t.table_name)}</span></div>`).join('')}
    ${seats.map(x => {
      const mine = x.id_seat === s.seatId, taken = !x.free;
      const cls = taken ? 'taken' : mine ? 'selected' : 'free';
      return `<button class="plan-seat ${cls}" style="left:${x.position_x * 100}%;top:${x.position_y * 100}%" data-seat="${x.id_seat}" data-option="${option.id_event_option}"
        ${taken || !canPick ? 'disabled' : ''} aria-pressed="${mine}" aria-label="${esc(x.seat_name)}${taken ? ' — dolu' : ''}">${esc(seatNo(x.seat_code))}</button>`;
    }).join('')}</div>`;
}

function seatStep(e, s) {
  const opts = optionsOf(e);
  const option = opts.find(o => o.id_event_option === s.optionId) ?? (opts.length === 1 ? opts[0] : null);
  const canPick = !!policy?.seat_selection;
  const seatBased = opts.some(o => o.booking_unit === 'seat');
  return `<h1 class="booking-title">${seatBased ? 'Koltuğunu seç' : 'Alanını seç'}</h1><p class="booking-lead">${seatBased ? (canPick ? 'Planın üzerinden koltuğunu işaretle ya da seçimi bize bırak.' : 'Salonu seç; koltuğunu biz ayarlayalım.') : 'Bu etkinlik için alanı seç.'}</p>
    ${!canPick && seatBased ? '<p class="booking-note">Bu hesapta koltuk seçimi kapalı. Seçtiğin salonda uygun ilk koltuk sana ayrılır.</p>' : ''}
    ${opts.length > 1 ? `<div class="booking-rooms" role="radiogroup" aria-label="Salon">${opts.map(o => `<button class="booking-room${o === option ? ' selected' : ''}" role="radio" aria-checked="${o === option}" data-room="${o.id_event_option}">
      <strong>${esc(o.location_name)}</strong><span>${o.available ? `${o.available} / ${o.capacity} yer boş` : 'Dolu · bekleme listesi'}</span><em>${o.price ? esc(money(o.price.finalPrice, o.price.currency)) : ''}</em></button>`).join('')}</div>` : ''}
    ${(option ? [option] : opts).filter(o => o.booking_unit === 'seat').map(o => `<section class="booking-plan-wrap"><div class="booking-plan-head"><h2>${esc(o.location_name)}</h2><span>${esc(e.plans.find(p => p.id_event_option === o.id_event_option)?.setup_name ?? '')}</span></div>${planView(e, o, s, canPick && (!option || o === option || opts.length === 1))}</section>`).join('')}
    ${seatBased ? `<div class="booking-legend"><span><i class="free"></i>Boş</span><span><i class="taken"></i>Dolu</span><span><i class="selected"></i>Seçili</span></div>` : ''}
    ${seatBased && canPick ? `<label class="booking-auto"><input type="checkbox" data-auto ${s.auto || !s.seatId ? 'checked' : ''}><span><strong>Koltuk fark etmez</strong><small>Sıradaki uygun koltuğu biz seçelim; nerede oturacağını hemen göreceksin.</small></span></label>` : ''}`;
}

function detailsStep(e) {
  if (!policy?.signed_in) {
    const next = encodeURIComponent(`rezervasyon/${location.search}`);
    return `<h1 class="booking-title">Bilgilerin</h1><p class="booking-lead">Rezervasyonu tamamlamak için giriş yap ya da hesap oluştur; seçimlerin seni bekliyor.</p>
      <div class="booking-login"><a class="shell-primary" href="${siteUrl(`uyelik/?giris&next=${next}`)}">Giriş yap <span>↗</span></a><a class="shell-secondary" href="${siteUrl(`uyelik/?next=${next}`)}">Hesap oluştur</a></div>`;
  }
  const saved = JSON.parse(sessionStorageGet('fikirhane-booking-extra') ?? '{}');
  return `<h1 class="booking-title">Bilgilerin</h1><p class="booking-lead">Rezervasyon ${esc(me.user.first_name)} ${esc(me.user.last_name)} adına yapılacak${me.user.email ? ` (${esc(me.user.email)})` : ''}.</p>
    <form id="extra-form" class="booking-form">
      ${e.enable_need ? `<label for="need">Bu buluşmada neye ihtiyacın var? <small>İsteğe bağlı · diğer katılımcılar tanışırken görebilir</small></label><textarea id="need" name="need" maxlength="500" rows="3" placeholder="Örn. ürünüm için ilk kullanıcı geri bildirimi">${esc(saved.need ?? '')}</textarea>` : ''}
      ${e.enable_offer ? `<label for="offer">Neler sunabilirsin? <small>İsteğe bağlı</small></label><textarea id="offer" name="offer" maxlength="500" rows="3" placeholder="Örn. pazarlama stratejisi üzerine fikir alışverişi">${esc(saved.offer ?? '')}</textarea>` : ''}
      <label for="freepass">Freepass ya da misafir kodun var mı? <small>İsteğe bağlı</small></label><input id="freepass" name="freepass" maxlength="40" autocomplete="off" value="${esc(saved.freepass ?? '')}" placeholder="FREEPASS-KODU">
    </form>`;
}

function confirmStep(e, s) {
  const option = optionsOf(e).find(o => o.id_event_option === s.optionId) ?? optionsOf(e)[0];
  const seat = e.seats.find(x => x.id_seat === s.seatId);
  const extra = JSON.parse(sessionStorageGet('fikirhane-booking-extra') ?? '{}');
  const p = option?.price;
  const waitlist = option && option.available === 0;
  return `<h1 class="booking-title">Onayla</h1><p class="booking-lead">Bilgileri kontrol et ve rezervasyonunu tamamla.</p>
    <dl class="booking-review">
      <div><dt>Seans</dt><dd>${esc(e.event_title)}<br><small>${esc(dayTitle(dayKey(new Date(e.start_datetime))))} · ${esc(range(e))}</small></dd></div>
      <div><dt>Yer</dt><dd>${esc(option?.location_name ?? '—')}${seat ? ` · Koltuk ${esc(seatNo(seat.seat_code))}` : option?.booking_unit === 'seat' ? ' · koltuk otomatik ayrılacak' : ''}</dd></div>
      ${extra.need ? `<div><dt>İhtiyacın</dt><dd>${esc(extra.need)}</dd></div>` : ''}${extra.offer ? `<div><dt>Sunabileceklerin</dt><dd>${esc(extra.offer)}</dd></div>` : ''}
      ${extra.freepass ? `<div><dt>Freepass</dt><dd>${esc(extra.freepass)} <small>(geçerliyse ücret alınmaz)</small></dd></div>` : ''}
      <div><dt>Ücret</dt><dd>${p ? `${Number(p.discountAmount) > 0 ? `<s>${esc(money(p.listAmount, p.currency))}</s> ` : ''}<strong>${esc(money(p.finalPrice, p.currency))}</strong>${p.reason === 'membership' ? ' <small>üyelik indirimiyle</small>' : ''}` : '—'}</dd></div>
    </dl>
    <p class="booking-note">${policy?.payment_mode === 'online' ? 'Ödemeyi bir sonraki adımda yapacaksın; yerin 10 dakika tutulur.' : 'Ödeme buluşmada alınır.'} Buluşmaya ${policy?.cancellation_lock_hours ?? 24} saatten fazla varken rezervasyonunu üye alanından iptal edebilirsin.${waitlist ? ' <strong>Bu salon dolu; bekleme listesine eklenirsin, yer açılınca haber veririz.</strong>' : ''}</p>
    <p class="form-error" id="booking-error" role="alert" hidden></p>`;
}

/** After booking, and again when the done address is reloaded (then only the booking's id and status are known). */
function doneStep(booking, e) {
  const wait = booking.booking_status === 'waitlisted', pass = PASS_OK.includes(booking.booking_status);
  const place = [booking.location_name, booking.seat_code ? `Koltuk ${seatNo(booking.seat_code)}` : booking.table_name].filter(Boolean).join(' · ');
  const pay = booking.final_price != null ? `Ödenecek tutar: <strong>${esc(money(booking.final_price, booking.currency_code))}</strong>. ` : '';
  return `<div class="booking-done"><span class="booking-done-mark" aria-hidden="true">${wait ? '…' : '✓'}</span><h1 class="booking-title">${wait ? 'Bekleme listesindesin.' : 'Yerin ayrıldı.'}</h1>
    <p class="booking-lead">${esc(e.event_title)} · ${esc(dayTitle(dayKey(new Date(e.start_datetime))))} · ${esc(range(e))}${place ? `<br><strong>${esc(place)}</strong>` : ''}</p>
    <p>${wait ? 'Yer açıldığında rezervasyonun onaylanır; QR kodun o zaman Rezervasyonlarım’da görünür.' : pass ? `${pay}Girişte aşağıdaki QR kodu göster ya da indirip telefonunda sakla; görüşmek üzere!` : `${pay}Ödeme tamamlanınca giriş QR kodun burada ve Rezervasyonlarım’da görünür.`}</p>
    ${pass ? '<div id="pass-slot"><p class="entry-loading">Giriş QR kodun hazırlanıyor…</p></div>' : ''}
    <div class="booking-login"><a class="shell-primary" href="${siteUrl('member/#bulusmalar')}">Rezervasyonlarım <span>↗</span></a><a class="shell-secondary" href="?">Yeni rezervasyon</a></div></div>`;
}

function showPass(bookingId) {
  const slot = () => document.querySelector('#pass-slot');
  passCard(bookingId).then(html => { if (slot()) slot().innerHTML = html; })
    .catch(() => { if (slot()) slot().innerHTML = `<p class="booking-note">QR kodu şu an gösterilemedi. <button class="text-link" data-pass-retry="${esc(bookingId)}">Tekrar dene</button> ya da <a class="text-link" href="${siteUrl('member/#bulusmalar')}">Rezervasyonlarım</a>’dan aç.</p>`; });
}

// ---------- summary and bottom bar ----------

function summary(s, e) {
  const list = listed().filter(x => dayKey(new Date(x.start_datetime)) === s.date);
  const day = `<section class="booking-card"><div class="booking-card-head"><h2>${esc(dayTitle(s.date))}</h2><span>${list.length} seans</span></div>${list.length ? `<ul>${list.map(x => `<li><i class="avail-${availability(x)[0]}"></i><strong>${esc(range(x))}</strong> ${esc(x.event_title)}<span>${esc(availability(x)[1].toLocaleLowerCase('tr'))}</span></li>`).join('')}</ul>` : '<p class="booking-muted">Seans yok.</p>'}</section>`;
  if (!e || s.step === 'seans') return day;
  const option = optionsOf(e).find(o => o.id_event_option === s.optionId) ?? (optionsOf(e).length === 1 ? optionsOf(e)[0] : null);
  const seat = e.seats.find(x => x.id_seat === s.seatId);
  const price = option?.price ?? cheapest(e);
  return day + `<section class="booking-card"><div class="booking-card-head"><h2>Rezervasyon özeti</h2><button class="text-link" data-step="seans">Düzenle</button></div><ul class="booking-summary">
    <li>▦ ${esc(dayTitle(dayKey(new Date(e.start_datetime))))}</li><li>◷ ${esc(range(e))} · ${esc(e.event_title)}</li>
    <li>⌖ ${option ? esc(option.location_name) : 'Salon seçilmedi'}${seat ? ` · Koltuk ${esc(seatNo(seat.seat_code))}` : option?.booking_unit === 'seat' ? ' · koltuk seçilmedi' : ''}</li>
    <li>₺ ${price ? esc(money(price.finalPrice, price.currency)) : '—'}</li></ul></section>`;
}

function bottomBar(s, e) {
  const next = { seans: 'koltuk', koltuk: 'bilgiler', bilgiler: 'onay' }[s.step];
  const prev = { koltuk: 'seans', bilgiler: 'koltuk', onay: 'bilgiler' }[s.step];
  const option = e && (optionsOf(e).find(o => o.id_event_option === s.optionId) ?? (optionsOf(e).length === 1 ? optionsOf(e)[0] : null));
  const seat = e?.seats.find(x => x.id_seat === s.seatId);
  const price = option?.price ?? (e && cheapest(e));
  const labels = { seans: noSeatStep(e) || (!e && areaOf()) ? 'Devam et' : 'Koltuk seçimine devam et', koltuk: 'Bilgilere devam et', bilgiler: 'Onaya devam et', onay: option?.available === 0 ? 'Bekleme listesine katıl' : 'Rezervasyonu tamamla' };
  const ready = s.step === 'seans' ? !!e && !['mine', 'soon'].includes(availability(e)[0])
    : s.step === 'koltuk' ? !!option : s.step === 'bilgiler' ? !!policy?.signed_in : true;
  const what = s.step === 'seans' ? ['Seçilen seans', e ? `${dayTitle(dayKey(new Date(e.start_datetime)))} · ${range(e)}` : 'Henüz seans seçmedin']
    : ['Seçimin', `${option ? option.location_name : 'Salon seçilmedi'}${seat ? ` · Koltuk ${seatNo(seat.seat_code)}` : option?.booking_unit === 'seat' ? ' · koltuk otomatik' : ''}`];
  bar.hidden = false;
  bar.innerHTML = `<div class="booking-bar-inner"><div><small>${esc(what[0])}</small><strong>${esc(what[1])}</strong></div><span class="booking-bar-price">${price ? esc(money(price.finalPrice, price.currency)) : ''}</span>
    ${prev ? `<button class="shell-secondary" data-step="${prev}">‹ Geri</button>` : ''}<button class="shell-primary" ${ready ? '' : 'disabled'} data-${s.step === 'onay' ? 'submit' : 'step'}="${next ?? ''}">${esc(labels[s.step])} <span>→</span></button></div>`;
}

// ---------- render ----------

function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }

async function render() {
  const s = state();
  try {
    await loadWeek(mondayOf(s.date));
    // Opened without a date: start on the first day that has something to book, looking one week ahead if needed.
    if (s.step === 'seans' && !new URLSearchParams(location.search).get('tarih')) {
      const today = dayKey(new Date());
      const firstDay = () => firstDayOf(week.items, areaKey(), today);
      let first = firstDay();
      if (!first) { await loadWeek(addDays(mondayOf(s.date), 7)); first = firstDay(); }
      if (first) { go({ tarih: first }, true); return; }
      await loadWeek(mondayOf(s.date));
    }
    let e = s.eventId ? await loadEvent(s.eventId).catch(() => null) : null;
    if (s.eventId && !e) { go({ seans: null, adim: null, salon: null, koltuk: null }, true); return; }
    if (s.step === 'tamam') {
      // A reloaded done page shows the booking and its QR again; without a booking it falls back to the program.
      if (!e?.my_booking) { go({ adim: null }, true); return; }
      stepper('onay'); bar.hidden = true; aside.innerHTML = '';
      content.innerHTML = doneStep(e.my_booking, e);
      if (PASS_OK.includes(e.my_booking.booking_status)) showPass(e.my_booking.id_booking);
      document.title = 'Rezervasyonun · Fikirhane';
      return;
    }
    // Steps after the session need one; skip the seat step for single, non-seat options.
    if (s.step !== 'seans' && !e) { go({ adim: null }, true); return; }
    if (s.step === 'koltuk' && e && optionsOf(e).length === 1 && optionsOf(e)[0].booking_unit !== 'seat') { go({ adim: 'bilgiler', salon: optionsOf(e)[0].id_event_option }, true); return; }
    stepper(s.step === 'tamam' ? 'onay' : s.step);
    detail = e;
    content.innerHTML = s.step === 'koltuk' ? seatStep(e, s) : s.step === 'bilgiler' ? detailsStep(e) : s.step === 'onay' ? confirmStep(e, s) : sessionsStep(s);
    aside.innerHTML = summary(s, e);
    bottomBar(s, e);
    document.title = `${STEPS.find(([k]) => k === s.step)?.[1] ?? 'Rezervasyon'} · Rezervasyon · Fikirhane`;
  } catch (err) {
    content.innerHTML = `<div class="booking-empty"><p>Program yüklenemedi.</p><p>${esc(err?.message ?? '')}</p></div>`;
  }
}

function saveExtra() {
  const f = document.querySelector('#extra-form');
  if (!f) return;
  sessionStorageSet('fikirhane-booking-extra', JSON.stringify({ need: f.need?.value.trim() || '', offer: f.offer?.value.trim() || '', freepass: f.freepass?.value.trim() || '' }));
}

async function submit() {
  if (busy) return;
  const s = state(), e = detail, option = optionsOf(e).find(o => o.id_event_option === s.optionId) ?? optionsOf(e)[0];
  const extra = JSON.parse(sessionStorageGet('fikirhane-booking-extra') ?? '{}');
  const error = document.querySelector('#booking-error');
  busy = true; bar.querySelector('[data-submit]')?.setAttribute('disabled', '');
  try {
    const { booking } = await api('/bookings', { method: 'POST', body: {
      event_id: e.id_event, event_option_id: option?.id_event_option ?? null, seat_id: s.seatId && !s.auto ? s.seatId : null,
      join_waitlist: option?.available === 0, need_text: extra.need || null, offer_text: extra.offer || null, freepass_code: extra.freepass || null } });
    sessionStorageSet('fikirhane-booking-extra', '{}');
    cache.delete(e.id_event); week.start = null;
    history.replaceState(null, '', `${location.pathname}?tarih=${s.date}&seans=${e.id_event}&adim=tamam`);
    stepper('onay'); bar.hidden = true;
    content.innerHTML = doneStep(booking, e);
    aside.innerHTML = '';
    if (PASS_OK.includes(booking.booking_status)) showPass(booking.id_booking);
  } catch (err) {
    if (err?.status === 401) { location.assign(siteUrl(`uyelik/?giris&next=${encodeURIComponent('rezervasyon/' + location.search)}`)); return; }
    if (err?.code === 'seat_taken') { cache.delete(e.id_event); flash('Bu koltuk az önce doldu; başka bir koltuk seç.'); go({ adim: 'koltuk', koltuk: null }); return; }
    if (error) { error.textContent = err?.message ?? 'Rezervasyon tamamlanamadı.'; error.hidden = false; } else flash(err?.message ?? 'Rezervasyon tamamlanamadı.');
    bar.querySelector('[data-submit]')?.removeAttribute('disabled');
  } finally { busy = false; }
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t || t.disabled) return;
  if (t.dataset.week) { const d = addDays(mondayOf(state().date), Number(t.dataset.week)); const today = dayKey(new Date()); go({ tarih: d < today ? today : d, seans: null, adim: null, salon: null, koltuk: null }); }
  else if (t.dataset.day) go({ tarih: t.dataset.day, seans: null, adim: null, salon: null, koltuk: null });
  else if (t.dataset.session) {
    const e = week.items.find(x => x.id_event === t.dataset.session);
    if (PASS_OK.includes(e?.my_booking?.booking_status)) { go({ seans: e.id_event, adim: 'tamam', salon: null, koltuk: null }); return; }
    if (t.getAttribute('aria-disabled') === 'true') { flash(availability(e)[1] + '.'); return; }
    go({ seans: t.dataset.session, salon: null, koltuk: null }, true);
  }
  else if (t.dataset.passRetry) { document.querySelector('#pass-slot').innerHTML = '<p class="entry-loading">Giriş QR kodun hazırlanıyor…</p>'; showPass(t.dataset.passRetry); }
  else if (t.dataset.area !== undefined) go({ alan: t.dataset.area, tarih: null, seans: null, adim: null, salon: null, koltuk: null });
  else if (t.dataset.room) go({ salon: t.dataset.room, koltuk: null }, true);
  else if (t.dataset.seat) { const s = state(); go({ salon: t.dataset.option, koltuk: s.seatId === t.dataset.seat ? null : t.dataset.seat }, true); }
  else if (t.hasAttribute('data-submit')) submit();
  else if (t.dataset.step !== undefined) { saveExtra(); go({ adim: t.dataset.step === 'seans' ? null : t.dataset.step }); window.scrollTo({ top: 0 }); }
});
document.addEventListener('change', ev => { if (ev.target.matches('[data-auto]')) go({ koltuk: ev.target.checked ? 'farketmez' : null }, true); });
document.addEventListener('input', ev => { if (ev.target.closest('#extra-form')) saveExtra(); });
window.addEventListener('popstate', render);

(async () => {
  if (!await apiAvailable()) { content.innerHTML = '<div class="booking-empty"><p>Rezervasyon şu anda yalnızca sunucuya bağlıyken çalışır.</p><p><a class="text-link" href="https://www.fikirhane.co/ng/rezervasyon">Fikirhane rezervasyon sayfası ↗</a></p></div>'; return; }
  try { me = await api('/me'); } catch { me = null; }
  if (me) {
    document.querySelector('#booking-profile').hidden = false;
    document.querySelector('#header-name').textContent = me.user.first_name;
    document.querySelector('#header-initial').textContent = me.user.first_name[0].toLocaleUpperCase('tr');
  } else {
    document.querySelector('#booking-login').hidden = false;
    document.querySelector('#booking-login').href = siteUrl(`uyelik/?giris&next=${encodeURIComponent('rezervasyon/' + location.search)}`);
    document.querySelector('#my-bookings-link').hidden = true;
  }
  await render();
})();
