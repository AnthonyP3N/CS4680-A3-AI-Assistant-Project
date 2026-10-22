// AI orchestration: builds compact inputs from stored data, calls the model
// with persona + few-shot messages, validates the answer, and runs the
// iterative-refinement loop. Also enforces quotas and records metrics.

import { addDays, diffDays, minutesToTime, rangeFor, timeToMinutes } from './dates.js';
import { actualMinutesByTask, computeStats } from './stats.js';
import {
  PERSONA, PROMPT_VERSION, breakdownMessages, planMessages, refinementMessage, reviewMessages, sanitizeUserNote,
} from './prompts.js';
import {
  normalizeBreakdown, normalizePlan, normalizeReview, repairPlan, validateBreakdown, validatePlan, validateReview,
} from './validate.js';
import { JOURNAL_AI_CHARS } from './inputs.js';
import { DEMO_PROVIDER, ProviderError, callModel, extractJson } from './providers.js';
import { demoBreakdown, demoPlan, demoReview } from './demoAI.js';

const MAX_REFINEMENTS = 2;
const MAX_TASKS_IN_PROMPT = 25;

export const metrics = {
  requests: 0,
  modelCalls: 0,
  refinements: 0,
  validationFailures: 0,
  repairs: 0,
  errors: 0,
  rateLimited: 0,
  tokensIn: 0,
  tokensOut: 0,
  lastLatencyMs: null,
};
/** Public description of a provider (never includes the key). */
export function providerInfo(provider = DEMO_PROVIDER) {
  return { name: provider.name, label: provider.label, model: provider.model, demo: provider.name === 'demo' };
}

async function callWithRetry(provider, messages) {
  const t0 = Date.now();
  try {
    return await callModel(provider, PERSONA, messages);
  } catch (err) {
    if (!err.retryable) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return await callModel(provider, PERSONA, messages);
  } finally {
    metrics.modelCalls += 1;
    metrics.lastLatencyMs = Date.now() - t0;
  }
}

/**
 * The iterative-refinement loop shared by all three AI actions.
 * Returns { output, attempts, provider } where attempts is a user-visible log.
 */
/**
 * onProgress receives real events from the loop, so the UI can show what is
 * actually happening: { stage: 'sent' | 'drafting' | 'checked' | 'revising' | 'done', round, problems }.
 */
async function runWithRefinement({ kind, input, messages, normalize, validate, demo, fallback, provider = DEMO_PROVIDER, onProgress = () => {} }) {
  metrics.requests += 1;
  const attempts = [];
  const started = Date.now();
  const emit = (e) => { try { onProgress(e); } catch { /* UI errors never break the request */ } };
  const totalTokens = () => attempts.reduce((a, x) => a + (x.tokens?.input || 0) + (x.tokens?.output || 0), 0);
  emit({ stage: 'sent' });

  if (provider.name === 'demo') {
    emit({ stage: 'drafting', round: 0 });
    const output = normalize(demo(input));
    const problems = validate(output, input);
    attempts.push({ step: 'Demo rules', problems, passed: problems.length === 0 });
    emit({ stage: 'checked', round: 0, problems: problems.length });
    log({ kind, provider: 'demo', ms: Date.now() - started, passed: !problems.length });
    emit({ stage: 'done' });
    return { output: problems.length ? fallback(output, problems) : output, attempts, provider, tokens: 0 };
  }

  let convo = [...messages];
  let last = null;
  let lastProblems = [];
  for (let round = 0; round <= MAX_REFINEMENTS; round++) {
    const t0 = Date.now();
    emit({ stage: round === 0 ? 'drafting' : 'revising', round });
    const { text, usage } = await callWithRetry(provider, convo);
    metrics.tokensIn += usage?.input || 0;
    metrics.tokensOut += usage?.output || 0;

    let parsed;
    let problems;
    try {
      parsed = normalize(extractJson(text));
      problems = validate(parsed, input);
    } catch {
      parsed = null;
      problems = ['The response was not valid JSON. Return only one JSON object.'];
    }
    attempts.push({
      step: round === 0 ? 'Draft' : `Revision ${round}`,
      problems,
      passed: problems.length === 0,
      ms: Date.now() - t0,
      tokens: usage,
    });
    if (parsed) last = parsed;
    lastProblems = problems;
    emit({ stage: 'checked', round, problems: problems.length });
    if (!problems.length) {
      log({ kind, provider: provider.name, model: provider.model, rounds: round + 1, ms: Date.now() - started, passed: true });
      emit({ stage: 'done' });
      return { output: parsed, attempts, provider, tokens: totalTokens() };
    }
    metrics.validationFailures += 1;
    if (round < MAX_REFINEMENTS) {
      metrics.refinements += 1;
      convo = [...convo, { role: 'assistant', content: text }, { role: 'user', content: refinementMessage(problems) }];
    }
  }

  log({ kind, provider: provider.name, model: provider.model, rounds: MAX_REFINEMENTS + 1, ms: Date.now() - started, passed: false });
  if (!last) throw new ProviderError('The AI did not return usable JSON after several tries. Please try again.');
  const output = fallback(last, lastProblems);
  attempts.push({ step: 'Safety fallback', problems: [], passed: true, note: 'Applied by FocusFlow code, not the AI.' });
  emit({ stage: 'done' });
  return { output, attempts, provider, tokens: totalTokens() };
}

