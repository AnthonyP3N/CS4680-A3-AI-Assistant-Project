import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Store, emptyDb, newId } from './lib/store.js';
import { isDateStr, localDate, timeToMinutes } from './lib/dates.js';
import { actualMinutesByTask, computeStats, sessionSeconds } from './lib/stats.js';
import { validateJournal, validatePreferences, validateTask } from './lib/inputs.js';
import { PROMPT_VERSION, generateBreakdown, generatePlan, generateReview, metrics, providerInfo } from './lib/ai.js';
import { buildSampleDb } from './lib/seed.js';
import { ProviderError } from './lib/providers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'focusflow.json');

const store = new Store(DATA_FILE);
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------- helpers ---

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
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
  return { ...s, taskTitle: task?.title || s.taskTitleSnapshot, elapsedSeconds: Math.round(sessionSeconds(s)), serverNow: now() };
}

// ------------------------------------------------------------- bootstrap ---

app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: providerInfo(), promptVersion: PROMPT_VERSION, metrics });
});

app.get('/api/bootstrap', (req, res) => {
  const db = store.db;
  res.json({
    today: today(),
    provider: providerInfo(),
    preferences: db.preferences,
    categories: db.categories,
    tasks: decorateTasks(db),
    activeSession: activeSession(db),
    recentSessions: db.sessions.filter((s) => s.status === 'stopped').slice(-40).reverse(),
    journal: [...db.journal].reverse().slice(0, 200),
    plans: [...db.plans].reverse().slice(0, 25),
    schedules: db.schedules,
  });
});

app.put('/api/preferences', (req, res) => {
  const { value, error } = validatePreferences(req.body);
  if (error) throw new HttpError(400, error);
  store.update((db) => { db.preferences = { ...db.preferences, ...value }; });
  res.json(store.db.preferences);
});

// ----------------------------------------------------------------- tasks ---

app.post('/api/tasks', (req, res) => {
  const { value, error } = validateTask(req.body);
  if (error) throw new HttpError(400, error);
  const task = { id: newId('task'), ...value, parentId: value.parentId || null, createdAt: now(), completedAt: null };
  store.update((db) => {
    db.tasks.push(task);
    if (task.category && !db.categories.includes(task.category)) db.categories.push(task.category);
  });
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const { value, error } = validateTask(req.body, { partial: true });
  if (error) throw new HttpError(400, error);
  const task = store.update((db) => {
    const t = findOr404(db.tasks, req.params.id, 'Task');
    if (value.status && value.status !== t.status) t.completedAt = value.status === 'done' ? now() : null;
    Object.assign(t, value, { updatedAt: now() });
    if (t.category && !db.categories.includes(t.category)) db.categories.push(t.category);
    return t;
  });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  store.update((db) => {
    const t = findOr404(db.tasks, req.params.id, 'Task');
    if (db.sessions.some((s) => s.taskId === t.id && s.status !== 'stopped')) {
      throw new HttpError(409, 'Stop the running timer for this task before deleting it.');
    }
    db.tasks = db.tasks.filter((x) => x.id !== t.id);
    // Tracked time really happened, so sessions are kept with a title snapshot.
    for (const s of db.sessions) if (s.taskId === t.id) { s.taskTitleSnapshot = t.title; s.categorySnapshot = t.category; }
  });
  res.status(204).end();
});

// -------------------------------------------------------------- sessions ---

app.post('/api/sessions/start', (req, res) => {
  const session = store.update((db) => {
    if (db.sessions.some((s) => s.status === 'running' || s.status === 'paused')) {
      throw new HttpError(409, 'A focus session is already active. Stop it before starting another.');
    }
    const task = findOr404(db.tasks, req.body?.taskId, 'Task');
    if (task.status === 'todo') task.status = 'in_progress';
    const s = {
      id: newId('ses'), taskId: task.id, taskTitleSnapshot: task.title, categorySnapshot: task.category,
      status: 'running', source: 'timer', startedAt: now(), lastResumedAt: now(), accumulatedSeconds: 0,
      endedAt: null, durationSeconds: null, note: '',
    };
    db.sessions.push(s);
    return s;
  });
  res.status(201).json(activeSession(store.db) || session);
});

