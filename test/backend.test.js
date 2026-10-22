// The in-browser "server": routes, storage, key handling, import/export.
import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal localStorage for Node.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new MemoryStorage();

const backend = await import('../src/data/backend.js');
const { handle, getAiSettings, saveAiSettings, clearAiSettings } = backend;

const post = (path, body) => handle('POST', path, body ?? {});

test.beforeEach(async () => {
  globalThis.localStorage.map.clear();
  await post('/api/demo/reset');
  await handle('PUT', '/api/preferences', { timezone: 'America/Los_Angeles' });
});

test('task -> timer -> stats round trip is saved in browser storage', async () => {
  const task = await post('/api/tasks', { title: 'CS homework 5', estimateMinutes: 120, priority: 'high', category: 'Homework' });
  const started = await post('/api/sessions/start', { taskId: task.id });
  assert.equal(started.status, 'running');
  await assert.rejects(post('/api/sessions/start', { taskId: task.id }), /already active/);
  await post(`/api/sessions/${started.id}/stop`, { note: 'done' });
  await post('/api/sessions/manual', { taskId: task.id, minutes: 120 });

  const boot = await handle('GET', '/api/bootstrap');
  assert.equal(boot.tasks[0].actualMinutes, 120);
  assert.equal(boot.activeSession, null);

  const stats = await handle('GET', `/api/stats?range=day&date=${boot.today}`);
  assert.equal(Math.round(stats.focusedMinutes), 120);

  const saved = JSON.parse(globalThis.localStorage.getItem('focusflow:data:v1'));
  assert.equal(saved.tasks.length, 1);
});

test('a failed change leaves the data untouched', async () => {
  const task = await post('/api/tasks', { title: 'A' });
  await post('/api/sessions/start', { taskId: task.id });
  await assert.rejects(handle('DELETE', `/api/tasks/${task.id}`), /Stop the running timer/);
  assert.equal((await handle('GET', '/api/bootstrap')).tasks.length, 1);
});

test('without a key the coach runs in demo mode', async () => {
  await post('/api/tasks', { title: 'Essay', estimateMinutes: 60, dueDate: null });
  const boot = await handle('GET', '/api/bootstrap');
  assert.equal(boot.provider.demo, true);
  const rev = await post('/api/ai/plan', { date: boot.today, dayStart: '09:00', availableMinutes: 120 });
  assert.equal(rev.provider.name, 'demo');
  assert.ok(rev.output.schedule.length > 0);
  const accepted = await post(`/api/plans/${rev.id}/accept`, { blocks: rev.output.schedule });
  assert.equal(accepted.status, 'accepted');
});

test('the API key is stored separately, never exported, and can be removed', async () => {
  saveAiSettings({ provider: 'gemini', key: 'AIza-secret-123', model: '' });
  assert.equal(getAiSettings().key, 'AIza-secret-123');
  const boot = await handle('GET', '/api/bootstrap');
  assert.equal(boot.provider.name, 'gemini');
  assert.doesNotMatch(JSON.stringify(boot), /AIza-secret-123/);

  const exported = await handle('GET', '/api/export');
  assert.doesNotMatch(JSON.stringify(exported), /AIza-secret-123/);

  clearAiSettings();
  assert.equal(getAiSettings().key, '');
  assert.equal((await handle('GET', '/api/bootstrap')).provider.demo, true);
  assert.throws(() => saveAiSettings({ provider: 'gemini', key: 'has spaces in it' }), /doesn’t look like an API key/);
});

test('export then import restores the data; other files are rejected', async () => {
  await post('/api/demo/seed');
  const backup = await handle('GET', '/api/export');
  await post('/api/demo/reset');
  assert.equal((await handle('GET', '/api/bootstrap')).tasks.length, 0);

  const r = await post('/api/import', { data: backup });
  assert.equal(r.tasks, backup.tasks.length);
  assert.equal((await handle('GET', '/api/bootstrap')).tasks.length, backup.tasks.length);

  await assert.rejects(post('/api/import', { data: { hello: 'world' } }), /isn’t a FocusFlow export/);
  assert.equal((await handle('GET', '/api/bootstrap')).tasks.length, backup.tasks.length);
});

