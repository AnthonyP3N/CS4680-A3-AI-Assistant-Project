import { api } from '../api.js';
import {
  addDays, esc, fmtDateShort, fmtDateTime, fmtMinutes, fmtTime12, minutesToTime, nowMinutes, refresh, render,
  state, taskById, timeToMinutes, toast,
} from '../core.js';

const MODES = [
  ['plan', 'Plan a day'],
  ['review', 'Review a period'],
  ['breakdown', 'Break down a task'],
];

// --------------------------------------------------------------- forms ---

function defaultStart(date) {
  const pref = state.boot.preferences.dayStart;
  if (date !== state.boot.today) return pref;
  const next = Math.ceil((nowMinutes() + 5) / 15) * 15;
  return next > timeToMinutes(pref) ? minutesToTime(Math.min(next, 23 * 60)) : pref;
}

function planForm() {
  const c = state.coach;
  const today = state.boot.today;
  const date = c.planDate || today;
  const p = state.boot.preferences;
  const open = state.boot.tasks.filter((t) => t.status !== 'done');
  return `<form data-form="ai-plan" class="coach-form">
    <fieldset class="seg-field">
      <legend>Day</legend>
      <div class="seg">
        <label><input type="radio" name="date" value="${today}" ${date === today ? 'checked' : ''} data-change="plan-date"><span>Today</span></label>
        <label><input type="radio" name="date" value="${addDays(today, 1)}" ${date !== today ? 'checked' : ''} data-change="plan-date"><span>Tomorrow</span></label>
      </div>
    </fieldset>
    <div class="field-row">
      <label class="field"><span>Start at</span><input type="time" name="dayStart" value="${esc(defaultStart(date))}" required></label>
      <label class="field"><span>Time available (min)</span><input type="number" name="availableMinutes" min="15" max="960" step="15" value="${p.availableMinutes}" required></label>
    </div>
    <label class="field field-wide"><span>Anything to plan around? (optional)</span>
      <input name="userNote" maxlength="300" placeholder="e.g. Club meeting 4:00 to 4:30, low energy after work"></label>
    <p class="muted small">The coach sees your ${open.length} open ${open.length === 1 ? 'task' : 'tasks'} with deadlines, estimates and tracked time, plus your recent totals. Breaks follow your settings: ${p.breakMinutes} min every ${p.breakEveryMinutes} min.</p>
    <button class="btn btn-primary" ${open.length ? '' : 'disabled'}>${c.loading ? 'Drafting…' : 'Draft a plan'}</button>
    ${open.length ? '' : '<p class="muted small">Add a task first.</p>'}
  </form>`;
}

function reviewForm() {
  const c = state.coach;
  const range = c.reviewRange || 'week';
  return `<form data-form="ai-review" class="coach-form">
    <fieldset class="seg-field">
      <legend>Period</legend>
      <div class="seg">
        ${[['day', 'Today'], ['week', 'This week'], ['lastweek', 'Last week'], ['month', 'Month']].map(([v, l]) => {
          const checked = (c.reviewChoice || (range === 'week' && c.reviewDate && c.reviewDate < addDays(state.boot.today, -6) ? 'lastweek' : range)) === v;
          return `<label><input type="radio" name="period" value="${v}" ${checked ? 'checked' : ''}><span>${l}</span></label>`;
        }).join('')}
      </div>
    </fieldset>
    <label class="checkline consent">
      <input type="checkbox" name="includeJournal" ${c.includeJournal ? 'checked' : ''}>
      <span><strong>Include my journal</strong><br><span class="muted">Sends up to 12 entries from this period (first 400 characters each) so the coach can mention themes. Off by default.</span></span>
    </label>
    <button class="btn btn-primary">${c.loading ? 'Reviewing…' : 'Write my review'}</button>
  </form>`;
}

