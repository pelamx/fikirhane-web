// The week's program as the booking page shows it: area chips, the week, its days and the chosen day's sessions.
// Shared by the booking page and the home page so both draw the same picker from the same /events data.
import { escapeHTML as esc } from './shared.js';

export const TZ = 'Europe/Istanbul';
export const TYPE = { workspace: 'Coworking', meetup: 'Buluşma', workshop: 'Atölye', talk: 'Konuşma', class: 'Ders', social: 'Sosyal' };

export const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const fmt = opts => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit' });
const longDay = fmt({ day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const shortWd = fmt({ weekday: 'short' });
const dayNum = fmt({ day: 'numeric' });
const monthShort = fmt({ month: 'short' });
export const at = key => new Date(`${key}T12:00:00+03:00`);
export const addDays = (key, n) => dayKey(new Date(at(key).getTime() + n * 86_400_000));
export const mondayOf = key => { const wd = (at(key).getUTCDay() + 6) % 7; return addDays(key, -wd); };
export const time = d => timeFmt.format(new Date(d));
export const range = e => `${time(e.start_datetime)} – ${time(e.end_datetime)}`;
export const dayTitle = key => longDay.format(at(key)).replace(/^(\S+),? (\d+ \S+ \d+)$/, '$2, $1').replace(/^(\d+ \S+ \d+) (\S+)$/, '$1, $2');
export const money = (amount, currency = 'TRY') => amount == null ? '—' : Number(amount) === 0 ? 'Ücretsiz'
  : new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: Number(amount) % 1 ? 2 : 0 }).format(Number(amount));

export const optionsOf = e => (e?.options ?? []);
export const free = e => optionsOf(e).reduce((n, o) => n + o.available, 0);
export const cheapest = e => optionsOf(e).map(o => o.price).filter(Boolean).sort((a, b) => Number(a.finalPrice) - Number(b.finalPrice))[0] ?? null;
/** One option, booked as a whole place by one person: the meeting room. */
export const wholeRoom = e => optionsOf(e).length === 1 && optionsOf(e)[0].booking_unit === 'location' && optionsOf(e)[0].capacity === 1;
const inMeetingRoom = e => optionsOf(e).some(o => o.location_code === 'MEETING_ROOM');

// ?alan= narrows the program to one kind of booking; the choice sits above the week so every entry point reaches each one.
export const AREAS = {
  coworking: { label: 'Coworking', title: 'Coworking seansını seç', lead: 'Hafta içi sabah 10.00–14.00 ve öğleden sonra 14.30–18.30. Salonunu ve koltuğunu sonra seçersin.',
    match: e => e.event_type === 'workspace' && !inMeetingRoom(e) },
  toplanti: { label: 'Studio', title: 'Studio’yu ayırt', lead: 'Hafta içi akşamları iki saatlik dilimler: 18.00, 20.00 ve 22.00. Odanın tamamı senin.',
    match: inMeetingRoom },
  bulusma: { label: 'Buluşmalar', title: 'Buluşmanı seç', lead: 'Kulüplerin buluşmaları ve etkinlikleri.', match: e => e.event_type !== 'workspace' },
};
export const inArea = (items, area) => AREAS[area] ? items.filter(AREAS[area].match) : items;

const PASS_OK = ['confirmed', 'checked_in'];
export const opensAt = (e, policy) => new Date(new Date(e.start_datetime).getTime() - (policy?.reservation_window_days ?? 7) * 86_400_000);
export function availability(e, policy) {
  if (e.my_booking) return ['mine', e.my_booking.booking_status === 'waitlisted' ? 'Bekleme listesindesin' : PASS_OK.includes(e.my_booking.booking_status) ? 'Rezervasyonun var · QR kodunu gör' : 'Rezervasyonun var'];
  if (opensAt(e, policy) > new Date()) return ['soon', `${fmt({ day: 'numeric', month: 'long' }).format(opensAt(e, policy))} tarihinde açılır`];
  const n = free(e);
  if (wholeRoom(e)) return n === 0 ? ['full', 'Dolu · bekleme listesi'] : ['ok', 'Boş'];
  return n === 0 ? ['full', 'Dolu · bekleme listesi'] : n <= 5 ? ['few', `Son ${n} yer`] : ['ok', 'Yer var'];
}