test('a long journal entry round-trips; the AI only gets the first 400 characters', async () => {
  const { readFileSync } = await import('node:fs');
  const long = readFileSync(new URL('./fixtures/long-entry.txt', import.meta.url), 'utf8');
  const saved = await post('/api/journal', { body: long, tags: ['reflection'] });
  assert.equal(saved.body, long.trim());
  await assert.rejects(post('/api/journal', { body: long + long }), /too long to save/);

  const { buildReviewInput } = await import('../src/lib/ai.js');
  const boot = await handle('GET', '/api/bootstrap');
  const { input } = buildReviewInput(backend.store.db, { range: 'day', date: boot.today, includeJournal: true });
  assert.equal(input.journal[0].text.length, 400);
});

test('older data (energy stored as tags) is upgraded on import, and journal entries can be edited', async () => {
  const legacy = {
    tasks: [], sessions: [], plans: [], schedules: {},
    journal: [{ id: 'jrn_old', body: 'Tired after work.', tags: ['energy-low', 'reflection'], taskId: null, createdAt: new Date().toISOString() }],
  };
  await post('/api/import', { data: legacy });
  const boot = await handle('GET', '/api/bootstrap');
  assert.equal(boot.journal[0].energy, 'low');
  assert.deepEqual(boot.journal[0].tags, ['reflection']);

  const edited = await handle('PATCH', '/api/journal/jrn_old', { body: 'Tired after my shift.', tags: ['stuck'], energy: 'ok' });
  assert.equal(edited.body, 'Tired after my shift.');
  assert.equal(edited.energy, 'ok');

  const checkIn = await post('/api/journal', { body: '', energy: 'high', tags: [] });
  assert.equal(checkIn.energy, 'high', 'a quick check-in can be energy only');
  await assert.rejects(post('/api/journal', { body: '  ' }), /Write something, or pick/);
});

test('undo snapshots restore everything', async () => {
  const before = backend.snapshot();
  await post('/api/tasks', { title: 'Temporary' });
  assert.equal((await handle('GET', '/api/bootstrap')).tasks.length, before.tasks.length + 1);
  backend.restore(before);
  assert.equal((await handle('GET', '/api/bootstrap')).tasks.length, before.tasks.length);
});

test('journal titles are saved and can be edited', async () => {
  const { handle, store } = await import('../src/data/backend.js');
  store.reset?.();
  const e = await handle('POST', '/api/journal', { title: 'A smaller start', body: 'Two short sessions worked.', energy: 'high', tags: ['win'] });
  assert.equal(e.title, 'A smaller start');
  const edited = await handle('PATCH', `/api/journal/${e.id}`, { title: 'A smaller start, a better session', body: e.body, tags: e.tags, energy: e.energy });
  assert.equal(edited.title, 'A smaller start, a better session');
});

test('focus time with no task is saved under "Focus", with its own block length', async () => {
  const { handle } = await import('../src/data/backend.js');
  await handle('POST', '/api/demo/reset');
  await handle('PUT', '/api/preferences', { focusMinutes: 25 });
  const s = await handle('POST', '/api/sessions/start', { label: '  deep reading ' });
  assert.equal(s.taskId, null);
  assert.equal(s.taskTitle, 'Deep reading');
  assert.equal(s.categorySnapshot, 'Focus');
  assert.equal(s.targetMinutes, 25, 'uses the saved focus length');
  const longer = await handle('PATCH', `/api/sessions/${s.id}`, { targetMinutes: 30 });
  assert.equal(longer.targetMinutes, 30);
  await assert.rejects(handle('PATCH', `/api/sessions/${s.id}`, { targetMinutes: 2 }), /between 5 and 240/);
  await handle('POST', `/api/sessions/${s.id}/stop`, {});
  const manual = await handle('POST', '/api/sessions/manual', { minutes: 40 });
  assert.equal(manual.taskTitleSnapshot, 'Focus time');
  assert.equal(manual.categorySnapshot, 'Focus');
  const stats = await handle('GET', '/api/stats?range=day');
  const focus = stats.byCategory.find((c) => c.category === 'Focus');
  assert.ok(focus && focus.minutes >= 40, JSON.stringify(stats.byCategory));
  assert.ok(stats.topTasks.some((t) => t.title === 'Focus time'));
});

test('a task session can use a chosen block length', async () => {
  const { handle } = await import('../src/data/backend.js');
  await handle('POST', '/api/demo/reset');
  const t = await handle('POST', '/api/tasks', { title: 'Essay', estimateMinutes: 60, category: 'Homework' });
  const s = await handle('POST', '/api/sessions/start', { taskId: t.id, targetMinutes: 90 });
  assert.equal(s.targetMinutes, 90);
  assert.equal(s.categorySnapshot, 'Homework');
  await assert.rejects(handle('POST', '/api/sessions/start', { taskId: t.id }), /already active/);
});
