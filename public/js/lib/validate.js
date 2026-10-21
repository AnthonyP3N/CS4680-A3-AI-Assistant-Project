// Validation of model output. Each validator returns a list of human-readable
// problems; an empty list means the output passed. These problems are what the
// iterative-refinement loop sends back to the model.

import { minutesToTime, timeToMinutes } from './dates.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = 1000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

// Language the coach must never use (diagnosis or moral judgment).
const BANNED = /\b(lazy|laziness|failure|failing|worthless|ashamed|undisciplined|bad at|procrastinator|depress(ed|ion)|adhd|bipolar|anxiety disorder|disorder|diagnos(e|is|ed)|mental illness)\b/i;

export function findBannedLanguage(obj) {
  const hits = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      const m = v.match(new RegExp(BANNED.source, 'gi'));
      if (m) m.forEach((w) => hits.add(w.toLowerCase()));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  walk(obj);
  return [...hits];
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** Normalize optional fields so the UI can rely on them. */
export function normalizePlan(p) {
  if (!isObj(p)) return p;
  return {
    summary: p.summary,
    schedule: Array.isArray(p.schedule)
      ? p.schedule.map((b) => ({
        type: b?.type === 'break' ? 'break' : 'task',
        taskId: b?.type === 'break' ? null : b?.taskId ?? null,
        title: b?.title ?? (b?.type === 'break' ? 'Break' : ''),
        start: b?.start,
        durationMinutes: typeof b?.durationMinutes === 'string' ? Number(b.durationMinutes) : b?.durationMinutes,
        reason: b?.reason ?? '',
      }))
      : p.schedule,
    unscheduled: Array.isArray(p.unscheduled) ? p.unscheduled.filter(isObj) : [],
    assumptions: strArray(p.assumptions) ? p.assumptions : [],
    warnings: strArray(p.warnings) ? p.warnings : [],
    suggestions: strArray(p.suggestions) ? p.suggestions.slice(0, 2) : [],
  };
}

/**
 * Hard checks for a plan.
 * ctx = { tasks: [{id, title, daysUntilDue}], dayStart, availableMinutes, breakEveryMinutes, breakMinutes }
 */
export function validatePlan(plan, ctx) {
  const problems = [];
  if (!isObj(plan)) return ['The response was not a JSON object.'];
  if (!isStr(plan.summary, 600)) problems.push('"summary" must be a non-empty string under 600 characters.');
  if (!Array.isArray(plan.schedule)) return [...problems, '"schedule" must be an array.'];
  if (plan.schedule.length > 24) problems.push('"schedule" has too many blocks (max 24).');

  const ids = new Map(ctx.tasks.map((t) => [t.id, t]));
  const startMin = timeToMinutes(ctx.dayStart);
  const endMin = startMin + ctx.availableMinutes;
  const blocks = [];

  plan.schedule.forEach((b, i) => {
    const label = `Block ${i + 1}${b?.title ? ` ("${b.title}")` : ''}`;
    if (!isObj(b)) { problems.push(`${label} is not an object.`); return; }
    const start = timeToMinutes(b.start);
    if (start === null) { problems.push(`${label} has an invalid start time "${b.start}" (use HH:MM, 24-hour).`); return; }
    if (!Number.isInteger(b.durationMinutes) || b.durationMinutes < 5 || b.durationMinutes > 240) {
      problems.push(`${label} must have a whole-number durationMinutes between 5 and 240.`);
      return;
    }
    if (b.type === 'task') {
      if (!ids.has(b.taskId)) problems.push(`${label} uses taskId "${b.taskId}", which is not in the input. Only use provided task ids.`);
      if (!isStr(b.reason, 240)) problems.push(`${label} needs a short "reason".`);
    }
    blocks.push({ ...b, startMin: start, endMin: start + b.durationMinutes, label });
  });

  blocks.sort((a, b) => a.startMin - b.startMin);

  const total = blocks.reduce((a, b) => a + b.durationMinutes, 0);
  if (total > ctx.availableMinutes) {
    problems.push(`The schedule uses ${total} minutes but only ${ctx.availableMinutes} are available. Remove or shorten blocks and list what no longer fits in "unscheduled".`);
  }
  for (const b of blocks) {
    if (b.startMin < startMin) problems.push(`${b.label} starts at ${minutesToTime(b.startMin)}, before the window opens at ${ctx.dayStart}.`);
    if (b.endMin > endMin) problems.push(`${b.label} ends at ${minutesToTime(b.endMin)}, after the window closes at ${minutesToTime(endMin)}.`);
  }
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].startMin < blocks[i - 1].endMin) {
      problems.push(`${blocks[i].label} overlaps ${blocks[i - 1].label}.`);
    }
  }

  if (ctx.breakMinutes > 0) {
    let run = 0;
    let lastEnd = null;
    for (const b of blocks) {
      if (lastEnd !== null && b.startMin - lastEnd >= ctx.breakMinutes) run = 0; // a gap counts as a break
      if (b.type === 'break') run = 0;
      else {
        run += b.durationMinutes;
        if (run > ctx.breakEveryMinutes + 5) {
          problems.push(`There are ${run} minutes of continuous work ending at ${minutesToTime(b.endMin)}. Insert a ${ctx.breakMinutes}-minute break at least every ${ctx.breakEveryMinutes} minutes.`);
          run = 0; // report once per stretch
        }
      }
      lastEnd = b.endMin;
    }
  }

  const unscheduledIds = new Set((plan.unscheduled || []).map((u) => u.taskId));
  const scheduledIds = new Set(blocks.filter((b) => b.type === 'task').map((b) => b.taskId));
  for (const t of ctx.tasks) {
    if (t.daysUntilDue !== null && t.daysUntilDue <= 1 && !scheduledIds.has(t.id) && !unscheduledIds.has(t.id)) {
      problems.push(`"${t.title}" is due ${t.daysUntilDue < 0 ? 'already (overdue)' : t.daysUntilDue === 0 ? 'today' : 'tomorrow'} but is neither scheduled nor listed in "unscheduled" with a reason.`);
    }
  }
  for (const u of plan.unscheduled || []) {
    if (!ids.has(u.taskId)) problems.push(`"unscheduled" lists taskId "${u.taskId}", which is not in the input.`);
  }

  return problems;
}

