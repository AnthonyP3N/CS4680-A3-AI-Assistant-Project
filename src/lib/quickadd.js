// Turns "Physics lab report 90m fri high #homework" into a task.
// Pure function: tested in test/quickadd.test.js, used by the Today page.

import { addDays, weekdayIndex } from './dates.js';
import { DEFAULT_CATEGORIES, cleanCategory, matchCategory } from './categories.js';

const DAYS = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Next date (today or later) that falls on weekday `idx` (0 = Monday). */
function nextWeekday(today, idx) {
  const delta = (idx - weekdayIndex(today) + 7) % 7;
  return addDays(today, delta);
}

function parseDuration(word) {
  // 45m, 45min, 2h, 1.5h, 2hr, 1h30, 1h30m
  const hm = /^(\d+)h(\d{1,2})m?$/.exec(word);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const m = /^(\d+(?:\.\d+)?)(m|min|mins|minutes?|h|hr|hrs|hours?)$/.exec(word);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mins = m[2].startsWith('h') ? n * 60 : n;
  const rounded = Math.round(mins);
  return rounded >= 1 && rounded <= 1440 ? rounded : null;
}

/**
 * Returns { title, estimateMinutes, dueDate, dueText, priority, category, tokens }.
 * `#tag` matches a known category when it can ("#study" → Studying),
 * otherwise it becomes a new one. `categories` defaults to the built-in list.
 */
export function parseQuickAdd(text, today, categories = DEFAULT_CATEGORIES) {
  const out = { title: '', estimateMinutes: null, dueDate: null, dueText: null, priority: null, category: null };
  const rest = [];
  for (const raw of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const w = raw.toLowerCase();
    if (out.estimateMinutes === null) {
      const d = parseDuration(w);
      if (d !== null) { out.estimateMinutes = d; continue; }
    }
    if (!out.dueDate) {
      if (w === 'today' || w === 'tonight') { out.dueDate = today; out.dueText = 'today'; continue; }
      if (w === 'tomorrow' || w === 'tmr' || w === 'tmrw') { out.dueDate = addDays(today, 1); out.dueText = 'tomorrow'; continue; }
      if (w in DAYS) {
        out.dueDate = nextWeekday(today, DAYS[w]);
        out.dueText = out.dueDate === today ? 'today' : DAY_NAMES[DAYS[w]];
        continue;
      }
    }
    if (!out.priority) {
      if (['high', '!high', '!', 'urgent', '!!'].includes(w)) { out.priority = 'high'; continue; }
      if (['low', '!low'].includes(w)) { out.priority = 'low'; continue; }
      if (['med', 'medium', '!med'].includes(w)) { out.priority = 'medium'; continue; }
    }
    if (!out.category && w.startsWith('#') && w.length > 1) {
      const c = raw.slice(1).replace(/[-_]+/g, ' ');
      out.category = matchCategory(c, categories) || cleanCategory(c);
      continue;
    }
    rest.push(raw);
  }
  out.title = rest.join(' ').slice(0, 120);
  return out;
}
