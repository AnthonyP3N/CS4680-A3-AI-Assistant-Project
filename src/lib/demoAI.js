// Offline "demo mode". Used when no API key is configured (or AI_PROVIDER=demo)
// so the app is always demoable. These are plain heuristics, NOT a language
// model — the UI labels their output as "Demo mode" so nobody mistakes it for
// the real AI. They return the same JSON shapes and go through the same
// validators as model output.

import { minutesToTime, timeToMinutes } from './dates.js';

const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export function demoPlan(input) {
  const ratio = input.recentStats?.actualToEstimateRatio || 1;
  const tasks = [...input.tasks].sort((a, b) => {
    // Urgent (due within a day or overdue) first, then priority, then deadline.
    const da = a.daysUntilDue ?? 99;
    const db = b.daysUntilDue ?? 99;
    const ua = da <= 1 ? 0 : 1;
    const ub = db <= 1 ? 0 : 1;
    if (ua !== ub) return ua - ub;
    const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pw) return pw;
    return da - db;
  });
  const start = timeToMinutes(input.dayStart);
  const end = start + input.availableMinutes;
  const schedule = [];
  const unscheduled = [];
  const warnings = [];
  let cursor = start;
  let run = 0;

  for (const t of tasks) {
    let need = t.remainingMinutes ?? 30;
    if (ratio > 1.15 && (t.daysUntilDue ?? 99) <= 1) need = round5(need * Math.min(ratio, 1.5));
    if ((t.daysUntilDue ?? 99) < 0) warnings.push(`"${t.title}" is past its due date.`);
    while (need > 0) {
      const tooShort = input.breakEveryMinutes - run < 20 && run > 0;
      if (input.breakMinutes > 0 && (run >= input.breakEveryMinutes || tooShort)) {
        if (cursor + input.breakMinutes + 5 > end) break;
        schedule.push({ type: 'break', taskId: null, title: 'Break', start: minutesToTime(cursor), durationMinutes: input.breakMinutes, reason: `Reset after ${run} minutes of focus` });
        cursor += input.breakMinutes;
        run = 0;
      }
      const cap = input.breakMinutes > 0 ? input.breakEveryMinutes - run : need;
      const chunk = Math.min(need, cap, end - cursor);
      if (chunk < 10) break;
      const due = t.daysUntilDue === 0 ? 'Due today' : t.daysUntilDue === 1 ? 'Due tomorrow' : t.daysUntilDue < 0 ? 'Overdue' : t.dueDate ? `Due in ${t.daysUntilDue} days` : 'No deadline';
      schedule.push({ type: 'task', taskId: t.id, title: t.title, start: minutesToTime(cursor), durationMinutes: chunk, reason: `${due}, ${t.priority} priority` });
      cursor += chunk;
      run += chunk;
      need -= chunk;
    }
    if (need > 0) unscheduled.push({ taskId: t.id, reason: need === (t.remainingMinutes ?? 30) ? 'No time left in today\'s window' : `About ${need} minutes still left after today` });
  }
  while (schedule.length && schedule[schedule.length - 1].type === 'break') schedule.pop();

  const scheduledTitles = [...new Set(schedule.filter((b) => b.type === 'task').map((b) => b.title))];
  if (ratio > 1.15) warnings.push(`Your recent tasks took about ${ratio}x your estimates, so urgent work got extra time.`);
  const suggestions = [];
  if (unscheduled.length) suggestions.push('Move the unscheduled tasks to a day with more open time, or lower their estimate by breaking them down.');
  if (ratio > 1.15) suggestions.push('Try adding a buffer to your next estimates.');
  if (!suggestions.length) suggestions.push('Start with the first block right away while the plan is fresh.');

  return {
    summary: scheduledTitles.length
      ? `Starts with ${scheduledTitles[0]}${scheduledTitles.length > 1 ? `, then ${scheduledTitles.slice(1).join(', ')}` : ''}, with regular breaks inside your ${input.availableMinutes}-minute window.`
      : 'No tasks fit in the available time.',
    schedule,
    unscheduled,
    assumptions: [`You are free from ${input.dayStart} to ${input.windowEnd}.`],
    warnings,
    suggestions: suggestions.slice(0, 2),
  };
}