/** The first day from today on with something to book in the area, or null. */
export const firstDay = (items, area, today) => inArea(items, area).map(x => dayKey(new Date(x.start_datetime))).filter(k => k >= today).sort()[0] ?? null;

/**
 * Chips, week, days and the sessions of `date`. Sessions are radio buttons (data-session) unless `link` gives each one an
 * address. An item without options (the offline preview) shows no availability or price.
 */
export function weekPicker({ items, policy, date, area = '', selectedId = null, link = null, today = dayKey(new Date()) }) {
  const start = mondayOf(date), end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const listed = inArea(items, area);
  const byDay = key => listed.filter(e => dayKey(new Date(e.start_datetime)) === key);
  const list = byDay(date);
  const label = `${dayNum.format(at(start))}${monthShort.format(at(start)) !== monthShort.format(at(end)) ? ' ' + monthShort.format(at(start)) : ''} – ${dayNum.format(at(end))} ${monthShort.format(at(end))}`;
  const tabs = `<div class="booking-areas" role="group" aria-label="Ne ayırtmak istiyorsun?">${[['', 'Hepsi'], ...Object.entries(AREAS).map(([k, a]) => [k, a.label])]
    .map(([k, l]) => `<button data-area="${k}" aria-pressed="${k === area}">${esc(l)}</button>`).join('')}</div>`;
  const session = e => {
    const [kind, text] = e.options ? availability(e, policy) : ['ok', ''], price = cheapest(e), selected = !link && e.id_event === selectedId;
    const disabled = kind === 'mine' || kind === 'soon';
    const inner = `<span class="booking-clock" aria-hidden="true">◷</span>
        <span class="booking-session-main"><strong>${esc(range(e))}</strong><span>${esc(e.event_title)} · ${esc(wholeRoom(e) ? 'Odanın tamamı' : TYPE[e.event_type] ?? e.event_type)}</span>${text ? `<em class="avail-${kind}">${esc(text)}</em>` : ''}</span>
        <span class="booking-price">${price ? esc(money(price.finalPrice, price.currency)) : ''}${price && Number(price.discountAmount) > 0 ? `<s>${esc(money(price.listAmount, price.currency))}</s>` : ''}</span>
        <span class="booking-radio" aria-hidden="true">${link ? '›' : selected ? '✓' : ''}</span>`;
    return link ? `<a class="booking-session" href="${esc(link(e))}">${inner}</a>`
      : `<button class="booking-session${selected ? ' selected' : ''}" role="radio" aria-checked="${selected}" data-session="${e.id_event}" ${disabled ? 'aria-disabled="true"' : ''}>${inner}</button>`;
  };
  return tabs + `
    <div class="booking-week"><button class="booking-arrow" data-week="-7" ${start <= mondayOf(today) ? 'disabled' : ''} aria-label="Önceki hafta">‹</button><strong>${esc(label)}</strong><button class="booking-arrow" data-week="7" aria-label="Sonraki hafta">›</button></div>
    <div class="booking-days" role="group" aria-label="Gün">${days.map(k => {
      const past = k < today, has = byDay(k).length > 0, d = at(k);
      return `<button class="booking-day${k === date ? ' selected' : ''}" data-day="${k}" ${past ? 'disabled' : ''} aria-pressed="${k === date}" aria-label="${esc(dayTitle(k))}${has ? ', seans var' : ''}"><small>${esc(shortWd.format(d))}</small><strong>${dayNum.format(d)}</strong>${has ? '<i aria-label="seans var"></i>' : ''}</button>`;
    }).join('')}</div>
    <h2 class="booking-day-title" id="seanslar">${esc(dayTitle(date))}</h2>
    ${list.length ? `<div class="booking-sessions"${link ? '' : ' role="radiogroup" aria-label="Seanslar"'}>${list.map(session).join('')}</div>`
      : '<div class="booking-empty"><p>Bu gün için seans yok.</p><p>Noktalı günlerde seans var; başka bir gün seç.</p></div>'}`;
}
