// Prompt engineering for FocusFlow.
//
// Three patterns from the course are used together:
//
// 1. PERSONA — every request shares one system prompt that defines the AI as a
//    supportive, practical productivity coach with explicit boundaries (no
//    diagnosis, no moral judgment, no invented facts, JSON only).
//
// 2. FEW-SHOT — each action sends a worked example (input -> ideal output) as
//    a prior user/assistant turn before the real request. The examples teach
//    the exact JSON shape and, more importantly, the judgment we want: keep
//    plans inside the time budget, insert breaks, say what did NOT fit and why,
//    cite numbers from the data as evidence, and keep the tone kind.
//
// 3. ITERATIVE REFINEMENT — after the model answers, application code checks
//    the draft against hard constraints (lib/validate.js). If anything fails,
//    the draft and a list of the specific failures are sent back with a
//    "revise" instruction, up to two times. The UI shows this refinement log.

export const PROMPT_VERSION = 'focusflow-prompts-v1';

export const PERSONA = `You are FocusFlow Coach, a calm, practical productivity coach inside a student planning app.

How you think:
- Realistic over ambitious. A plan that fits the time budget beats an impressive plan that fails.
- You work only from the JSON data you are given. Never invent tasks, deadlines, calendar events, completed work, or numbers.
- If something is missing or uncertain, say so in "assumptions" or "warnings" instead of guessing silently.
- Deadlines first, then priority, then smallest-useful-next-step.

How you speak:
- Concise, specific, warm, and non-judgmental. Speak to the user as "you".
- Describe behavior as "observed patterns", never as character traits. Never use words like lazy, failure, or bad at.
- You are not a therapist or doctor. Never diagnose or name mental-health conditions. If the user's notes mention distress, gently suggest talking to someone they trust or campus support, and keep the focus on planning.
- No productivity moralizing: rest and breaks are part of a good plan, not a reward.

Output rules:
- Respond with a single JSON object that matches the requested schema. No markdown, no code fences, no text outside the JSON.
- Do not include hidden reasoning. Put short, user-facing reasons in the "reason" / "why" / "evidence" fields.`;

// ---------------------------------------------------------------------------
// Create Plan
// ---------------------------------------------------------------------------

export const PLAN_SCHEMA = `{
  "summary": "1-2 sentences explaining the plan",
  "schedule": [
    { "type": "task", "taskId": "<id from input>", "title": "<task title>", "start": "HH:MM", "durationMinutes": 45, "reason": "short reason" },
    { "type": "break", "taskId": null, "title": "Break", "start": "HH:MM", "durationMinutes": 10, "reason": "short reason" }
  ],
  "unscheduled": [ { "taskId": "<id>", "reason": "why it did not fit today" } ],
  "assumptions": ["anything you assumed"],
  "warnings": ["deadline conflicts, overload, or missing information"],
  "suggestions": ["at most two practical adjustments"]
}`;

export const PLAN_RULES = `Planning rules (these are checked by code; violations are sent back to you):
1. The window starts at "dayStart" and lasts "availableMinutes". Every block must start at or after dayStart and end at or before windowEnd.
2. The sum of all durationMinutes (tasks AND breaks) must be <= availableMinutes. Blocks must not overlap.
3. Never schedule more than "breakEveryMinutes" of continuous task time without a break of "breakMinutes" (when breakMinutes > 0).
4. Only use taskIds that appear in the input. Use the task's title exactly.
5. Every task with "daysUntilDue" <= 1 must appear in "schedule" or in "unscheduled" with a reason. Overdue tasks (negative daysUntilDue) deserve a warning.
6. Use "remainingMinutes" as the work left. If recentStats.actualToEstimateRatio is above 1.15, the user's tasks usually take longer than estimated: mention that and prefer scheduling the most urgent work fully rather than splitting time across everything.
7. A task can be split into several blocks. It is fine to leave time unused; never pad the plan.
8. If userNote mentions a fixed commitment, keep the plan clear of it and list it in assumptions.`;

const PLAN_EXAMPLE_INPUT = {
  date: '2026-03-10',
  dayStart: '14:00',
  availableMinutes: 150,
  windowEnd: '16:30',
  breakEveryMinutes: 45,
  breakMinutes: 10,
  tasks: [
    { id: 't1', title: 'Physics lab report', category: 'Homework', priority: 'high', dueDate: '2026-03-11', daysUntilDue: 1, estimateMinutes: 90, trackedMinutes: 0, remainingMinutes: 90 },
    { id: 't2', title: 'Read chapter 6', category: 'Study', priority: 'medium', dueDate: '2026-03-14', daysUntilDue: 4, estimateMinutes: 60, trackedMinutes: 0, remainingMinutes: 60 },
    { id: 't3', title: 'Update resume', category: 'Personal', priority: 'low', dueDate: null, daysUntilDue: null, estimateMinutes: 45, trackedMinutes: 0, remainingMinutes: 45 },
  ],
  recentStats: { focusedMinutesLast7Days: 410, completionRate: 0.7, estimateAccuracy: 0.74, actualToEstimateRatio: 1.25 },
  userNote: '',
};

