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

const backend = await import('../public/js/backend.js');
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