function sessionAction(req, fn) {
  return store.update((db) => {
    const s = findOr404(db.sessions, req.params.id, 'Session');
    fn(s, db);
    return s;
  });
}

app.post('/api/sessions/:id/pause', (req, res) => {
  sessionAction(req, (s) => {
    if (s.status !== 'running') throw new HttpError(409, 'Session is not running.');
    s.accumulatedSeconds = sessionSeconds(s);
    s.status = 'paused';
    s.lastResumedAt = null;
  });
  res.json(activeSession(store.db));
});

app.post('/api/sessions/:id/resume', (req, res) => {
  sessionAction(req, (s) => {
    if (s.status !== 'paused') throw new HttpError(409, 'Session is not paused.');
    s.status = 'running';
    s.lastResumedAt = now();
  });
  res.json(activeSession(store.db));
});

app.post('/api/sessions/:id/stop', (req, res) => {
  const s = sessionAction(req, (s, db) => {
    if (s.status === 'stopped') throw new HttpError(409, 'Session already stopped.');
    s.durationSeconds = Math.round(sessionSeconds(s));
    s.status = 'stopped';
    s.endedAt = now();
    s.lastResumedAt = null;
    s.note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : '';
    if (req.body?.completeTask) {
      const t = db.tasks.find((x) => x.id === s.taskId);
      if (t) { t.status = 'done'; t.completedAt = now(); }
    }
  });
  res.json(s);
});

app.post('/api/sessions/:id/discard', (req, res) => {
  store.update((db) => {
    const s = findOr404(db.sessions, req.params.id, 'Session');
    if (s.status === 'stopped') throw new HttpError(409, 'Only an active session can be discarded.');
    db.sessions = db.sessions.filter((x) => x.id !== s.id);
  });
  res.status(204).end();
});

// Log time that was not captured with the timer (e.g. forgot to start it).
app.post('/api/sessions/manual', (req, res) => {
  const minutes = Number(req.body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) throw new HttpError(400, 'Minutes must be a whole number between 1 and 720.');
  const endedAt = req.body?.endedAt ? new Date(req.body.endedAt) : new Date();
  if (Number.isNaN(endedAt.getTime()) || endedAt.getTime() > Date.now() + 60_000) throw new HttpError(400, 'End time must be a valid time that is not in the future.');
  const session = store.update((db) => {
    const task = findOr404(db.tasks, req.body?.taskId, 'Task');
    if (task.status === 'todo') task.status = 'in_progress';
    const s = {
      id: newId('ses'), taskId: task.id, taskTitleSnapshot: task.title, categorySnapshot: task.category,
      status: 'stopped', source: 'manual',
      startedAt: new Date(endedAt.getTime() - minutes * 60_000).toISOString(), endedAt: endedAt.toISOString(),
      accumulatedSeconds: minutes * 60, durationSeconds: minutes * 60, lastResumedAt: null,
      note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : '',
    };
    db.sessions.push(s);
    if (req.body?.completeTask) { task.status = 'done'; task.completedAt = now(); }
    return s;
  });
  res.status(201).json(session);
});

app.delete('/api/sessions/:id', (req, res) => {
  store.update((db) => {
    findOr404(db.sessions, req.params.id, 'Session');
    db.sessions = db.sessions.filter((x) => x.id !== req.params.id);
  });
  res.status(204).end();
});

// --------------------------------------------------------------- journal ---

app.post('/api/journal', (req, res) => {
  const { value, error } = validateJournal(req.body);
  if (error) throw new HttpError(400, error);
  const entry = { id: newId('jrn'), ...value, createdAt: now() };
  store.update((db) => { db.journal.push(entry); });
  res.status(201).json(entry);
});

app.patch('/api/journal/:id', (req, res) => {
  const { value, error } = validateJournal(req.body);
  if (error) throw new HttpError(400, error);
  const entry = store.update((db) => Object.assign(findOr404(db.journal, req.params.id, 'Entry'), value, { updatedAt: now() }));
  res.json(entry);
});