const PLAN_EXAMPLE_OUTPUT = {
  summary: 'The lab report is due tomorrow, so it gets the first two focus blocks. Chapter 6 starts today and finishes later this week; the resume waits.',
  schedule: [
    { type: 'task', taskId: 't1', title: 'Physics lab report', start: '14:00', durationMinutes: 45, reason: 'Due tomorrow and high priority' },
    { type: 'break', taskId: null, title: 'Break', start: '14:45', durationMinutes: 10, reason: 'Reset after 45 minutes of focus' },
    { type: 'task', taskId: 't1', title: 'Physics lab report', start: '14:55', durationMinutes: 45, reason: 'Finish the remaining 45 minutes' },
    { type: 'break', taskId: null, title: 'Break', start: '15:40', durationMinutes: 10, reason: 'Scheduled break' },
    { type: 'task', taskId: 't2', title: 'Read chapter 6', start: '15:50', durationMinutes: 30, reason: 'Make a start; due in 4 days' },
  ],
  unscheduled: [
    { taskId: 't2', reason: 'The other 30 minutes fit better later this week' },
    { taskId: 't3', reason: 'No deadline and low priority; no time left today' },
  ],
  assumptions: ['You can work continuously from 14:00 to 16:30.'],
  warnings: ['Your recent tasks took about 1.25x your estimates, so the lab report may need extra time tonight.'],
  suggestions: [
    'If the lab report runs long, take time from the chapter 6 block rather than skipping a break.',
    'Try estimating the next report at about 110 minutes.',
  ],
};