function log(entry) {
  // One line per AI request: provider, rounds, latency, pass/fail. Visible in the browser console.
  if (globalThis.process?.env?.NODE_TEST_CONTEXT) return;
  console.debug('[focusflow ai]', JSON.stringify({ at: new Date().toISOString(), ...entry }));
}

// ---------------------------------------------------------------------------
// Create Plan
// ---------------------------------------------------------------------------

export function buildPlanInput(db, { date, dayStart, availableMinutes, userNote, taskIds }) {
  const prefs = db.preferences;
  const start = dayStart || prefs.dayStart;
  const minutes = availableMinutes || prefs.availableMinutes;
  const actual = actualMinutesByTask(db.sessions);
  const weight = { high: 0, medium: 1, low: 2 };

  // A task split into open subtasks is planned through its subtasks, not twice.
  const hasOpenSteps = new Set(db.tasks.filter((t) => t.parentId && t.status !== 'done').map((t) => t.parentId));
  let tasks = db.tasks.filter((t) => t.status !== 'done' && !hasOpenSteps.has(t.id));
  if (Array.isArray(taskIds) && taskIds.length) tasks = tasks.filter((t) => taskIds.includes(t.id));
  tasks = tasks
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || weight[a.priority] - weight[b.priority])
    .slice(0, MAX_TASKS_IN_PROMPT)
    .map((t) => {
      const tracked = Math.round(actual[t.id] || 0);
      return {
        id: t.id,
        title: t.title,
        category: t.category,
        priority: t.priority,
        dueDate: t.dueDate,
        daysUntilDue: t.dueDate ? diffDays(date, t.dueDate) : null,
        estimateMinutes: t.estimateMinutes,
        trackedMinutes: tracked,
        remainingMinutes: t.estimateMinutes ? Math.max(t.estimateMinutes - tracked, 10) : null,
        ...(t.notes ? { notes: t.notes.slice(0, 150) } : {}),
      };
    });

  const last7 = computeStats(db, { start: addDays(date, -7), end: addDays(date, -1) });
  const last30 = computeStats(db, { start: addDays(date, -30), end: addDays(date, -1) });

  return {
    date,
    dayStart: start,
    availableMinutes: minutes,
    windowEnd: minutesToTime(timeToMinutes(start) + minutes),
    breakEveryMinutes: prefs.breakEveryMinutes,
    breakMinutes: prefs.breakMinutes,
    tasks,
    recentStats: {
      focusedMinutesLast7Days: last7.focusedMinutes,
      completionRate: last7.completion.rate,
      estimateAccuracy: last30.estimate.accuracy,
      actualToEstimateRatio: last30.estimate.actualToEstimateRatio,
    },
    userNote: sanitizeUserNote(userNote),
  };
}

export async function generatePlan(db, opts, provider, onProgress) {
  const input = buildPlanInput(db, opts);
  if (!input.tasks.length) throw new ProviderError('There are no open tasks to plan. Add a task first.', { status: 400 });
  const ctx = input;
  const result = await runWithRefinement({
    provider,
    onProgress,
    kind: 'plan',
    input,
    messages: planMessages(input),
    normalize: normalizePlan,
    validate: (out) => validatePlan(out, ctx),
    demo: demoPlan,
    fallback: (out) => {
      metrics.repairs += 1;
      return repairPlan(out, ctx);
    },
  });
  result.output.schedule.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return { ...result, input };
}

// ---------------------------------------------------------------------------
// Review Period
// ---------------------------------------------------------------------------

function previousAnchor(range, date) {
  if (range === 'day') return addDays(date, -1);
  if (range === 'week') return addDays(date, -7);
  return addDays(rangeFor('month', date).start, -1);
}

