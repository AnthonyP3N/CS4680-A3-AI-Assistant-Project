// Deterministic analytics. Every number shown on the dashboard and every
// number sent to the AI comes from here — the model never does arithmetic.

import { datesBetween, localDate, rangeFor, weekdayName } from './dates.js';

const round1 = (n) => Math.round(n * 10) / 10;

/** Duration of a session in seconds, including a still-running segment. */
export function sessionSeconds(s, now = Date.now()) {
  if (s.status === 'stopped') return s.durationSeconds || 0;
  let secs = s.accumulatedSeconds || 0;
  if (s.status === 'running' && s.lastResumedAt) {
    secs += Math.max(0, (now - Date.parse(s.lastResumedAt)) / 1000);
  }
  return secs;
}

/** Actual tracked minutes per task id, across all completed sessions. */
export function actualMinutesByTask(sessions) {
  const out = {};
  for (const s of sessions) {
    if (s.status !== 'stopped' || !s.taskId) continue;
    out[s.taskId] = (out[s.taskId] || 0) + (s.durationSeconds || 0) / 60;
  }
  for (const k of Object.keys(out)) out[k] = round1(out[k]);
  return out;
}

/** min(estimate, actual) / max(estimate, actual): 1.0 = perfect, symmetric for over/under. */
export function estimateAccuracy(estimate, actual) {
  if (!(estimate > 0) || !(actual > 0)) return null;
  return Math.min(estimate, actual) / Math.max(estimate, actual);
}

export function computeStats(db, { range = 'week', date, tz, start: customStart, end: customEnd }) {
  const timezone = tz || db.preferences.timezone || 'UTC';
  const { start, end } = customStart && customEnd ? { start: customStart, end: customEnd } : rangeFor(range, date);
  const inRange = (d) => d >= start && d <= end;
  const taskById = new Map(db.tasks.map((t) => [t.id, t]));
  const actualByTask = actualMinutesByTask(db.sessions);

  // --- Focused time (completed sessions, bucketed by local end date) ---
  const days = datesBetween(start, end);
  const byDayMap = Object.fromEntries(days.map((d) => [d, 0]));
  const byCategoryMap = {};
  const byTaskMap = {};
  let focusedSeconds = 0;
  let sessionsCount = 0;

  for (const s of db.sessions) {
    if (s.status !== 'stopped' || !s.endedAt) continue;
    const d = localDate(s.endedAt, timezone);
    if (!inRange(d)) continue;
    const secs = s.durationSeconds || 0;
    focusedSeconds += secs;
    sessionsCount += 1;
    byDayMap[d] = (byDayMap[d] || 0) + secs;
    const task = taskById.get(s.taskId);
    const category = task?.category || s.categorySnapshot || 'Uncategorized';
    byCategoryMap[category] = (byCategoryMap[category] || 0) + secs;
    // Focus time without a task is grouped by its label ("Focus time", "Reading"...).
    const key = s.taskId || `focus:${s.taskTitleSnapshot || 'Focus time'}`;
    byTaskMap[key] = (byTaskMap[key] || 0) + secs;
  }

  const focusedMinutes = round1(focusedSeconds / 60);
  const byDay = days.map((d) => ({ date: d, label: weekdayName(d), minutes: round1(byDayMap[d] / 60) }));
  const byCategory = Object.entries(byCategoryMap)
    .map(([category, secs]) => ({
      category,
      minutes: round1(secs / 60),
      share: focusedSeconds ? round1((secs / focusedSeconds) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);
  const topTasks = Object.entries(byTaskMap)
    .map(([id, secs]) => ({
      taskId: id,
      title: taskById.get(id)?.title || (id.startsWith('focus:') ? id.slice(6) : '(deleted task)'),
      minutes: round1(secs / 60),
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // --- Completion rate: tasks due in the period, plus tasks finished in it ---
  const planned = db.tasks.filter((t) => {
    const due = t.dueDate && inRange(t.dueDate);
    const finished = t.status === 'done' && t.completedAt && inRange(localDate(t.completedAt, timezone));
    return due || finished;
  });
  const completed = planned.filter((t) => t.status === 'done');
  const completion = {
    planned: planned.length,
    completed: completed.length,
    rate: planned.length ? round1((completed.length / planned.length) * 100) / 100 : null,
    definition: 'Completed tasks ÷ tasks that were due in this period or finished in it.',
  };

  // --- Estimate accuracy: completed tasks in range with both numbers ---
  const perTask = [];
  for (const t of completed) {
    const actual = actualByTask[t.id] || 0;
    const acc = estimateAccuracy(t.estimateMinutes, actual);
    if (acc === null) continue;
    perTask.push({
      taskId: t.id,
      title: t.title,
      category: t.category,
      estimateMinutes: t.estimateMinutes,
      actualMinutes: actual,
      accuracy: round1(acc * 100) / 100,
      direction: actual > t.estimateMinutes * 1.1 ? 'over' : actual < t.estimateMinutes * 0.9 ? 'under' : 'on target',
    });
  }
  const totalEstimated = perTask.reduce((a, t) => a + t.estimateMinutes, 0);
  const totalActual = round1(perTask.reduce((a, t) => a + t.actualMinutes, 0));
  const estimate = {
    tasksCompared: perTask.length,
    accuracy: perTask.length
      ? Math.round((perTask.reduce((a, t) => a + t.accuracy, 0) / perTask.length) * 100) / 100
      : null,
    totalEstimated,
    totalActual,
    actualToEstimateRatio: totalEstimated ? Math.round((totalActual / totalEstimated) * 100) / 100 : null,
    perTask,
    definition: 'Per task: smaller of (estimate, actual) ÷ larger. 1.00 means a perfect estimate. Averaged over completed tasks with tracked time.',
  };

  // --- Journal (counts only; text is never included here) ---
  const entries = db.journal.filter((j) => inRange(localDate(j.createdAt, timezone)));
  const tagCounts = {};
  for (const j of entries) {
    for (const tag of j.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    if (j.energy) tagCounts[`energy-${j.energy}`] = (tagCounts[`energy-${j.energy}`] || 0) + 1;
  }

  return {
    range,
    start,
    end,
    timezone,
    focusedMinutes,
    sessionsCount,
    byDay,
    byCategory,
    topTasks,
    completion,
    estimate,
    journal: { entries: entries.length, tagCounts },
  };
}
