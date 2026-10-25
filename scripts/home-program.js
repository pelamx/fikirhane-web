// The home page's program: the booking page's week picker (scripts/program.js), browsable here; choosing a session opens
// it on the booking page.
import { api, apiAvailable } from './api.js';
import { dayKey, addDays, mondayOf, firstDay, weekPicker } from './program.js';

const root = document.querySelector('#home-program');
const today = dayKey(new Date());
const weeks = new Map();
let live = false, area = '', date = today;

// Without the API (the GitHub Pages preview) a week holds the regular coworking sessions, without availability or price.
function previewWeek(start) {
  const items = [];
  for (let i = 0; i < 5; i++) {
    const k = addDays(start, i);
    for (const [label, from, to] of [['Sabah', '10', '14'], ['Öğleden sonra', '14', '18']])
      items.push({ id_event: null, event_title: `Coworking · ${label}`, event_type: 'workspace', start_datetime: `${k}T${from}:00:00+03:00`, end_datetime: `${k}T${to}:00:00+03:00` });
  }
  return { items, policy: null };
}
function load(start) {
  if (!weeks.has(start)) {
    const from = new Date(`${start}T00:00:00+03:00`), to = new Date(from.getTime() + 7 * 86_400_000);
    weeks.set(start, live ? api(`/events?from=${from.toISOString()}&to=${to.toISOString()}`).then(r => ({ items: r.items, policy: r.policy }))
      .catch(() => { weeks.delete(start); return previewWeek(start); }) : Promise.resolve(previewWeek(start)));
  }
  return weeks.get(start);
}
// Like the booking page: open on the first day with something to book, looking one week ahead if this one is over.
async function openingDay() {
  const start = mondayOf(today);
  return firstDay((await load(start)).items, area, today) ?? firstDay((await load(addDays(start, 7))).items, area, today) ?? today;
}
const link = e => e.id_event
  ? `rezervasyon/?tarih=${dayKey(new Date(e.start_datetime))}&seans=${e.id_event}${area ? `&alan=${area}` : ''}`
  : `rezervasyon/?tarih=${dayKey(new Date(e.start_datetime))}`;

async function render(focus) {
  const { items, policy } = await load(mondayOf(date));
  root.innerHTML = weekPicker({ items, policy, date, area, today, link });
  // The picker is redrawn on every choice; keep keyboard focus on the control that was used.
  if (focus) root.querySelector(focus)?.focus();
}

root.addEventListener('click', async ev => {
  const t = ev.target.closest('button'); if (!t || t.disabled) return;
  if (t.dataset.area !== undefined) { area = t.dataset.area; date = await openingDay(); render(`[data-area="${area}"]`); }
  else if (t.dataset.week) { const d = addDays(mondayOf(date), Number(t.dataset.week)); date = d < today ? today : d; render(`[data-week="${t.dataset.week}"]`); }
  else if (t.dataset.day) { date = t.dataset.day; render(`[data-day="${date}"]`); }
});

(async () => {
  live = await apiAvailable();
  date = await openingDay();
  await render();
})();
