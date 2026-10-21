// Tests the iterative-refinement loop end to end with a fake LLM API.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSampleDb } from '../public/js/lib/seed.js';
import { generatePlan, generateReview } from '../public/js/lib/ai.js';
import { resolveProvider } from '../public/js/lib/providers.js';
import { validatePlan } from '../public/js/lib/validate.js';

const TODAY = '2026-10-21';
const realFetch = globalThis.fetch;

/** Pretend to be the Gemini API, replying with each given object in turn. */
function fakeGemini(replies) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    const text = typeof reply === 'function' ? reply(body) : JSON.stringify(reply);
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 },
    }), { status: 200 });
  };
  return requests;
}

// The visitor's own key, as it would come from Settings.
const GEMINI = resolveProvider({ provider: 'gemini', key: 'test-key' });

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('provider falls back to demo mode without a key', () => {
  assert.equal(resolveProvider({}).name, 'demo');
  assert.equal(resolveProvider({ provider: 'openai', key: '  ' }).name, 'demo');
  assert.equal(resolveProvider({ provider: 'openai', key: 'k' }).model, 'gpt-5-mini');
  assert.equal(resolveProvider({ provider: 'anthropic', key: 'k', model: 'my-model' }).model, 'my-model');
});

test('an overbooked draft is sent back with the exact problems, then the revision is accepted', async () => {
  const db = buildSampleDb('America/Los_Angeles', TODAY);
  const hw = db.tasks.find((t) => t.title === 'CS4680 homework 4');
  const calc = db.tasks.find((t) => t.title === 'Calculus problem set 7');
  const quiz = db.tasks.find((t) => t.title === 'Lab safety quiz');

  const overbooked = {
    summary: 'Do everything',
    schedule: [
      { type: 'task', taskId: hw.id, title: hw.title, start: '14:00', durationMinutes: 120, reason: 'Due today' },
      { type: 'task', taskId: calc.id, title: calc.title, start: '16:00', durationMinutes: 90, reason: 'Due tomorrow' },
    ],
    unscheduled: [], assumptions: [], warnings: [], suggestions: [],
  };
  const good = {
    summary: 'Homework first, then calculus.',
    schedule: [
      { type: 'task', taskId: hw.id, title: hw.title, start: '14:00', durationMinutes: 45, reason: 'Due today' },
      { type: 'break', taskId: null, title: 'Break', start: '14:45', durationMinutes: 10, reason: 'Rest' },
      { type: 'task', taskId: hw.id, title: hw.title, start: '14:55', durationMinutes: 45, reason: 'Due today' },
      { type: 'break', taskId: null, title: 'Break', start: '15:40', durationMinutes: 10, reason: 'Rest' },
      { type: 'task', taskId: calc.id, title: calc.title, start: '15:50', durationMinutes: 45, reason: 'Due tomorrow' },
    ],
    unscheduled: [{ taskId: quiz.id, reason: 'Low priority' }],
    assumptions: [], warnings: [], suggestions: [],
  };
  const requests = fakeGemini([overbooked, good]);

  const result = await generatePlan(db, { date: TODAY, dayStart: '14:00', availableMinutes: 180 }, GEMINI);

  assert.equal(requests.length, 2);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].passed, false);
  assert.equal(result.attempts[1].passed, true);
  assert.equal(result.output.summary, good.summary);

  // Persona is the system instruction; the few-shot example precedes the real request.
  const first = requests[0];
  assert.match(first.systemInstruction.parts[0].text, /FocusFlow Coach/);
  assert.equal(first.contents[1].role, 'model'); // worked example answer
  // The refinement turn quotes the specific failure.
  const lastTurn = requests[1].contents.at(-1).parts[0].text;
  assert.match(lastTurn, /did not pass FocusFlow's checks/);
  assert.match(lastTurn, /uses 210 minutes but only 180 are available/);
});

test('if the model keeps failing, code repairs the plan and says so', async () => {
  const db = buildSampleDb('America/Los_Angeles', TODAY);
  const hw = db.tasks.find((t) => t.title === 'CS4680 homework 4');
  const requests = fakeGemini([{
    summary: 'Marathon',
    schedule: [{ type: 'task', taskId: hw.id, title: hw.title, start: '14:00', durationMinutes: 240, reason: 'All of it' }],
  }]);
  const input = { date: TODAY, dayStart: '14:00', availableMinutes: 120 };
  const result = await generatePlan(db, input, GEMINI);
  assert.equal(requests.length, 3); // draft + 2 revisions
  assert.equal(result.attempts.at(-1).step, 'Safety fallback');
  assert.deepEqual(validatePlan(result.output, result.input), []);
});

test('non-JSON replies count as a failed check, not a crash', async () => {
  const db = buildSampleDb('America/Los_Angeles', TODAY);
  let n = 0;
  fakeGemini([() => (n++ === 0 ? 'Sure! Here is your review:' : JSON.stringify({
    summary: 'A steady week.',
    highlights: [],
    patterns: [{ observation: 'Consistent focus', evidence: 'Sessions on most days.' }],
    suggestions: [{ action: 'Keep the timer habit', why: 'It works' }, { action: 'Add buffers', why: 'Estimates run long' }],
    journalThemes: [],
    warnings: [],
  }))]);
  const result = await generateReview(db, { range: 'week', date: '2026-10-14', includeJournal: false }, GEMINI);
  assert.equal(result.attempts[0].passed, false);
  assert.match(result.attempts[0].problems[0], /not valid JSON/);
  assert.equal(result.attempts[1].passed, true);
  assert.equal(result.input.journal, undefined, 'journal text is not sent without opt-in');
});

test('journal text is only included when the user opts in', async () => {
  const db = buildSampleDb('America/Los_Angeles', TODAY);
  const requests = fakeGemini([{ summary: 's', patterns: [{ observation: 'o', evidence: 'e' }], suggestions: [{ action: 'a' }, { action: 'b' }], journalThemes: ['t'] }]);
  await generateReview(db, { range: 'week', date: '2026-10-14', includeJournal: true }, GEMINI);
  const sent = requests[0].contents.at(-1).parts[0].text;
  assert.match(sent, /Prompt lab went well/);
});

test('upstream auth errors are reported clearly and not retried', async () => {
  const db = buildSampleDb('America/Los_Angeles', TODAY);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }); };
  await assert.rejects(generatePlan(db, { date: TODAY }, GEMINI), /AI service error 400: API key not valid/);
  assert.equal(calls, 1);
});