export function planMessages(input) {
  return [
    {
      role: 'user',
      content: `Create a plan for this day.\n\n${PLAN_RULES}\n\nReturn JSON with this shape:\n${PLAN_SCHEMA}\n\nINPUT:\n${JSON.stringify(PLAN_EXAMPLE_INPUT)}`,
    },
    { role: 'assistant', content: JSON.stringify(PLAN_EXAMPLE_OUTPUT) },
    {
      role: 'user',
      content: `Good. Same rules and shape for this new day.\n\nINPUT:\n${JSON.stringify(input)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Review Period
// ---------------------------------------------------------------------------

export const REVIEW_SCHEMA = `{
  "summary": "2-3 sentences, supportive and specific",
  "highlights": ["1-3 things that went well, grounded in the data"],
  "patterns": [ { "observation": "an observed pattern", "evidence": "the numbers from the input that show it" } ],
  "suggestions": [ { "action": "a concrete next step", "why": "how it connects to the data" } ],
  "journalThemes": ["themes from journal entries; MUST be [] when journal is not provided"],
  "warnings": ["missing or thin data, uncertainty"]
}`;

export const REVIEW_RULES = `Review rules (checked by code):
1. Every number you mention must come from the input (you may convert a 0-1 rate to a percent, or minutes to hours). Do not compute new totals.
2. Give exactly 2 suggestions and 1-4 patterns. Each suggestion must be something the user can do in the next week.
3. If "journal" is absent, "journalThemes" must be an empty array and you must not guess about feelings.
4. No diagnosis, no mental-health labels, no moral judgments. Use "observed pattern" language.
5. If there is little data (for example under 60 focused minutes or fewer than 3 sessions), say so in warnings and keep conclusions tentative.`;

const REVIEW_EXAMPLE_INPUT = {
  period: { range: 'week', start: '2026-03-02', end: '2026-03-08' },
  stats: {
    focusedMinutes: 540,
    sessionsCount: 11,
    previousPeriodFocusedMinutes: 380,
    byDay: [
      { label: 'Mon', minutes: 150 }, { label: 'Tue', minutes: 120 }, { label: 'Wed', minutes: 0 },
      { label: 'Thu', minutes: 90 }, { label: 'Fri', minutes: 0 }, { label: 'Sat', minutes: 180 }, { label: 'Sun', minutes: 0 },
    ],
    byCategory: [{ category: 'Homework', minutes: 360 }, { category: 'Study', minutes: 120 }, { category: 'Personal', minutes: 60 }],
    completion: { planned: 8, completed: 6, rate: 0.75 },
    estimate: { tasksCompared: 5, accuracy: 0.71, actualToEstimateRatio: 1.32, mostOver: { title: 'Essay draft', estimateMinutes: 60, actualMinutes: 115 } },
    journalTagCounts: { distraction: 3, 'energy-low': 2, win: 2 },
  },
  journal: [
    { date: '2026-03-04', tags: ['distraction', 'energy-low'], text: 'Kept checking my phone during the essay. Was tired after work.' },
    { date: '2026-03-07', tags: ['win'], text: 'Library on Saturday morning was great, finished two assignments.' },
  ],
};

const REVIEW_EXAMPLE_OUTPUT = {
  summary: 'You focused for 540 minutes this week, up from 380 last week, and completed 6 of 8 planned tasks. Your strongest work happened in longer weekend and early-week sessions.',
  highlights: ['Focused time rose from 380 to 540 minutes.', 'Completion rate of 75% (6 of 8 tasks).'],
  patterns: [
    { observation: 'Tasks are taking longer than planned.', evidence: 'Actual time was 1.32x estimates on average; "Essay draft" was estimated at 60 minutes and took 115.' },
    { observation: 'Focus is concentrated on a few days.', evidence: 'Wednesday, Friday, and Sunday had 0 focused minutes, while Saturday had 180.' },
  ],
  suggestions: [
    { action: 'Add about a third to writing-task estimates next week.', why: 'Your actual-to-estimate ratio was 1.32, and the essay took nearly twice its estimate.' },
    { action: 'Book one Saturday-morning library block in advance.', why: 'Your journal and the 180-minute Saturday both point to it as your most productive setting.' },
  ],
  journalThemes: ['Phone distractions during writing', 'Lower energy after work shifts', 'Library sessions feel productive'],
  warnings: [],
};

export function reviewMessages(input) {
  return [
    {
      role: 'user',
      content: `Review this period for the user.\n\n${REVIEW_RULES}\n\nReturn JSON with this shape:\n${REVIEW_SCHEMA}\n\nINPUT:\n${JSON.stringify(REVIEW_EXAMPLE_INPUT)}`,
    },
    { role: 'assistant', content: JSON.stringify(REVIEW_EXAMPLE_OUTPUT) },
    { role: 'user', content: `Good. Same rules and shape for this period.\n\nINPUT:\n${JSON.stringify(input)}` },
  ];
}

// ---------------------------------------------------------------------------
// Break Down Task
// ---------------------------------------------------------------------------

export const BREAKDOWN_SCHEMA = `{
  "steps": [ { "title": "verb-first step, under 80 characters", "estimateMinutes": 25, "doneWhen": "a visible finish line" } ],
  "assumptions": ["what you assumed about the task"],
  "warnings": ["missing information or risks"]
}`;

export const BREAKDOWN_RULES = `Breakdown rules (checked by code):
1. 2 to 8 steps, in the order the user should do them. Each step 10-90 minutes.
2. If estimateMinutes is given, the step estimates must add up to within 25% of it. If it is null, choose sensible sizes and say so in assumptions.
3. Start each title with a verb. The first step should be easy to start within 5 minutes.
4. Only use information in the input; do not invent requirements such as page counts or rubrics — list unknowns as warnings instead.`;

const BREAKDOWN_EXAMPLE_INPUT = {
  task: { title: 'History essay on the Industrial Revolution', category: 'Homework', estimateMinutes: 180, dueDate: '2026-03-15', notes: '1500 words' },
};

const BREAKDOWN_EXAMPLE_OUTPUT = {
  steps: [
    { title: 'Reread the prompt and write a one-sentence thesis', estimateMinutes: 15, doneWhen: 'A draft thesis is written at the top of the doc' },
    { title: 'Collect 4-5 sources and note one key point from each', estimateMinutes: 40, doneWhen: 'Each source has a one-line note' },
    { title: 'Outline intro, three body sections, and conclusion', estimateMinutes: 20, doneWhen: 'Each section has 2-3 bullet points' },
    { title: 'Draft the body sections', estimateMinutes: 60, doneWhen: 'About 1100 words drafted' },
    { title: 'Write intro and conclusion', estimateMinutes: 25, doneWhen: 'Full draft near 1500 words' },
    { title: 'Revise and format citations', estimateMinutes: 20, doneWhen: 'Citations checked and essay proofread once' },
  ],
  assumptions: ['The essay needs outside sources and citations.'],
  warnings: ['The citation style was not specified; check the assignment.'],
};

export function breakdownMessages(input) {
  return [
    {
      role: 'user',
      content: `Break this task into small, time-bounded steps.\n\n${BREAKDOWN_RULES}\n\nReturn JSON with this shape:\n${BREAKDOWN_SCHEMA}\n\nINPUT:\n${JSON.stringify(BREAKDOWN_EXAMPLE_INPUT)}`,
    },
    { role: 'assistant', content: JSON.stringify(BREAKDOWN_EXAMPLE_OUTPUT) },
    { role: 'user', content: `Good. Same rules and shape for this task.\n\nINPUT:\n${JSON.stringify(input)}` },
  ];
}

// ---------------------------------------------------------------------------
// Iterative refinement
// ---------------------------------------------------------------------------

export function refinementMessage(problems) {
  return `Your draft did not pass FocusFlow's checks:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nRevise the draft to fix every item above. Keep the parts that already passed, follow the same rules and JSON shape, and return only the corrected JSON object.`;
}

/** User-supplied free text gets clearly delimited so it is treated as data. */
export function sanitizeUserNote(note) {
  if (typeof note !== 'string') return '';
  return note.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
}

// Exported so tests can prove the few-shot examples obey the same checks.
export const EXAMPLES = {
  plan: { input: PLAN_EXAMPLE_INPUT, output: PLAN_EXAMPLE_OUTPUT },
  review: { input: REVIEW_EXAMPLE_INPUT, output: REVIEW_EXAMPLE_OUTPUT },
  breakdown: { input: BREAKDOWN_EXAMPLE_INPUT, output: BREAKDOWN_EXAMPLE_OUTPUT },
};
