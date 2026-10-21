// FocusFlow's "server", running in the visitor's browser.
//
// It keeps the same routes the Express API used to have (GET /api/bootstrap,
// POST /api/tasks, ...), so the views talk to it exactly as they did before.
// Data lives in localStorage; AI calls go straight from the browser to the
// provider the visitor chose, using the visitor's own API key.

import { emptyDb, looksLikeFocusFlowData, newId, normalizeDb } from './lib/db.js';
import { isDateStr, localDate, timeToMinutes } from './lib/dates.js';
import { actualMinutesByTask, computeStats, sessionSeconds } from './lib/stats.js';
import { validateJournal, validatePreferences, validateTask } from './lib/inputs.js';
import { PROMPT_VERSION, generateBreakdown, generatePlan, generateReview, providerInfo } from './lib/ai.js';
import { PROVIDERS, ProviderError, callModel, resolveProvider } from './lib/providers.js';
import { buildSampleDb } from './lib/seed.js';

const DATA_KEY = 'focusflow:data:v1';
const AI_KEY = 'focusflow:ai:v1';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ------------------------------------------------------------- storage ---

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // some privacy modes throw on access
  }
}

class LocalStore {
  constructor() {
    this.persistent = !!storage();
    this.db = this.load();
  }

  load() {
    const ls = storage();
    if (!ls) return emptyDb();
    try {
      const raw = ls.getItem(DATA_KEY);
      return raw ? normalizeDb(JSON.parse(raw)) : emptyDb();
    } catch {
      return emptyDb();
    }
  }

  save() {
    const ls = storage();
    if (!ls) return; // still works for this visit, just isn't kept
    try {
      ls.setItem(DATA_KEY, JSON.stringify(this.db));
    } catch {
      throw new HttpError(507, 'Your browser’s storage for this site is full. Export your data, then delete old journal entries or suggestions.');
    }
  }

  /** Run a mutation and save it. If anything throws, nothing changes. */
  update(fn) {
    const snapshot = structuredClone(this.db);
    try {
      const result = fn(this.db);
      this.save();
      return result;
    } catch (err) {
      this.db = snapshot;
      throw err;
    }
  }

  replace(db) {
    const previous = this.db;
    this.db = db;
    try {
      this.save();
    } catch (err) {
      this.db = previous;
      throw err;
    }
  }
}

export const store = new LocalStore();

/** Keep several open tabs in sync. */
export function onExternalChange(callback) {
  globalThis.addEventListener?.('storage', (e) => {
    if (e.key === DATA_KEY) {
      store.db = store.load();
      callback();
    }
  });
}

// -------------------------------------------------------- AI settings ---
// Stored separately from the data so the key is never part of an export.

export function getAiSettings() {
  try {
    const raw = storage()?.getItem(AI_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { provider: parsed.provider || 'gemini', key: parsed.key || '', model: parsed.model || '' };
  } catch {
    return { provider: 'gemini', key: '', model: '' };
  }
}

export function saveAiSettings({ provider, key, model }) {
  if (!PROVIDERS[provider]) throw new HttpError(400, 'Choose an AI provider.');
  const clean = { provider, key: String(key || '').trim(), model: String(model || '').trim() };
  if (!clean.key) throw new HttpError(400, 'Paste an API key first.');
  if (clean.key.length > 300 || /\s/.test(clean.key)) throw new HttpError(400, 'That doesn’t look like an API key. Copy it again without spaces.');
  try {
    storage()?.setItem(AI_KEY, JSON.stringify(clean));
  } catch {
    throw new HttpError(507, 'Your browser wouldn’t save the key. Check that site data is allowed.');
  }
  return clean;
}

export function clearAiSettings() {
  const { provider, model } = getAiSettings();
  try {
    storage()?.setItem(AI_KEY, JSON.stringify({ provider, key: '', model }));
  } catch { /* ignore */ }
}

const currentProvider = () => resolveProvider(getAiSettings());

/** One tiny request to confirm the key and model work. */
export async function testConnection(settings) {
  const provider = resolveProvider(settings);
  if (provider.name === 'demo') throw new HttpError(400, 'Paste an API key first.');
  const { text } = await callModel(provider, 'Reply with JSON only.', [{ role: 'user', content: 'Return {"ok": true}' }]);
  if (!/ok/i.test(text)) throw new ProviderError('The model answered, but not as expected. Try a different model.');
  return { ok: true, label: provider.label, model: provider.model };
}

// ------------------------------------------------------------- helpers ---

const now = () => new Date().toISOString();
const today = () => localDate(new Date(), store.db.preferences.timezone);

function findOr404(list, id, what) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new HttpError(404, `${what} not found.`);
  return item;
}

function decorateTasks(db) {
  const actual = actualMinutesByTask(db.sessions);
  return db.tasks.map((t) => ({ ...t, actualMinutes: actual[t.id] || 0 }));
}

