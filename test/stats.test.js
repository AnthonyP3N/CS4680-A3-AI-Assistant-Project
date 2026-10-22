import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSampleDb } from '../src/lib/seed.js';
import { computeStats, estimateAccuracy, sessionSeconds } from '../src/lib/stats.js';
import { localDate, rangeFor, zonedTimeToIso } from '../src/lib/dates.js';

const TZ = 'America/Los_Angeles';

test('estimate accuracy is symmetric and bounded', () => {
  assert.equal(estimateAccuracy(60, 60), 1);
  assert.equal(estimateAccuracy(60, 120), 0.5);
  assert.equal(estimateAccuracy(120, 60), 0.5);
  assert.equal(estimateAccuracy(null, 60), null);
});

test('ranges: Monday-start weeks and calendar months', () => {
  assert.deepEqual(rangeFor('week', '2026-10-21'), { start: '2026-10-19', end: '2026-10-25' });
  assert.deepEqual(rangeFor('month', '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
});

test('sessions are bucketed by the user’s local day, not UTC', () => {
  const iso = zonedTimeToIso('2026-10-14', '23:30', TZ); // 06:30 UTC on the 15th
  assert.equal(localDate(iso, TZ), '2026-10-14');
});

test('running and paused sessions are timed from their timestamps', () => {
  const now = Date.parse('2026-10-21T20:00:00Z');
  assert.equal(sessionSeconds({ status: 'running', accumulatedSeconds: 60, lastResumedAt: '2026-10-21T19:59:00Z' }, now), 120);
  assert.equal(sessionSeconds({ status: 'paused', accumulatedSeconds: 90 }, now), 90);
});

test('weekly stats on the sample data add up', () => {
  const db = buildSampleDb(TZ, '2026-10-21');
  const s = computeStats(db, { range: 'week', date: '2026-10-14' });
  const manual = db.sessions
    .filter((x) => { const d = localDate(x.endedAt, TZ); return d >= '2026-10-12' && d <= '2026-10-18'; })
    .reduce((a, x) => a + x.durationSeconds / 60, 0);
  assert.equal(s.focusedMinutes, manual);
  assert.equal(s.byDay.reduce((a, d) => a + d.minutes, 0), manual);
  assert.equal(s.byCategory.reduce((a, c) => a + c.minutes, 0), manual);
  assert.ok(s.estimate.tasksCompared > 0);
  assert.ok(s.completion.planned >= s.completion.completed);
});
