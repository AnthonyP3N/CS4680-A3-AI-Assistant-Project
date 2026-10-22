import { upgradeJournalEntry } from './inputs.js';

// The shape of a FocusFlow database. The whole thing is one small JSON
// document, saved in the visitor's browser (see ../backend.js).

export const DEFAULT_PREFERENCES = Object.freeze({
  timezone: 'America/Los_Angeles',
  dayStart: '09:00',
  availableMinutes: 180,
  breakEveryMinutes: 45,
  breakMinutes: 10,
  reflectAfterSession: true,
});

export const DEFAULT_CATEGORIES = Object.freeze(['Homework', 'Study', 'Work', 'Personal', 'Health']);

export function emptyDb() {
  return {
    version: 1,
    preferences: { ...DEFAULT_PREFERENCES },
    categories: [...DEFAULT_CATEGORIES],
    tasks: [],
    sessions: [],
    journal: [],
    plans: [],      // AI plan/review/breakdown revisions (input snapshot + output + decision)
    schedules: {},  // date -> accepted schedule for that day
  };
}

/** Fill in anything missing from an older or imported database. */
export function normalizeDb(raw) {
  const base = emptyDb();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    ...base,
    ...raw,
    preferences: { ...base.preferences, ...(raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {}) },
    categories: arr(raw.categories).length ? raw.categories.filter((c) => typeof c === 'string') : base.categories,
    tasks: arr(raw.tasks),
    sessions: arr(raw.sessions),
    journal: arr(raw.journal).map(upgradeJournalEntry),
    plans: arr(raw.plans),
    schedules: raw.schedules && typeof raw.schedules === 'object' && !Array.isArray(raw.schedules) ? raw.schedules : {},
  };
}

/** True when an imported file looks like a FocusFlow export. */
export function looksLikeFocusFlowData(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && Array.isArray(raw.tasks) && Array.isArray(raw.sessions) && Array.isArray(raw.journal);
}

export function newId(prefix) {
  const uuid = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid.replace(/-/g, '').slice(0, 12)}`;
}