function activeSession(db) {
  const s = db.sessions.find((x) => x.status === 'running' || x.status === 'paused');
  if (!s) return null;
  const task = db.tasks.find((t) => t.id === s.taskId);
  return { ...s, taskTitle: task?.title || s.taskTitleSnapshot, elapsedSeconds: Math.round(sessionSeconds(s)) };
}

function savePlanRevision(kind, result, extra = {}) {
  const rev = {
    id: newId('rev'),
    kind,
    createdAt: now(),
    provider: { name: result.provider.name, label: result.provider.label, model: result.provider.model },
    promptVersion: PROMPT_VERSION,
    input: result.input,
    output: result.output,
    attempts: result.attempts,
    status: kind === 'review' ? 'info' : 'proposed',
    ...extra,
  };
  store.update((db) => {
    db.plans.push(rev);
    if (db.plans.length > 60) db.plans = db.plans.slice(-60);
  });
  return rev;
}

// -------------------------------------------------------------- routes ---

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/bootstrap', () => {
  const db = store.db;
  return {
    today: today(),
    provider: providerInfo(currentProvider()),
    persistent: store.persistent,
    preferences: db.preferences,
    categories: db.categories,
    tasks: decorateTasks(db),
    activeSession: activeSession(db),
    recentSessions: db.sessions.filter((s) => s.status === 'stopped').slice(-40).reverse(),
    journal: [...db.journal].reverse().slice(0, 200),
    plans: [...db.plans].reverse().slice(0, 25),
    schedules: db.schedules,
  };
});

route('PUT', '/api/preferences', (p, body) => {
  const { value, error } = validatePreferences(body);
  if (error) throw new HttpError(400, error);
  store.update((db) => { db.preferences = { ...db.preferences, ...value }; });
  return store.db.preferences;
});

// Tasks
route('POST', '/api/tasks', (p, body) => {
  const { value, error } = validateTask(body);
  if (error) throw new HttpError(400, error);
  const task = { id: newId('task'), ...value, parentId: value.parentId || null, createdAt: now(), completedAt: null };
  store.update((db) => {
    db.tasks.push(task);
    if (task.category && !db.categories.includes(task.category)) db.categories.push(task.category);
  });
  return task;
});

route('PATCH', '/api/tasks/:id', (p, body) => {
  const { value, error } = validateTask(body, { partial: true });
  if (error) throw new HttpError(400, error);
  return store.update((db) => {
    const t = findOr404(db.tasks, p.id, 'Task');
    if (value.status && value.status !== t.status) t.completedAt = value.status === 'done' ? now() : null;
    Object.assign(t, value, { updatedAt: now() });
    if (t.category && !db.categories.includes(t.category)) db.categories.push(t.category);
    return t;
  });
});

route('DELETE', '/api/tasks/:id', (p) => {
  store.update((db) => {
    const t = findOr404(db.tasks, p.id, 'Task');
    if (db.sessions.some((s) => s.taskId === t.id && s.status !== 'stopped')) {
      throw new HttpError(409, 'Stop the running timer for this task before deleting it.');
    }
    db.tasks = db.tasks.filter((x) => x.id !== t.id);
    // Tracked time really happened, so sessions are kept with a title snapshot.
    for (const s of db.sessions) if (s.taskId === t.id) { s.taskTitleSnapshot = t.title; s.categorySnapshot = t.category; }
  });
  return null;
});

// Sessions
route('POST', '/api/sessions/start', (p, body) => {
  store.update((db) => {
    if (db.sessions.some((s) => s.status === 'running' || s.status === 'paused')) {
      throw new HttpError(409, 'A focus session is already active. Stop it before starting another.');
    }
    const task = findOr404(db.tasks, body?.taskId, 'Task');
    if (task.status === 'todo') task.status = 'in_progress';
    db.sessions.push({
      id: newId('ses'), taskId: task.id, taskTitleSnapshot: task.title, categorySnapshot: task.category,
      status: 'running', source: 'timer', startedAt: now(), lastResumedAt: now(), accumulatedSeconds: 0,
      endedAt: null, durationSeconds: null, note: '',
    });
  });
  return activeSession(store.db);
});

function sessionAction(id, fn) {
  return store.update((db) => {
    const s = findOr404(db.sessions, id, 'Session');
    fn(s, db);
    return s;
  });
}

route('POST', '/api/sessions/:id/pause', (p) => {
  sessionAction(p.id, (s) => {
    if (s.status !== 'running') throw new HttpError(409, 'Session is not running.');
    s.accumulatedSeconds = sessionSeconds(s);
    s.status = 'paused';
    s.lastResumedAt = null;
  });
  return activeSession(store.db);
});

