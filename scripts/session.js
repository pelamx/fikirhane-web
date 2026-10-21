// Session adapter with two modes:
// - "api": real accounts on the Fikirhane backend (cookie session, server-side authorization).
// - "preview": the original browser-local prototype, used when no API is reachable (e.g. GitHub Pages without a deployed API).
// Client-side state is only a cache for rendering; every privileged decision is made by the server.
import { clubs as previewClubs, events as previewEvents } from './catalog.js';
import { api, apiAvailable } from './api.js';

const KEY = 'fikirhane-member-preview-v1';
const base = new URL('../', import.meta.url);
export const siteUrl = path => new URL(path, base).href;

let currentMode = null;
let state = null;            // session snapshot for rendering
let catalog = { clubs: previewClubs, events: previewEvents };
let readyPromise = null;

const notify = () => window.dispatchEvent(new Event('fikirhane-session'));
export const mode = () => currentMode;
export const getCatalog = () => catalog;
export function getSession() { return state?.active ? structuredClone(state) : null; }

/** Resolves the mode and loads the session (and, in API mode, the live club/event catalog). */
export function ready() {
  readyPromise ??= (async () => {
    currentMode = (await apiAvailable()) ? 'api' : 'preview';
    document.documentElement.dataset.mode = currentMode;
    if (currentMode === 'api') await refresh();
    else state = readPreview();
    notify();
    return currentMode;
  })();
  return readyPromise;
}

// ---------- API mode ----------

const FALLBACK_ART = { category: 'Kulüp', prompt: 'Ortak bir merak, yeni bir sohbet.', words: ['Merhaba.', 'Hoş geldin.'] };
const TYPE_LABELS = { workspace: 'Girişimcilik', language: 'Dil', creative: 'Yaratıcılık', technology: 'Teknoloji', education: 'Eğitim', professional: 'Profesyonel', social: 'Sosyal' };
const tz = 'Europe/Istanbul';
const fmt = opts => new Intl.DateTimeFormat('tr-TR', { timeZone: tz, ...opts });
const dayFmt = fmt({ day: 'numeric' }), monthFmt = fmt({ month: 'long' }), dateFmt = fmt({ day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }), timeFmt = fmt({ hour: '2-digit', minute: '2-digit' });
const time = d => timeFmt.format(d).replace(':', '.');

function mapClub(c) {
  const preset = previewClubs.find(p => p.code === c.club_code);
  return {
    ...FALLBACK_ART, category: TYPE_LABELS[c.club_type] ?? FALLBACK_ART.category, ...preset,
    id: preset?.id ?? c.club_code.toLowerCase(), code: c.club_code, name: c.club_name, description: c.club_description ?? '',
    sourceName: preset?.sourceName ?? c.club_name, sourceUrl: null, memberCount: c.member_count, upcomingEvents: c.upcoming_events,
  };
}

function mapEvent(e, clubList) {
  const start = new Date(e.start_datetime), end = new Date(e.end_datetime);
  const date = dateFmt.format(start);
  const primary = e.clubs.find(c => c.is_primary) ?? e.clubs[0];
  return {
    id: e.id_event, clubId: primary ? clubList.find(c => c.code === primary.club_code)?.id ?? null : null,
    name: e.event_title, description: e.event_description, day: dayFmt.format(start), month: monthFmt.format(start).toLocaleUpperCase('tr'),
    date: date.replace(/^(\S+) (\S+) (\S+) (\S+)$/, '$1 $2 $3, $4').replace(/^(\d+ \S+ \d+) (\S+)$/, '$1, $2'),
    time: `${time(start)} — ${time(end)}`, location: [...new Set(e.options.map(o => o.location_name))].join(' / '),
    sourceUrl: null, options: e.options, booking: e.my_booking,
  };
}

async function refresh() {
  let me = null;
  try { me = await api('/me'); } catch (err) { if (err.status !== 401) throw err; }
  const [clubRes, eventRes] = await Promise.all([api('/clubs'), api('/events')]);
  const clubList = clubRes.items.map(mapClub);
  catalog = { clubs: clubList, events: eventRes.items.map(e => mapEvent(e, clubList)) };
  if (!me) { state = null; return; }
  const bookings = {};
  for (const e of catalog.events) if (e.booking) bookings[e.id] = e.booking;
  state = {
    version: 1, active: true, role: 'member', mode: 'api',
    profile: { name: me.user.first_name, lastName: me.user.last_name, bio: me.user.bio ?? '', email: me.user.email },
    membership: me.membership, roles: me.roles,
    clubIds: me.clubs.map(c => clubList.find(x => x.code === c.club_code)?.id).filter(Boolean),
    eventIds: Object.keys(bookings), bookings,
  };
}

async function apiAction(fn) { await fn(); await refresh(); notify(); return getSession(); }