app.delete('/api/journal/:id', (req, res) => {
  store.update((db) => {
    findOr404(db.journal, req.params.id, 'Entry');
    db.journal = db.journal.filter((j) => j.id !== req.params.id);
  });
  res.status(204).end();
});

// ----------------------------------------------------------------- stats ---

app.get('/api/stats', (req, res) => {
  const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'week';
  const date = isDateStr(req.query.date) ? req.query.date : today();
  res.json(computeStats(store.db, { range, date }));
});

// -------------------------------------------------------------------- AI ---

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

app.post('/api/ai/plan', wrap(async (req, res) => {
  const date = isDateStr(req.body?.date) ? req.body.date : today();
  const dayStart = req.body?.dayStart && timeToMinutes(req.body.dayStart) !== null ? req.body.dayStart : undefined;
  const available = req.body?.availableMinutes ? Number(req.body.availableMinutes) : undefined;
  if (available !== undefined && (!Number.isInteger(available) || available < 15 || available > 960)) {
    throw new HttpError(400, 'Available time must be between 15 and 960 minutes.');
  }
  if (dayStart && available && timeToMinutes(dayStart) + available > 24 * 60) {
    throw new HttpError(400, 'That window runs past midnight. Start earlier or shorten it.');
  }
  const result = await generatePlan(store.db, { date, dayStart, availableMinutes: available, userNote: req.body?.userNote, taskIds: req.body?.taskIds });
  res.json(savePlanRevision('plan', result, { date }));
}));

app.post('/api/ai/review', wrap(async (req, res) => {
  const range = ['day', 'week', 'month'].includes(req.body?.range) ? req.body.range : 'week';
  const date = isDateStr(req.body?.date) ? req.body.date : today();
  const includeJournal = req.body?.includeJournal === true;
  const result = await generateReview(store.db, { range, date, includeJournal });
  res.json(savePlanRevision('review', result, { range, date, includeJournal }));
}));

app.post('/api/ai/breakdown', wrap(async (req, res) => {
  const task = findOr404(store.db.tasks, req.body?.taskId, 'Task');
  const result = await generateBreakdown(task);
  res.json(savePlanRevision('breakdown', result, { taskId: task.id }));
}));

// The user decides what happens with AI output. Nothing changes until here.
app.post('/api/plans/:id/accept', (req, res) => {
  const rev = store.update((db) => {
    const r = findOr404(db.plans, req.params.id, 'Suggestion');
    if (r.kind === 'plan') {
      const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
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
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
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
  });
  res.json(rev);
});

app.post('/api/plans/:id/reject', (req, res) => {
  const rev = store.update((db) => {
    const r = findOr404(db.plans, req.params.id, 'Suggestion');
    r.status = 'rejected';
    r.decidedAt = now();
    return r;
  });
  res.json(rev);
});

app.delete('/api/schedules/:date', (req, res) => {
  store.update((db) => { delete db.schedules[req.params.date]; });
  res.status(204).end();
});

// ------------------------------------------------------- export / demo ---

app.get('/api/export', (req, res) => {
  res.setHeader('content-disposition', `attachment; filename="focusflow-export-${today()}.json"`);
  res.json(store.db);
});

app.post('/api/demo/seed', (req, res) => {
  store.replace(buildSampleDb(store.db.preferences.timezone, today()));
  res.json({ ok: true });
});

app.post('/api/demo/reset', (req, res) => {
  const tz = store.db.preferences.timezone;
  const db = emptyDb();
  db.preferences.timezone = tz;
  store.replace(db);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- errors ---

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isProvider = err instanceof ProviderError;
  if (status >= 500 || isProvider) metrics.errors += 1;
  if (status >= 500 && !isProvider) console.error(err);
  if (isProvider) console.error(`[ai] ${err.message}`);
  // Upstream AI failures are reported as 502 so the UI can offer a retry.
  const clientStatus = isProvider ? (status === 400 ? 400 : status === 429 ? 429 : 502) : status;
  res.status(clientStatus).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  const p = providerInfo();
  console.log(`\n  FocusFlow running at http://localhost:${PORT}`);
  console.log(`  AI: ${p.label}${p.demo ? ' — add an API key to .env to use a real model' : ` (${p.model})`}\n`);
});
