// Prototype adapter, not authentication. Never store credentials or sensitive data here.
// A future API adapter must perform authentication and role authorization on the server.
import { clubs, events } from './catalog.js';
const KEY = 'fikirhane-member-preview-v1';
const base = new URL('../', import.meta.url);
export const siteUrl = path => new URL(path, base).href;
let state = read();
function clean(value) {
  if (!value || value.version !== 1 || !value.profile || typeof value.profile.name !== 'string' || !value.profile.name.trim()) return null;
  return { version: 1, active: value.active === true, role: 'member', profile: { name: value.profile.name.trim().slice(0, 50), bio: typeof value.profile.bio === 'string' ? value.profile.bio.slice(0, 240) : '' }, clubIds: [...new Set(Array.isArray(value.clubIds) ? value.clubIds.filter(id => clubs.some(c => c.id === id)) : [])], eventIds: [...new Set(Array.isArray(value.eventIds) ? value.eventIds.filter(id => events.some(e => e.id === id)) : [])] };
}
function read() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return null; } }
export function getSession() { return state?.active ? structuredClone(state) : null; }
export function getSavedPreview() { return state ? structuredClone(state) : null; }
function persist(next) { const serialized = clean(next); if (!serialized) throw new Error('Geçerli bir ad gir.'); localStorage.setItem(KEY, JSON.stringify(serialized)); state = serialized; window.dispatchEvent(new Event('fikirhane-session')); return getSession(); }
export function startPreview(name, clubIds = []) { return persist({ version: 1, active: true, role: 'member', profile: { name, bio: '' }, clubIds, eventIds: [] }); }
export function resumePreview() { if (!state) return null; return persist({ ...state, active: true }); }
export function signOut() { if (state) persist({ ...state, active: false }); }
export function saveProfile(name, bio) { const current = getSession(); if (!current) throw new Error('Üye alanına tekrar giriş yap.'); return persist({ ...current, profile: { name, bio } }); }
export function toggleClub(id) { const current = getSession(); if (!current || !clubs.some(c => c.id === id)) throw new Error('Kulüp bulunamadı.'); return persist({ ...current, clubIds: current.clubIds.includes(id) ? current.clubIds.filter(c => c !== id) : [...current.clubIds, id] }); }
export function toggleEvent(id) { const current = getSession(); if (!current || !events.some(e => e.id === id)) throw new Error('Buluşma bulunamadı.'); return persist({ ...current, eventIds: current.eventIds.includes(id) ? current.eventIds.filter(e => e !== id) : [...current.eventIds, id] }); }
export function clearPreview() { localStorage.removeItem(KEY); state = null; window.dispatchEvent(new Event('fikirhane-session')); }
// Accept only internal, known views and catalog IDs; never redirect to a user-supplied URL.
export function destination(params = new URLSearchParams(location.search)) { const club = params.get('club'); if (clubs.some(c => c.id === club)) return 'member/#kulup/' + club; if (params.get('event') === events[0].id) return 'member/#bulusmalar'; const view = params.get('view'); return 'member/#' + (['anasayfa','kesfet','kuluplerim','bulusmalar','profil'].includes(view) ? view : 'anasayfa'); }
window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) { state = read(); window.dispatchEvent(new Event('fikirhane-session')); } });