export async function register({ firstName, lastName, email, password, clubIds = [] }) {
  const params = new URLSearchParams(location.search);
  const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].filter(k => params.get(k)).map(k => [k, params.get(k).slice(0, 100)]));
  const clubCodes = clubIds.map(id => catalog.clubs.find(c => c.id === id)?.code).filter(Boolean);
  return apiAction(() => api('/auth/register', { method: 'POST', body: {
    first_name: firstName, last_name: lastName, email, password, club_codes: clubCodes,
    ...(Object.keys(utm).length ? { acquisition: utm } : {}),
  } }));
}
export const login = (email, password) => apiAction(() => api('/auth/login', { method: 'POST', body: { email, password } }));

export async function applyForMembership(code, motivation) {
  return apiAction(() => api('/me/membership-applications', { method: 'POST', body: { membership_type_code: code, motivation_text: motivation } }));
}
export async function membershipStatus() { return currentMode === 'api' ? api('/me/membership') : null; }

/** Books an event option, or cancels the existing booking when no option is given. */
export async function bookEvent(eventId, optionId) {
  return apiAction(() => api('/bookings', { method: 'POST', body: { event_id: eventId, ...(optionId ? { event_option_id: optionId } : {}) } }));
}
export async function cancelBooking(bookingId) {
  return apiAction(() => api(`/me/bookings/${bookingId}/cancel`, { method: 'POST', body: {} }));
}

// ---------- shared entry points (both modes) ----------

export async function signOut() {
  if (currentMode === 'api') { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); state = null; notify(); return; }
  if (state) persistPreview({ ...state, active: false });
}

export async function saveProfile(name, bio) {
  if (currentMode === 'api') return apiAction(() => api('/me', { method: 'PATCH', body: { first_name: name, bio: bio || null } }));
  const current = getSession(); if (!current) throw new Error('Üye alanına tekrar giriş yap.');
  return persistPreview({ ...current, profile: { name, bio } });
}

export async function toggleClub(id) {
  if (currentMode === 'api') {
    const club = catalog.clubs.find(c => c.id === id); if (!club) throw new Error('Kulüp bulunamadı.');
    const joined = state?.clubIds.includes(id);
    return apiAction(() => api(`/clubs/${club.code}/membership`, { method: joined ? 'DELETE' : 'PUT' }));
  }
  const current = getSession(); if (!current || !previewClubs.some(c => c.id === id)) throw new Error('Kulüp bulunamadı.');
  return persistPreview({ ...current, clubIds: current.clubIds.includes(id) ? current.clubIds.filter(c => c !== id) : [...current.clubIds, id] });
}

export async function toggleEvent(id) {
  if (currentMode === 'api') {
    const booking = state?.bookings[id];
    return booking ? cancelBooking(booking.id_booking) : bookEvent(id);
  }
  const current = getSession(); if (!current || !previewEvents.some(e => e.id === id)) throw new Error('Buluşma bulunamadı.');
  return persistPreview({ ...current, eventIds: current.eventIds.includes(id) ? current.eventIds.filter(e => e !== id) : [...current.eventIds, id] });
}

// ---------- preview mode (browser-local, never credentials) ----------

function clean(value) {
  if (!value || value.version !== 1 || !value.profile || typeof value.profile.name !== 'string' || !value.profile.name.trim()) return null;
  return { version: 1, active: value.active === true, role: 'member', mode: 'preview', profile: { name: value.profile.name.trim().slice(0, 50), bio: typeof value.profile.bio === 'string' ? value.profile.bio.slice(0, 240) : '' }, clubIds: [...new Set(Array.isArray(value.clubIds) ? value.clubIds.filter(id => previewClubs.some(c => c.id === id)) : [])], eventIds: [...new Set(Array.isArray(value.eventIds) ? value.eventIds.filter(id => previewEvents.some(e => e.id === id)) : [])], bookings: {} };
}
function readPreview() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return null; } }
function persistPreview(next) { const serialized = clean(next); if (!serialized) throw new Error('Geçerli bir ad gir.'); localStorage.setItem(KEY, JSON.stringify(serialized)); state = serialized; notify(); return getSession(); }
export function getSavedPreview() { return currentMode === 'preview' && state ? structuredClone(state) : null; }
export function startPreview(name, clubIds = []) { return persistPreview({ version: 1, active: true, role: 'member', profile: { name, bio: '' }, clubIds, eventIds: [] }); }
export function resumePreview() { if (!state) return null; return persistPreview({ ...state, active: true }); }
export function clearPreview() { localStorage.removeItem(KEY); state = null; notify(); }

// Accept only internal, known views and catalog IDs; never redirect to a user-supplied URL.
export function destination(params = new URLSearchParams(location.search)) { const club = params.get('club'); if (catalog.clubs.some(c => c.id === club)) return 'member/#kulup/' + club; if (params.get('event') && catalog.events.some(e => e.id === params.get('event'))) return 'member/#bulusmalar'; const view = params.get('view'); if (view === 'yonetim') return 'admin/'; return 'member/#' + (['anasayfa','kesfet','kuluplerim','bulusmalar','profil'].includes(view) ? view : 'anasayfa'); }
// Server-side changes (approvals, admin cancellations, other tabs) show up when the user returns to the page.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && currentMode === 'api') refresh().then(notify).catch(() => {}); });
window.addEventListener('storage', event => { if (currentMode === 'preview' && (event.key === KEY || event.key === null)) { state = readPreview(); notify(); } });