route('POST', '/api/sessions/:id/resume', (p) => {
  sessionAction(p.id, (s) => {
    if (s.status !== 'paused') throw new HttpError(409, 'Session is not paused.');
    s.status = 'running';
    s.lastResumedAt = now();
  });
  return activeSession(store.db);
});

route('POST', '/api/sessions/:id/stop', (p, body) => sessionAction(p.id, (s, db) => {
  if (s.status === 'stopped') throw new HttpError(409, 'Session already stopped.');
  s.durationSeconds = Math.round(sessionSeconds(s));
  s.status = 'stopped';
  s.endedAt = now();
  s.lastResumedAt = null;
  s.note = typeof body?.note === 'string' ? body.note.slice(0, 500) : '';
  if (body?.completeTask) {
    const t = db.tasks.find((x) => x.id === s.taskId);
    if (t) { t.status = 'done'; t.completedAt = now(); }
  }
}));

route('POST', '/api/sessions/:id/discard', (p) => {
  store.update((db) => {
    const s = findOr404(db.sessions, p.id, 'Session');
    if (s.status === 'stopped') throw new HttpError(409, 'Only an active session can be discarded.');
    db.sessions = db.sessions.filter((x) => x.id !== s.id);
  });
  return null;
});

// Log time that was not captured with the timer.
route('POST', '/api/sessions/manual', (p, body) => {
  const minutes = Number(body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) throw new HttpError(400, 'Minutes must be a whole number between 1 and 720.');
  const endedAt = body?.endedAt ? new Date(body.endedAt) : new Date();
  if (Number.isNaN(endedAt.getTime()) || endedAt.getTime() > Date.now() + 60_000) throw new HttpError(400, 'End time must be a valid time that is not in the future.');
  return store.update((db) => {
    const task = findOr404(db.tasks, body?.taskId, 'Task');
    if (task.status === 'todo') task.status = 'in_progress';
    const s = {
      id: newId('ses'), taskId: task.id, taskTitleSnapshot: task.title, categorySnapshot: task.category,
      status: 'stopped', source: 'manual',
      startedAt: new Date(endedAt.getTime() - minutes * 60_000).toISOString(), endedAt: endedAt.toISOString(),
      accumulatedSeconds: minutes * 60, durationSeconds: minutes * 60, lastResumedAt: null,
      note: typeof body?.note === 'string' ? body.note.slice(0, 500) : '',
    };
    db.sessions.push(s);
    if (body?.completeTask) { task.status = 'done'; task.completedAt = now(); }
    return s;
  });
});

route('DELETE', '/api/sessions/:id', (p) => {
  store.update((db) => {
    findOr404(db.sessions, p.id, 'Session');
    db.sessions = db.sessions.filter((x) => x.id !== p.id);
  });
  return null;
});

// Journal
route('POST', '/api/journal', (p, body) => {
  const { value, error } = validateJournal(body);
  if (error) throw new HttpError(400, error);
  const entry = { id: newId('jrn'), ...value, createdAt: now() };
  store.update((db) => { db.journal.push(entry); });
  return entry;
});

route('DELETE', '/api/journal/:id', (p) => {
  store.update((db) => {
    findOr404(db.journal, p.id, 'Entry');
    db.journal = db.journal.filter((j) => j.id !== p.id);
  });
  return null;
});

// Stats
route('GET', '/api/stats', (p, body, query) => {
  const range = ['day', 'week', 'month'].includes(query.get('range')) ? query.get('range') : 'week';
  const date = isDateStr(query.get('date')) ? query.get('date') : today();
  return computeStats(store.db, { range, date });
});

// AI
route('POST', '/api/ai/plan', async (p, body) => {
  const date = isDateStr(body?.date) ? body.date : today();
  const dayStart = body?.dayStart && timeToMinutes(body.dayStart) !== null ? body.dayStart : undefined;
  const available = body?.availableMinutes ? Number(body.availableMinutes) : undefined;
  if (available !== undefined && (!Number.isInteger(available) || available < 15 || available > 960)) {
    throw new HttpError(400, 'Available time must be between 15 and 960 minutes.');
  }
  if (dayStart && available && timeToMinutes(dayStart) + available > 24 * 60) {
    throw new HttpError(400, 'That window runs past midnight. Start earlier or shorten it.');
  }
  const result = await generatePlan(store.db, { date, dayStart, availableMinutes: available, userNote: body?.userNote, taskIds: body?.taskIds }, currentProvider());
  return savePlanRevision('plan', result, { date });
});

route('POST', '/api/ai/review', async (p, body) => {
  const range = ['day', 'week', 'month'].includes(body?.range) ? body.range : 'week';
  const date = isDateStr(body?.date) ? body.date : today();
  const includeJournal = body?.includeJournal === true;
  const result = await generateReview(store.db, { range, date, includeJournal }, currentProvider());
  return savePlanRevision('review', result, { range, date, includeJournal });
});