export function buildReviewInput(db, { range, date, includeJournal }) {
  const stats = computeStats(db, { range, date });
  const prev = computeStats(db, { range, date: previousAnchor(range, date) });
  const per = stats.estimate.perTask;
  const over = [...per].sort((a, b) => (b.actualMinutes - b.estimateMinutes) - (a.actualMinutes - a.estimateMinutes))[0];
  const under = [...per].sort((a, b) => (a.actualMinutes - a.estimateMinutes) - (b.actualMinutes - b.estimateMinutes))[0];

  const input = {
    period: { range, start: stats.start, end: stats.end },
    stats: {
      focusedMinutes: stats.focusedMinutes,
      sessionsCount: stats.sessionsCount,
      previousPeriodFocusedMinutes: prev.focusedMinutes,
      ...(range !== 'month' ? { byDay: stats.byDay.map(({ label, minutes }) => ({ label, minutes })) } : {}),
      byCategory: stats.byCategory.map(({ category, minutes }) => ({ category, minutes })),
      topTasks: stats.topTasks.map(({ title, minutes }) => ({ title, minutes })),
      completion: { planned: stats.completion.planned, completed: stats.completion.completed, rate: stats.completion.rate },
      estimate: {
        tasksCompared: stats.estimate.tasksCompared,
        accuracy: stats.estimate.accuracy,
        actualToEstimateRatio: stats.estimate.actualToEstimateRatio,
        ...(over && over.actualMinutes > over.estimateMinutes ? { mostOver: { title: over.title, estimateMinutes: over.estimateMinutes, actualMinutes: over.actualMinutes } } : {}),
        ...(under && under.actualMinutes < under.estimateMinutes ? { mostUnder: { title: under.title, estimateMinutes: under.estimateMinutes, actualMinutes: under.actualMinutes } } : {}),
      },
      journalTagCounts: stats.journal.tagCounts,
    },
  };

  if (includeJournal) {
    const { start, end } = stats;
    const tz = stats.timezone;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    input.journal = db.journal
      .map((j) => ({ ...j, date: fmt.format(new Date(j.createdAt)) }))
      .filter((j) => j.date >= start && j.date <= end)
      .slice(-12)
      .map((j) => ({ date: j.date, tags: j.tags, ...(j.energy ? { energy: j.energy } : {}), text: j.body.slice(0, JOURNAL_AI_CHARS) }));
  }
  return { input, stats };
}

export async function generateReview(db, opts, provider, onProgress) {
  const { input, stats } = buildReviewInput(db, opts);
  const result = await runWithRefinement({
    provider,
    onProgress,
    kind: 'review',
    input,
    messages: reviewMessages(input),
    normalize: normalizeReview,
    validate: validateReview,
    demo: demoReview,
    fallback: (out, problems) => {
      // Keep a well-formed review but tell the user what could not be verified.
      const shapeOk = typeof out.summary === 'string' && Array.isArray(out.patterns) && Array.isArray(out.suggestions);
      if (!shapeOk) throw new ProviderError('The AI review did not pass validation. Please try again.');
      return {
        ...out,
        suggestions: out.suggestions.slice(0, 2),
        journalThemes: input.journal ? out.journalThemes : [],
        warnings: [...out.warnings, ...problems.map((p) => `Not fully verified: ${p}`)],
      };
    },
  });
  return { ...result, input, stats };
}

// ---------------------------------------------------------------------------
// Break Down Task
// ---------------------------------------------------------------------------

export function buildBreakdownInput(task) {
  return {
    task: {
      title: task.title,
      category: task.category,
      estimateMinutes: task.estimateMinutes,
      dueDate: task.dueDate,
      notes: (task.notes || '').slice(0, 300),
    },
  };
}

export async function generateBreakdown(task, provider, onProgress) {
  const input = buildBreakdownInput(task);
  const result = await runWithRefinement({
    provider,
    onProgress,
    kind: 'breakdown',
    input,
    messages: breakdownMessages(input),
    normalize: normalizeBreakdown,
    validate: validateBreakdown,
    demo: demoBreakdown,
    fallback: (out, problems) => {
      if (!Array.isArray(out.steps) || out.steps.length < 2) throw new ProviderError('The AI could not break this task down. Please try again.');
      return {
        ...out,
        steps: out.steps.slice(0, 8).map((s) => ({
          ...s,
          estimateMinutes: Math.min(90, Math.max(10, Math.round(Number(s.estimateMinutes) || 15))),
        })),
        warnings: [...out.warnings, ...problems.map((p) => `Not fully verified: ${p}`)],
      };
    },
  });
  return { ...result, input };
}

export { PROMPT_VERSION };
