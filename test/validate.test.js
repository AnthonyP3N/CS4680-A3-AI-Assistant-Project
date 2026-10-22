import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLES } from '../src/lib/prompts.js';
import {
  normalizeBreakdown, normalizePlan, normalizeReview, repairPlan, ungroundedNumbers,
  validateBreakdown, validatePlan, validateReview,
} from '../src/lib/validate.js';

const ctx = EXAMPLES.plan.input;

test('few-shot examples pass the same checks the model must pass', () => {
  assert.deepEqual(validatePlan(normalizePlan(EXAMPLES.plan.output), ctx), []);
  assert.deepEqual(validateReview(normalizeReview(EXAMPLES.review.output), EXAMPLES.review.input), []);
  assert.deepEqual(validateBreakdown(normalizeBreakdown(EXAMPLES.breakdown.output), EXAMPLES.breakdown.input), []);
});

test('plan over the time budget is rejected with a specific message', () => {
  const plan = normalizePlan({
    summary: 'Too much',
    schedule: [
      { type: 'task', taskId: 't1', title: 'Physics lab report', start: '14:00', durationMinutes: 45, reason: 'Due' },
      { type: 'break', start: '14:45', durationMinutes: 10 },
      { type: 'task', taskId: 't1', title: 'Physics lab report', start: '14:55', durationMinutes: 45, reason: 'Due' },
      { type: 'break', start: '15:40', durationMinutes: 10 },
      { type: 'task', taskId: 't2', title: 'Read chapter 6', start: '15:50', durationMinutes: 45, reason: 'Next' },
      { type: 'break', start: '16:35', durationMinutes: 10 },
      { type: 'task', taskId: 't3', title: 'Update resume', start: '16:45', durationMinutes: 45, reason: 'Later' },
    ],
  });
  const problems = validatePlan(plan, ctx);
  assert.ok(problems.some((p) => p.includes('uses 210 minutes but only 150')), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('after the window closes at 16:30')));
});

test('plan checks: overlaps, missing breaks, unknown tasks, and dropped deadlines', () => {
  const plan = normalizePlan({
    summary: 'Bad',
    schedule: [
      { type: 'task', taskId: 't2', title: 'Read chapter 6', start: '14:00', durationMinutes: 60, reason: 'x' },
      { type: 'task', taskId: 't2', title: 'Read chapter 6', start: '14:30', durationMinutes: 30, reason: 'x' },
      { type: 'task', taskId: 'made-up', title: 'Invented', start: '15:10', durationMinutes: 20, reason: 'x' },
    ],
  });
  const problems = validatePlan(plan, ctx).join('\n');
  assert.match(problems, /overlaps/);
  assert.match(problems, /continuous work/);
  assert.match(problems, /not in the input/);
  assert.match(problems, /Physics lab report" is due tomorrow but is neither scheduled/);
});

test('repairPlan turns a broken draft into a valid plan without inventing work', () => {
  const broken = {
    summary: 'Overbooked',
    schedule: [
      { type: 'task', taskId: 't1', title: 'Physics lab report', start: '14:00', durationMinutes: 120, reason: 'Due' },
      { type: 'task', taskId: 't2', title: 'Read chapter 6', start: '16:00', durationMinutes: 60, reason: 'Next' },
      { type: 'task', taskId: 'ghost', title: 'Ghost', start: '17:00', durationMinutes: 30, reason: 'x' },
    ],
  };
  const fixed = repairPlan(broken, ctx);
  assert.deepEqual(validatePlan(fixed, ctx), []);
  assert.ok(fixed.schedule.every((b) => b.type === 'break' || ['t1', 't2'].includes(b.taskId)));
  assert.ok(fixed.warnings.some((w) => w.includes('adjusted this plan automatically')));
});

test('review: invented numbers, diagnosis words, and unshared journal themes are caught', () => {
  const input = { period: { range: 'week' }, stats: { focusedMinutes: 540, completion: { rate: 0.75 } } };
  const review = normalizeReview({
    summary: 'You focused 540 minutes (75%) but wasted 312 minutes. You seem depressed and lazy.',
    patterns: [{ observation: 'x', evidence: 'y' }],
    suggestions: [{ action: 'a' }, { action: 'b' }],
    journalThemes: ['Tired'],
  });
  const problems = validateReview(review, input).join('\n');
  assert.match(problems, /312/);
  assert.doesNotMatch(problems, /540|75/);
  assert.match(problems, /depressed/);
  assert.match(problems, /lazy/);
  assert.match(problems, /journalThemes/);
});

test('ungroundedNumbers allows unit conversions of input numbers', () => {
  const input = { focusedMinutes: 540, rate: 0.75 };
  assert.deepEqual(ungroundedNumbers({ s: '540 minutes is 9 hours, 75% done' }, input), []);
});

test('breakdown steps must add up near the estimate', () => {
  const out = normalizeBreakdown({ steps: [{ title: 'Do A', estimateMinutes: 20 }, { title: 'Do B', estimateMinutes: 20 }] });
  const problems = validateBreakdown(out, { task: { estimateMinutes: 180 } });
  assert.ok(problems.some((p) => p.includes('add up to 40 minutes')));
});