route('POST', '/api/ai/breakdown', async (p, body) => {
  const task = findOr404(store.db.tasks, body?.taskId, 'Task');
  const result = await generateBreakdown(task, currentProvider());
  return savePlanRevision('breakdown', result, { taskId: task.id });
});

// The user decides what happens with AI output. Nothing changes until here.
route('POST', '/api/plans/:id/accept', (p, body) => store.update((db) => {
  const r = findOr404(db.plans, p.id, 'Suggestion');
  if (r.kind === 'plan') {
    const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
    const clean = [];
    for (const b of blocks) {
      const start = timeToMinutes(b?.start);
      const dur = Number(b?.durationMinutes);
      if (start === null || !Number.isInteger(dur) || dur < 5 || dur > 240) throw new HttpError(400, 'Each block needs a valid start time and duration (5-240 minutes).');
      if (b.type !== 'break' && !db.tasks.some((t) => t.id === b.taskId)) throw new HttpError(400, 'A block refers to a task that no longer exists.');
      clean.push({
        type: b.type === 'break' ? 'break' : 'task', taskId: b.type === 'break' ? null : b.taskId,
        title: String(b.title || '').slice(0, 120), start: b.start, durationMinutes: dur, reason: String(b.reason || '').slice(0, 240),
      });
    }
    if (!clean.length) throw new HttpError(400, 'Select at least one block to accept.');
    clean.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    const prev = db.schedules[r.date];
    db.schedules[r.date] = { planId: r.id, blocks: clean, acceptedAt: now(), version: (prev?.version || 0) + 1 };
    r.status = clean.length === r.output.schedule.length ? 'accepted' : 'partially accepted';
    r.accepted = clean;
    r.edited = clean.some((b) => !r.output.schedule.some((o) => o.start === b.start && o.durationMinutes === b.durationMinutes && o.taskId === b.taskId));
  } else if (r.kind === 'breakdown') {
    const parent = findOr404(db.tasks, r.taskId, 'Task');
    const steps = Array.isArray(body?.steps) ? body.steps : [];
    if (!steps.length) throw new HttpError(400, 'Select at least one step to add.');
    const created = [];
    for (const s of steps.slice(0, 8)) {
      const { value, error } = validateTask({
        title: s.title, category: parent.category, priority: parent.priority, dueDate: parent.dueDate,
        estimateMinutes: s.estimateMinutes, notes: s.doneWhen ? `Done when: ${s.doneWhen}` : '',
      });
      if (error) throw new HttpError(400, `Step "${s.title}": ${error}`);
      const task = { id: newId('task'), ...value, parentId: parent.id, createdAt: now(), completedAt: null };
      db.tasks.push(task);
      created.push(task.id);
    }
    r.status = created.length === r.output.steps.length ? 'accepted' : 'partially accepted';
    r.createdTaskIds = created;
  } else {
    throw new HttpError(400, 'Reviews do not need to be accepted.');
  }
  r.decidedAt = now();
  return r;
}));

route('POST', '/api/plans/:id/reject', (p) => store.update((db) => {
  const r = findOr404(db.plans, p.id, 'Suggestion');
  r.status = 'rejected';
  r.decidedAt = now();
  return r;
}));

route('DELETE', '/api/schedules/:date', (p) => {
  store.update((db) => { delete db.schedules[p.date]; });
  return null;
});

// Backup
route('GET', '/api/export', () => structuredClone(store.db));

route('POST', '/api/import', (p, body) => {
  if (!looksLikeFocusFlowData(body?.data)) {
    throw new HttpError(400, 'That file isn’t a FocusFlow export. Choose a file made with “Export my data”.');
  }
  const db = normalizeDb(body.data);
  db.preferences.timezone = store.db.preferences.timezone;
  store.replace(db);
  return { ok: true, tasks: db.tasks.length, sessions: db.sessions.length, journal: db.journal.length };
});

route('POST', '/api/demo/seed', () => {
  store.replace(buildSampleDb(store.db.preferences.timezone, today()));
  return { ok: true };
});

route('POST', '/api/demo/reset', () => {
  const db = emptyDb();
  db.preferences.timezone = store.db.preferences.timezone;
  store.replace(db);
  return { ok: true };
});

// ------------------------------------------------------------ dispatch ---

/** Handle a request the way the old Express server did. Returns parsed JSON or null. */
export async function handle(method, path, body) {
  const url = new URL(path, 'http://focusflow.local');
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    // Work on a copy so callers can't accidentally mutate stored data.
    const result = await r.handler(params, body === undefined ? undefined : structuredClone(body), url.searchParams);
    return result === undefined || result === null ? null : structuredClone(result);
  }
  throw new HttpError(404, 'Not found.');
}
