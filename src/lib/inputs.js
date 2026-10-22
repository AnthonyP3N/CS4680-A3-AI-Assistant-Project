// Validation for data coming from the browser. Returns { value } or { error }.

import { isDateStr, isValidTimeZone, timeToMinutes } from './dates.js';

export const PRIORITIES = ['low', 'medium', 'high'];
export const STATUSES = ['todo', 'in_progress', 'done'];
// About 1,700 words. All data shares one browser storage area (roughly 5 MB
// per site), so a cap keeps a few very long entries from filling it.
export const JOURNAL_MAX_CHARS = 10000;
/** Characters sent to the AI per entry when the user includes their journal. */
export const JOURNAL_AI_CHARS = 400;

export const JOURNAL_TAGS = ['win', 'stuck', 'distraction', 'idea', 'reflection'];
export const ENERGY_LEVELS = ['low', 'ok', 'high'];
// Older entries stored energy as tags; they are converted on save and import.
const LEGACY_ENERGY_TAGS = { 'energy-low': 'low', 'energy-high': 'high' };

const str = (v) => (typeof v === 'string' ? v.trim() : v);

function intIn(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** partial=true validates only the fields present (for PATCH). */
export function validateTask(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has('title')) {
    const title = str(body.title);
    if (!title || typeof title !== 'string') return { error: 'Title is required.' };
    if (title.length > 120) return { error: 'Title must be 120 characters or fewer.' };
    out.title = title;
  }
  if (!partial || has('category')) {
    const c = str(body.category) || 'Other';
    if (typeof c !== 'string' || c.length > 30) return { error: 'Category must be 30 characters or fewer.' };
    out.category = c;
  }
  if (!partial || has('priority')) {
    const p = body.priority || 'medium';
    if (!PRIORITIES.includes(p)) return { error: 'Priority must be low, medium, or high.' };
    out.priority = p;
  }
  if (!partial || has('dueDate')) {
    const d = body.dueDate || null;
    if (d !== null && !isDateStr(d)) return { error: 'Due date must be a valid date.' };
    out.dueDate = d;
  }
  if (!partial || has('estimateMinutes')) {
    const e = body.estimateMinutes;
    if (e === null || e === undefined || e === '') out.estimateMinutes = null;
    else {
      const n = intIn(e, 5, 1440);
      if (n === null) return { error: 'Estimate must be a whole number between 5 and 1440 minutes.' };
      out.estimateMinutes = n;
    }
  }
  if (has('status')) {
    if (!STATUSES.includes(body.status)) return { error: 'Invalid status.' };
    out.status = body.status;
  } else if (!partial) out.status = 'todo';
  if (has('notes') || !partial) {
    const n = str(body.notes) || '';
    if (typeof n !== 'string' || n.length > 1000) return { error: 'Notes must be 1000 characters or fewer.' };
    out.notes = n;
  }
  if (has('parentId')) out.parentId = typeof body.parentId === 'string' ? body.parentId : null;
  return { value: out };
}

export function validateJournal(body = {}) {
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length > JOURNAL_MAX_CHARS) {
    return { error: `This entry is too long to save. Entries can be up to ${JOURNAL_MAX_CHARS.toLocaleString('en-US')} characters (about 1,700 words). Shorten it or split it into two entries.` };
  }
  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  let energy = ENERGY_LEVELS.includes(body.energy) ? body.energy : null;
  for (const t of rawTags) if (!energy && LEGACY_ENERGY_TAGS[t]) energy = LEGACY_ENERGY_TAGS[t];
  const tags = [...new Set(rawTags.filter((t) => JOURNAL_TAGS.includes(t)))];
  const taskId = typeof body.taskId === 'string' ? body.taskId : null;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  // A quick check-in after a session can be just energy or tags, with no words.
  if (!text && !energy && !tags.length) return { error: 'Write something, or pick your energy or a tag, before saving.' };
  return { value: { body: text, tags, energy, taskId, sessionId } };
}

/** Bring an entry from an older version (energy stored as a tag) up to date. */
export function upgradeJournalEntry(e) {
  if (!e || typeof e !== 'object') return e;
  const tags = Array.isArray(e.tags) ? e.tags : [];
  let energy = ENERGY_LEVELS.includes(e.energy) ? e.energy : null;
  for (const t of tags) if (!energy && LEGACY_ENERGY_TAGS[t]) energy = LEGACY_ENERGY_TAGS[t];
  return { ...e, energy, tags: tags.filter((t) => !LEGACY_ENERGY_TAGS[t]) };
}

export function validatePreferences(body = {}) {
  const out = {};
  if (body.timezone !== undefined) {
    if (!isValidTimeZone(body.timezone)) return { error: 'Unknown time zone.' };
    out.timezone = body.timezone;
  }
  if (body.dayStart !== undefined) {
    if (timeToMinutes(body.dayStart) === null) return { error: 'Start time must look like 09:00.' };
    out.dayStart = body.dayStart;
  }
  if (body.availableMinutes !== undefined) {
    const n = intIn(body.availableMinutes, 15, 960);
    if (n === null) return { error: 'Available time must be between 15 and 960 minutes.' };
    out.availableMinutes = n;
  }
  if (body.breakEveryMinutes !== undefined) {
    const n = intIn(body.breakEveryMinutes, 15, 180);
    if (n === null) return { error: 'Break interval must be between 15 and 180 minutes.' };
    out.breakEveryMinutes = n;
  }
  if (body.reflectAfterSession !== undefined) {
    if (typeof body.reflectAfterSession !== 'boolean') return { error: 'Invalid reflection setting.' };
    out.reflectAfterSession = body.reflectAfterSession;
  }
  if (body.breakMinutes !== undefined) {
    const n = intIn(body.breakMinutes, 0, 60);
    if (n === null) return { error: 'Break length must be between 0 and 60 minutes.' };
    out.breakMinutes = n;
  }
  return { value: out };
}