function breakdownForm() {
  const c = state.coach;
  const open = state.boot.tasks.filter((t) => t.status !== 'done' && !t.parentId);
  if (!open.length) return '<p class="muted">Add a task first, then come back to break it into steps.</p>';
  return `<form data-form="ai-breakdown" class="coach-form">
    <label class="field field-wide"><span>Task</span>
      <select name="taskId" required>${open.map((t) => `<option value="${esc(t.id)}" ${t.id === c.breakdownTaskId ? 'selected' : ''}>${esc(t.title)}${t.estimateMinutes ? ` (${fmtMinutes(t.estimateMinutes)})` : ''}</option>`).join('')}</select></label>
    <p class="muted small">Large tasks are easier to start and estimate in 10 to 90 minute steps. You choose which steps become subtasks.</p>
    <button class="btn btn-primary">${c.loading ? 'Breaking down…' : 'Break it down'}</button>
  </form>`;
}

// ------------------------------------------------------- shared pieces ---

function providerNote(rev) {
  const p = rev?.provider || state.boot.provider;
  if (p.name === 'demo' || p.demo) {
    return '<p class="provider provider-demo"><strong>Demo mode.</strong> This was produced by FocusFlow’s offline rules, not a language model. Add an API key in <code>.env</code> to use the AI coach.</p>';
  }
  return `<p class="provider">Written by ${esc(p.label)} (${esc(p.model)}), checked by FocusFlow.</p>`;
}

function checkLog(rev) {
  const steps = rev.attempts || [];
  return `<details class="checks" ${steps.some((s) => s.problems?.length) ? 'open' : ''}>
    <summary>How this was checked <span class="muted">${steps.length} ${steps.length === 1 ? 'step' : 'steps'}</span></summary>
    <ol class="check-steps">${steps.map((s) => `<li class="${s.passed ? 'ok' : 'bad'}">
      <span class="check-icon" aria-hidden="true">${s.passed ? '✓' : '!'}</span>
      <div><strong>${esc(s.step)}</strong> ${s.passed ? 'passed every check' : `had ${s.problems.length} ${s.problems.length === 1 ? 'problem' : 'problems'}, sent back for revision`}${s.note ? ` <span class="muted">${esc(s.note)}</span>` : ''}
      ${s.problems?.length ? `<ul>${s.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>
    </li>`).join('')}</ol>
  </details>`;
}

function inputView(rev) {
  return `<details class="ai-input"><summary>What the coach saw</summary>
    <p class="muted small">This is the complete data sent with the request, after FocusFlow calculated every number.</p>
    <pre>${esc(JSON.stringify(rev.input, null, 2))}</pre></details>`;
}

function notes(title, items, cls) {
  if (!items?.length) return '';
  return `<div class="notes ${cls}"><h3>${title}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
}

function decision(rev) {
  if (rev.status === 'proposed' || rev.status === 'info') return '';
  const when = rev.decidedAt ? fmtDateTime(rev.decidedAt) : '';
  const label = rev.status === 'rejected' ? 'You rejected this suggestion' : rev.status === 'accepted' ? 'You accepted this suggestion' : 'You accepted part of this suggestion';
  return `<p class="decision decision-${rev.status === 'rejected' ? 'no' : 'yes'}">${label}${rev.edited ? ' with edits' : ''}${when ? `, ${esc(when)}` : ''}.</p>`;
}

// ------------------------------------------------------------- results ---