export function demoReview(input) {
  const s = input.stats;
  const pct = s.completion.rate === null ? null : Math.round(s.completion.rate * 100);
  const patterns = [];
  const highlights = [];
  const warnings = [];

  if (s.focusedMinutes > 0) highlights.push(`You logged ${s.focusedMinutes} focused minutes across ${s.sessionsCount} sessions.`);
  if (s.previousPeriodFocusedMinutes !== null && s.focusedMinutes > s.previousPeriodFocusedMinutes) {
    highlights.push(`That is up from ${s.previousPeriodFocusedMinutes} minutes in the previous period.`);
  }
  if (pct !== null && pct >= 70) highlights.push(`${s.completion.completed} of ${s.completion.planned} planned tasks completed.`);

  if (s.estimate.actualToEstimateRatio && s.estimate.actualToEstimateRatio > 1.15) {
    const m = s.estimate.mostOver;
    patterns.push({
      observation: 'Tasks are taking longer than estimated.',
      evidence: `Actual time was ${s.estimate.actualToEstimateRatio}x estimates${m ? `; "${m.title}" was estimated at ${m.estimateMinutes} minutes and took ${m.actualMinutes}` : ''}.`,
    });
  } else if (s.estimate.accuracy !== null) {
    patterns.push({ observation: 'Your estimates are fairly close to reality.', evidence: `Estimate accuracy averaged ${s.estimate.accuracy}.` });
  }
  const zeroDays = (s.byDay || []).filter((d) => d.minutes === 0).map((d) => d.label);
  if (s.byDay?.length > 1 && zeroDays.length && zeroDays.length < s.byDay.length) {
    const best = [...s.byDay].sort((a, b) => b.minutes - a.minutes)[0];
    patterns.push({ observation: 'Focus time is concentrated on some days.', evidence: `${zeroDays.join(', ')} had no tracked focus, while ${best.label} had ${best.minutes} minutes.` });
  }
  if (s.byCategory?.[0]) {
    patterns.push({ observation: `${s.byCategory[0].category} took the largest share of your time.`, evidence: `${s.byCategory[0].minutes} minutes in ${s.byCategory[0].category}.` });
  }
  if (!patterns.length) patterns.push({ observation: 'Not enough tracked time to see a pattern yet.', evidence: `${s.focusedMinutes} focused minutes recorded.` });

  const suggestions = [];
  if (s.estimate.actualToEstimateRatio && s.estimate.actualToEstimateRatio > 1.15) {
    suggestions.push({ action: 'Add a buffer to estimates for tasks like your longest-running one.', why: `Your actual-to-estimate ratio was ${s.estimate.actualToEstimateRatio}.` });
  }
  if (zeroDays.length) suggestions.push({ action: `Schedule one short focus block on ${zeroDays[0]}.`, why: 'Spreading work out lowers end-of-week pressure.' });
  suggestions.push({ action: 'Use the timer for every study block next week.', why: 'More tracked sessions make these insights more accurate.' });
  suggestions.push({ action: 'Write a two-line reflection after your longest session.', why: 'Short notes help you see what helps you focus.' });

  if (s.focusedMinutes < 60 || s.sessionsCount < 3) warnings.push('There is only a little tracked time in this period, so these observations are tentative.');

  const journalThemes = [];
  if (input.journal) {
    const tags = Object.entries(s.journalTagCounts || {}).sort((a, b) => b[1] - a[1]);
    const label = (t) => ({ win: 'Win', stuck: 'Stuck', distraction: 'Distraction', idea: 'Idea', reflection: 'Reflection', 'energy-low': 'Low energy', 'energy-high': 'High energy', 'energy-ok': 'OK energy' })[t] || t;
    for (const [tag, n] of tags.slice(0, 3)) journalThemes.push(`“${label(tag)}” came up in ${n} ${n === 1 ? 'entry' : 'entries'}`);
    if (!journalThemes.length) journalThemes.push('Journal entries were shared but had no tags to summarize');
  }

  return {
    summary: `You focused for ${s.focusedMinutes} minutes${pct !== null ? ` and completed ${pct}% of planned tasks (${s.completion.completed} of ${s.completion.planned})` : ''}.`,
    highlights: highlights.slice(0, 3),
    patterns: patterns.slice(0, 4),
    suggestions: suggestions.slice(0, 2),
    journalThemes,
    warnings,
  };
}

export function demoBreakdown(input) {
  const t = input.task;
  const total = t.estimateMinutes || 60;
  const shares = total >= 240
    ? [['Clarify the goal and list what you need', 0.08], ['Gather materials and resources', 0.12], ['Sketch a rough outline or plan', 0.1], ['Work through the first part', 0.2], ['Work through the second part', 0.2], ['Work through the remaining part', 0.15], ['Review, fix, and finish', 0.15]]
    : [['Clarify the goal and gather what you need', 0.15], ['Make a rough plan or outline', 0.15], ['Do the main work: first half', 0.3], ['Do the main work: second half', 0.25], ['Review and finish', 0.15]];
  const steps = shares.map(([title, share]) => ({
    title,
    estimateMinutes: Math.min(90, Math.max(10, round5(total * share))),
    doneWhen: '',
  }));
  return {
    steps,
    assumptions: t.estimateMinutes ? [] : ['No estimate was given, so FocusFlow assumed about 60 minutes.'],
    warnings: ['Demo mode uses a generic template. Connect an AI provider for steps specific to this task.'],
  };
}