/**
 * Deterministic last resort when the model cannot produce a valid plan:
 * keep the model's order, re-pack blocks from the window start, drop what
 * does not fit, and say so. Never invents new blocks.
 */
export function repairPlan(plan, ctx) {
  const ids = new Map(ctx.tasks.map((t) => [t.id, t]));
  const startMin = timeToMinutes(ctx.dayStart);
  const endMin = startMin + ctx.availableMinutes;
  const src = (Array.isArray(plan?.schedule) ? plan.schedule : [])
    .filter((b) => isObj(b) && Number.isFinite(Number(b.durationMinutes)))
    .filter((b) => b.type === 'break' || ids.has(b.taskId))
    .sort((a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0));

  const schedule = [];
  const dropped = new Set();
  let cursor = startMin;
  let run = 0;
  for (const b of src) {
    const dur = Math.max(5, Math.min(240, Math.round(Number(b.durationMinutes))));
    if (b.type === 'break') {
      if (!schedule.length || schedule[schedule.length - 1].type === 'break') continue;
      if (cursor + dur > endMin) break;
      schedule.push({ type: 'break', taskId: null, title: 'Break', start: minutesToTime(cursor), durationMinutes: dur, reason: b.reason || 'Rest' });
      cursor += dur; run = 0;
      continue;
    }
    let remaining = dur;
    while (remaining > 0) {
      if (ctx.breakMinutes > 0 && run >= ctx.breakEveryMinutes) {
        if (cursor + ctx.breakMinutes >= endMin) break;
        schedule.push({ type: 'break', taskId: null, title: 'Break', start: minutesToTime(cursor), durationMinutes: ctx.breakMinutes, reason: 'Added to keep breaks regular' });
        cursor += ctx.breakMinutes; run = 0;
      }
      const room = endMin - cursor;
      const chunk = Math.min(remaining, room, ctx.breakMinutes > 0 ? ctx.breakEveryMinutes - run : remaining);
      if (chunk < 5) break;
      schedule.push({ type: 'task', taskId: b.taskId, title: ids.get(b.taskId).title, start: minutesToTime(cursor), durationMinutes: chunk, reason: b.reason || 'From the AI draft' });
      cursor += chunk; run += chunk; remaining -= chunk;
    }
    if (remaining > 0) dropped.add(b.taskId);
  }
  while (schedule.length && schedule[schedule.length - 1].type === 'break') schedule.pop();

  const unscheduled = [...(Array.isArray(plan?.unscheduled) ? plan.unscheduled.filter((u) => ids.has(u?.taskId)) : [])];
  for (const id of dropped) if (!unscheduled.some((u) => u.taskId === id)) unscheduled.push({ taskId: id, reason: 'Did not fit in the available time' });
  const scheduledIds = new Set(schedule.map((b) => b.taskId));
  for (const t of ctx.tasks) {
    if (t.daysUntilDue !== null && t.daysUntilDue <= 1 && !scheduledIds.has(t.id) && !unscheduled.some((u) => u.taskId === t.id)) {
      unscheduled.push({ taskId: t.id, reason: 'Due soon but did not fit in the available time' });
    }
  }

  return {
    summary: isStr(plan?.summary, 600) ? plan.summary : 'Plan adjusted to fit your available time.',
    schedule,
    unscheduled,
    assumptions: strArray(plan?.assumptions) ? plan.assumptions : [],
    warnings: [...(strArray(plan?.warnings) ? plan.warnings : []), 'FocusFlow adjusted this plan automatically so it fits your time window and break settings.'],
    suggestions: strArray(plan?.suggestions) ? plan.suggestions.slice(0, 2) : [],
  };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export function normalizeReview(r) {
  if (!isObj(r)) return r;
  return {
    summary: r.summary,
    highlights: strArray(r.highlights) ? r.highlights.slice(0, 3) : [],
    patterns: Array.isArray(r.patterns) ? r.patterns.filter(isObj) : r.patterns,
    suggestions: Array.isArray(r.suggestions)
      ? r.suggestions.map((s) => (typeof s === 'string' ? { action: s, why: '' } : s)).filter(isObj)
      : r.suggestions,
    journalThemes: strArray(r.journalThemes) ? r.journalThemes : [],
    warnings: strArray(r.warnings) ? r.warnings : [],
  };
}

/** Every number found anywhere in the input, plus common unit conversions. */
export function allowedNumbers(input) {
  const set = new Set();
  const add = (n) => {
    if (!Number.isFinite(n)) return;
    for (const v of [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100]) set.add(v);
  };
  const walk = (v) => {
    if (typeof v === 'number') {
      add(v);
      add(v * 100); // rate -> percent
      add(v / 60); // minutes -> hours
      add(Math.floor(v / 60)); // "2 hours 15 minutes"
      add(v % 60);
    } else if (typeof v === 'string') {
      for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) add(Number(m[0]));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  walk(input);
  return set;
}

/** Numbers in model text that are not in the input (ignores 0-12, years and dates). */
export function ungroundedNumbers(output, input) {
  const allowed = allowedNumbers(input);
  const found = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      const cleaned = v
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '') // dates
        .replace(/\b\d{1,2}:\d{2}\b/g, ''); // clock times
      for (const m of cleaned.matchAll(/\d+(?:\.\d+)?/g)) {
        const n = Number(m[0]);
        if (n <= 12 || (n >= 1900 && n <= 2100)) continue;
        const ok = allowed.has(n) || allowed.has(Math.round(n)) || [...allowed].some((a) => Math.abs(a - n) <= 0.51 && n > 20);
        if (!ok) found.add(m[0]);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.values(v).forEach(walk);
  };
  walk(output);
  return [...found];
}

export function validateReview(review, input) {
  const problems = [];
  if (!isObj(review)) return ['The response was not a JSON object.'];
  if (!isStr(review.summary, 800)) problems.push('"summary" must be a non-empty string under 800 characters.');
  if (!Array.isArray(review.patterns) || review.patterns.length < 1 || review.patterns.length > 4) {
    problems.push('"patterns" must have 1 to 4 items.');
  } else if (!review.patterns.every((p) => isStr(p.observation, 300) && isStr(p.evidence, 400))) {
    problems.push('Each pattern needs an "observation" and "evidence" string.');
  }
  if (!Array.isArray(review.suggestions) || review.suggestions.length !== 2) {
    problems.push('Give exactly 2 suggestions.');
  } else if (!review.suggestions.every((s) => isStr(s.action, 300))) {
    problems.push('Each suggestion needs an "action".');
  }
  if (!input.journal && review.journalThemes?.length) {
    problems.push('Journal entries were not shared, so "journalThemes" must be an empty array.');
  }
  const banned = findBannedLanguage(review);
  if (banned.length) {
    problems.push(`Avoid judgmental or diagnostic language (${banned.join(', ')}). Describe observed patterns instead.`);
  }
  const ungrounded = ungroundedNumbers(review, input);
  if (ungrounded.length) {
    problems.push(`These numbers do not appear in the input data: ${ungrounded.join(', ')}. Only use numbers from the input.`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Breakdown
// ---------------------------------------------------------------------------

export function normalizeBreakdown(b) {
  if (!isObj(b)) return b;
  return {
    steps: Array.isArray(b.steps)
      ? b.steps.filter(isObj).map((s) => ({
        title: s.title,
        estimateMinutes: typeof s.estimateMinutes === 'string' ? Number(s.estimateMinutes) : s.estimateMinutes,
        doneWhen: typeof s.doneWhen === 'string' ? s.doneWhen : '',
      }))
      : b.steps,
    assumptions: strArray(b.assumptions) ? b.assumptions : [],
    warnings: strArray(b.warnings) ? b.warnings : [],
  };
}

export function validateBreakdown(out, input) {
  const problems = [];
  if (!isObj(out)) return ['The response was not a JSON object.'];
  if (!Array.isArray(out.steps) || out.steps.length < 2 || out.steps.length > 8) {
    return ['"steps" must have 2 to 8 items.'];
  }
  out.steps.forEach((s, i) => {
    if (!isStr(s.title, 80)) problems.push(`Step ${i + 1} needs a title under 80 characters.`);
    if (!Number.isInteger(s.estimateMinutes) || s.estimateMinutes < 10 || s.estimateMinutes > 90) {
      problems.push(`Step ${i + 1} must have a whole-number estimateMinutes between 10 and 90.`);
    }
  });
  const est = input.task.estimateMinutes;
  if (est) {
    const sum = out.steps.reduce((a, s) => a + (Number(s.estimateMinutes) || 0), 0);
    if (sum < est * 0.75 || sum > est * 1.25) {
      problems.push(`Step estimates add up to ${sum} minutes; they should be within 25% of the task estimate of ${est} minutes.`);
    }
  }
  const banned = findBannedLanguage(out);
  if (banned.length) problems.push(`Avoid judgmental language (${banned.join(', ')}).`);
  return problems;
}