function planResult(rev) {
  const o = rev.output;
  const c = state.coach;
  const editable = rev.status === 'proposed';
  const blocks = o.schedule.map((b, i) => ({ ...b, ...(c.edits[i] || {}) }));
  const chosen = blocks.filter((_, i) => c.selected?.has(i));
  const used = chosen.reduce((a, b) => a + Number(b.durationMinutes || 0), 0);
  const avail = rev.input.availableMinutes;
  const unsched = (o.unscheduled || []).map((u) => ({ ...u, title: taskById(u.taskId)?.title || rev.input.tasks.find((t) => t.id === u.taskId)?.title || 'Task' }));

  return `<article class="result">
    <header class="result-head">
      <h2>Plan for ${rev.date === state.boot.today ? 'today' : esc(fmtDateShort(rev.date))}</h2>
      <p class="result-summary">${esc(o.summary)}</p>
      ${providerNote(rev)}
    </header>
    ${decision(rev)}
    ${checkLog(rev)}
    <form data-form="accept-plan">
      <table class="plan-table">
        <thead><tr>${editable ? '<th scope="col"><span class="sr-only">Include</span></th>' : ''}<th scope="col">Start</th><th scope="col">Minutes</th><th scope="col">Block</th></tr></thead>
        <tbody>${blocks.map((b, i) => `<tr class="${b.type === 'break' ? 'is-break' : ''}${editable && !c.selected?.has(i) ? ' is-off' : ''}">
          ${editable ? `<td><input type="checkbox" data-change="toggle-block" data-i="${i}" ${c.selected?.has(i) ? 'checked' : ''} aria-label="Include ${esc(b.title)} at ${esc(b.start)}"></td>` : ''}
          <td>${editable ? `<input type="time" class="cell-input" value="${esc(b.start)}" data-change="edit-start" data-i="${i}" aria-label="Start time">` : esc(fmtTime12(b.start))}</td>
          <td>${editable ? `<input type="number" class="cell-input cell-num" min="5" max="240" step="5" value="${esc(b.durationMinutes)}" data-change="edit-dur" data-i="${i}" aria-label="Minutes">` : esc(b.durationMinutes)}</td>
          <td><div class="cell-title">${esc(b.type === 'break' ? 'Break' : b.title)}</div>${b.reason ? `<div class="cell-reason">${esc(b.reason)}</div>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table>
      ${editable ? `<p class="budget ${used > avail ? 'is-over' : ''}" aria-live="polite">Selected blocks use <strong>${used}</strong> of ${avail} available minutes${used > avail ? '. That is more than you have; uncheck or shorten a block.' : '.'}</p>` : ''}
      ${unsched.length ? `<div class="notes notes-unsched"><h3>Not in this plan</h3><ul>${unsched.map((u) => `<li><strong>${esc(u.title)}</strong>: ${esc(u.reason)}</li>`).join('')}</ul></div>` : ''}
      ${notes('Heads up', o.warnings, 'notes-warn')}
      ${notes('Assumptions', o.assumptions, 'notes-assume')}
      ${notes('Suggestions', o.suggestions, 'notes-suggest')}
      ${editable ? `<div class="result-actions">
        <button class="btn btn-primary" ${chosen.length ? '' : 'disabled'}>Add ${chosen.length} ${chosen.length === 1 ? 'block' : 'blocks'} to ${rev.date === state.boot.today ? 'today' : 'tomorrow'}</button>
        <button type="button" class="btn btn-ghost" data-action="reject">Reject</button>
        <button type="button" class="btn btn-ghost" data-action="regenerate">Try again</button>
      </div>
      <p class="muted small">Nothing changes until you add blocks. ${state.boot.schedules[rev.date] ? 'This replaces the plan you accepted earlier for that day.' : ''}</p>` : ''}
      ${rev.status !== 'proposed' && rev.status !== 'rejected' ? '<p><a href="#today" class="btn btn-ghost btn-sm">See it on Today</a></p>' : ''}
    </form>
    ${inputView(rev)}
  </article>`;
}

function reviewResult(rev) {
  const o = rev.output;
  const period = rev.input.period;
  return `<article class="result">
    <header class="result-head">
      <h2>Your ${esc(period.range)} in review</h2>
      <p class="muted">${esc(fmtDateShort(period.start))}${period.start !== period.end ? ` to ${esc(fmtDateShort(period.end))}` : ''}${rev.includeJournal ? ', journal included' : ', journal not shared'}</p>
      <p class="result-summary">${esc(o.summary)}</p>
      ${providerNote(rev)}
    </header>
    ${checkLog(rev)}
    ${o.highlights?.length ? `<div class="notes notes-good"><h3>Went well</h3><ul>${o.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
    <div class="patterns"><h3>Observed patterns</h3>
      ${o.patterns.map((p) => `<div class="pattern"><p class="pattern-obs">${esc(p.observation)}</p><p class="pattern-ev">${esc(p.evidence)}</p></div>`).join('')}
    </div>
    <div class="next-steps"><h3>Try next</h3>
      <ol>${o.suggestions.map((s) => `<li><strong>${esc(s.action)}</strong>${s.why ? `<span>${esc(s.why)}</span>` : ''}</li>`).join('')}</ol>
    </div>
    ${o.journalThemes?.length ? notes('From your journal', o.journalThemes, 'notes-journal') : ''}
    ${notes('Keep in mind', o.warnings, 'notes-warn')}
    <div class="result-actions">
      <button type="button" class="btn btn-primary" data-action="review-to-plan">Plan tomorrow with this in mind</button>
    </div>
    ${inputView(rev)}
  </article>`;
}

function breakdownResult(rev) {
  const o = rev.output;
  const c = state.coach;
  const editable = rev.status === 'proposed';
  const task = taskById(rev.taskId);
  const steps = o.steps.map((s, i) => ({ ...s, ...(c.edits[i] || {}) }));
  const chosen = steps.filter((_, i) => c.selected?.has(i));
  const sum = chosen.reduce((a, s) => a + Number(s.estimateMinutes || 0), 0);
  return `<article class="result">
    <header class="result-head">
      <h2>Steps for ${esc(task?.title || rev.input.task.title)}</h2>
      ${rev.input.task.estimateMinutes ? `<p class="muted">Task estimate ${fmtMinutes(rev.input.task.estimateMinutes)}</p>` : ''}
      ${providerNote(rev)}
    </header>
    ${decision(rev)}
    ${checkLog(rev)}
    <form data-form="accept-breakdown">
      <ol class="steps-edit">${steps.map((s, i) => `<li class="${editable && !c.selected?.has(i) ? 'is-off' : ''}">
        ${editable ? `<input type="checkbox" data-change="toggle-block" data-i="${i}" ${c.selected?.has(i) ? 'checked' : ''} aria-label="Include step ${i + 1}">` : ''}
        <div class="step-main">
          ${editable ? `<input class="cell-input step-title" value="${esc(s.title)}" maxlength="120" data-change="edit-title" data-i="${i}" aria-label="Step ${i + 1} title">` : `<strong>${esc(s.title)}</strong>`}
          ${s.doneWhen ? `<span class="cell-reason">Done when: ${esc(s.doneWhen)}</span>` : ''}
        </div>
        ${editable ? `<label class="step-min"><input type="number" class="cell-input cell-num" min="5" max="240" step="5" value="${esc(s.estimateMinutes)}" data-change="edit-dur" data-i="${i}" aria-label="Step ${i + 1} minutes"> min</label>` : `<span>${fmtMinutes(s.estimateMinutes)}</span>`}
      </li>`).join('')}</ol>
      ${editable ? `<p class="budget">Selected steps add up to <strong>${fmtMinutes(sum)}</strong>${rev.input.task.estimateMinutes ? ` (task estimate ${fmtMinutes(rev.input.task.estimateMinutes)})` : ''}.</p>` : ''}
      ${notes('Assumptions', o.assumptions, 'notes-assume')}
      ${notes('Heads up', o.warnings, 'notes-warn')}
      ${editable ? `<div class="result-actions">
        <button class="btn btn-primary" ${chosen.length && task ? '' : 'disabled'}>Add ${chosen.length} ${chosen.length === 1 ? 'step' : 'steps'} as subtasks</button>
        <button type="button" class="btn btn-ghost" data-action="reject">Reject</button>
        <button type="button" class="btn btn-ghost" data-action="regenerate">Try again</button>
      </div>` : ''}
    </form>
    ${inputView(rev)}
  </article>`;
}

function loadingView() {
  const msg = { plan: 'Drafting your plan, then checking it against your time window, deadlines, and breaks.', review: 'Reading your numbers and writing your review.', breakdown: 'Breaking the task into steps and checking the time adds up.' }[state.coach.mode];
  return `<div class="result result-loading" role="status">
    <div class="loader" aria-hidden="true"><span></span><span></span><span></span></div>
    <p>${msg}</p>
    <p class="muted small">If the first draft breaks a rule, FocusFlow sends it back for revision. This can take up to half a minute.</p>
  </div>`;
}

function emptyResult() {
  const lines = {
    plan: 'Your plan appears here as editable time blocks. Check the ones you want, adjust times, then add them to your day.',
    review: 'Your review appears here: what went well, observed patterns with the numbers behind them, and two things to try next.',
    breakdown: 'The steps appear here. Edit them, pick the ones you want, and they become subtasks.',
  };
  return `<div class="result result-empty"><p>${lines[state.coach.mode]}</p></div>`;
}

function history() {
  const list = state.boot.plans.slice(0, 8);
  if (!list.length) return '';
  const kind = { plan: 'Plan', review: 'Review', breakdown: 'Breakdown' };
  return `<section class="history" aria-labelledby="hist-h">
    <h2 id="hist-h">Earlier suggestions</h2>
    <ul>${list.map((r) => `<li><button class="hist-btn${state.coach.result?.id === r.id ? ' is-current' : ''}" data-action="open-rev" data-id="${esc(r.id)}">
      <span>${kind[r.kind]}${r.kind === 'plan' ? ` for ${esc(fmtDateShort(r.date))}` : r.kind === 'breakdown' ? `: ${esc(taskById(r.taskId)?.title || r.input.task.title)}` : ` of ${esc(r.input.period.range)}`}</span>
      <span class="muted">${esc(fmtDateTime(r.createdAt))}${r.status !== 'info' ? `, ${esc(r.status)}` : ''}</span>
    </button></li>`).join('')}</ul>
  </section>`;
}

const PATTERNS = `<details class="how-coach">
  <summary>How the coach works</summary>
  <dl>
    <dt>A consistent persona</dt><dd>Every request shares one set of instructions: a calm, practical coach that only uses your data, marks assumptions, and never diagnoses or judges.</dd>
    <dt>Worked examples</dt><dd>Each request includes a complete example of a good answer, so the coach learns the format and the judgment: fit the time budget, add breaks, say what didn’t fit.</dd>
    <dt>Check and revise</dt><dd>FocusFlow checks every answer in code: total time, overlaps, breaks, deadlines, real task names, numbers that exist in your data. Anything that fails goes back to the coach with the exact problems, up to two times.</dd>
    <dt>You decide</dt><dd>Nothing is saved until you accept it. All totals are calculated by FocusFlow, never by the AI.</dd>
  </dl>
</details>`;

export function renderCoach() {
  const c = state.coach;
  const p = state.boot.provider;
  let result;
  if (c.loading) result = loadingView();
  else if (c.error) result = `<div class="result error-box" role="alert"><p><strong>The coach couldn’t finish.</strong> ${esc(c.error)}</p><button class="btn btn-ghost btn-sm" data-action="regenerate">Try again</button></div>`;
  else if (c.result && c.result.kind === c.mode) result = { plan: planResult, review: reviewResult, breakdown: breakdownResult }[c.mode](c.result);
  else result = emptyResult();

  return `<div class="view view-coach">
    <div class="view-head">
      <h1>Coach</h1>
      <p class="lede">Realistic plans and honest reviews, built from your own tasks and tracked time.</p>
    </div>
    <div class="coach-grid">
      <div class="coach-side">
        <div class="tabs" role="tablist" aria-label="Coach actions">
          ${MODES.map(([m, l]) => `<button role="tab" type="button" aria-selected="${c.mode === m}" data-action="mode" data-mode="${m}">${l}</button>`).join('')}
        </div>
        <section class="panel">
          ${c.mode === 'plan' ? planForm() : c.mode === 'review' ? reviewForm() : breakdownForm()}
        </section>
        <p class="provider-line">${p.demo ? '<span class="dot dot-demo" aria-hidden="true"></span>Demo mode (no API key)' : `<span class="dot" aria-hidden="true"></span>${esc(p.label)}: ${esc(p.model)}`}</p>
      </div>
      <div class="coach-main" aria-live="polite">${result}</div>
      <div class="coach-extra">
        ${PATTERNS}
        ${history()}
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------ handlers ---

function setResult(rev) {
  const c = state.coach;
  c.result = rev;
  c.mode = rev.kind;
  c.edits = {};
  const items = rev.kind === 'plan' ? rev.output.schedule : rev.kind === 'breakdown' ? rev.output.steps : [];
  c.selected = new Set(items.map((_, i) => i));
}

async function runAI(path, body) {
  const c = state.coach;
  c.loading = true;
  c.error = null;
  c.lastRequest = { path, body };
  render();
  try {
    const rev = await api(path, { method: 'POST', body });
    setResult(rev);
    await refresh();
  } catch (err) {
    c.error = err.message;
  }
  c.loading = false;
  render();
  document.querySelector('.coach-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function reviewPeriod(choice) {
  const today = state.boot.today;
  if (choice === 'lastweek') return { range: 'week', date: addDays(today, -7) };
  if (choice === 'day') return { range: 'day', date: today };
  if (choice === 'month') return { range: 'month', date: today };
  return { range: 'week', date: today };
}

export const coachHandlers = {
  async click(action, el) {
    const c = state.coach;
    switch (action) {
      case 'mode':
        c.mode = el.dataset.mode;
        c.error = null;
        render();
        return true;
      case 'open-rev': {
        const rev = state.boot.plans.find((r) => r.id === el.dataset.id);
        if (rev) { c.error = null; setResult(rev); render(); }
        return true;
      }
      case 'reject':
        try {
          setResult(await api(`/api/plans/${c.result.id}/reject`, { method: 'POST' }));
          await refresh();
          toast('Suggestion rejected. Nothing was changed.');
        } catch (err) { toast(err.message, { tone: 'error' }); }
        render();
        return true;
      case 'regenerate':
        if (c.lastRequest) await runAI(c.lastRequest.path, c.lastRequest.body);
        else { c.error = null; render(); }
        return true;
      case 'review-to-plan':
        c.mode = 'plan';
        c.planDate = addDays(state.boot.today, 1);
        c.result = null;
        render();
        return true;
      default:
        return false;
    }
  },
  async change(name, el) {
    const c = state.coach;
    const i = Number(el.dataset.i);
    switch (name) {
      case 'plan-date':
        c.planDate = el.value;
        // Only the start-time default depends on the day.
        document.querySelector('[name=dayStart]').value = defaultStart(el.value);
        return true;
      case 'toggle-block':
        if (el.checked) c.selected.add(i); else c.selected.delete(i);
        render();
        return true;
      case 'edit-start':
        if (timeToMinutes(el.value) !== null) { c.edits[i] = { ...c.edits[i], start: el.value }; render(); }
        return true;
      case 'edit-dur': {
        const n = Number(el.value);
        if (Number.isInteger(n) && n >= 5 && n <= 240) { c.edits[i] = { ...c.edits[i], [c.result.kind === 'plan' ? 'durationMinutes' : 'estimateMinutes']: n }; render(); }
        return true;
      }
      case 'edit-title':
        c.edits[i] = { ...c.edits[i], title: el.value };
        return true;
      default:
        return false;
    }
  },
  async submit(name, form) {
    const c = state.coach;
    const fd = new FormData(form);
    switch (name) {
      case 'ai-plan':
        c.planDate = fd.get('date');
        await runAI('/api/ai/plan', {
          date: fd.get('date'),
          dayStart: fd.get('dayStart'),
          availableMinutes: Number(fd.get('availableMinutes')),
          userNote: fd.get('userNote') || '',
        });
        return true;
      case 'ai-review': {
        c.reviewChoice = fd.get('period');
        c.includeJournal = fd.get('includeJournal') === 'on';
        const { range, date } = reviewPeriod(c.reviewChoice);
        await runAI('/api/ai/review', { range, date, includeJournal: c.includeJournal });
        return true;
      }
      case 'ai-breakdown':
        c.breakdownTaskId = fd.get('taskId');
        await runAI('/api/ai/breakdown', { taskId: c.breakdownTaskId });
        return true;
      case 'accept-plan':
      case 'accept-breakdown': {
        const isPlan = name === 'accept-plan';
        const items = (isPlan ? c.result.output.schedule : c.result.output.steps)
          .map((b, i) => ({ ...b, ...(c.edits[i] || {}) }))
          .filter((_, i) => c.selected.has(i));
        try {
          const rev = await api(`/api/plans/${c.result.id}/accept`, { method: 'POST', body: isPlan ? { blocks: items } : { steps: items } });
          setResult(rev);
          await refresh();
          toast(isPlan ? `Added ${items.length} blocks to your plan` : `Added ${items.length} subtasks`);
        } catch (err) { toast(err.message, { tone: 'error' }); }
        render();
        return true;
      }
      default:
        return false;
    }
  },
};
