import { api } from '../api.js';
import {
  act, addDays, confirmDialog, esc, fmtClock, fmtDateTime, fmtMinutes, render, state, taskById, toast,
} from '../core.js';

export function elapsedSeconds() {
  const s = state.boot?.activeSession;
  if (!s) return 0;
  const base = s.elapsedSeconds || 0;
  return s.status === 'running' ? base + (Date.now() - state.bootAt) / 1000 : base;
}

export async function startTimer(taskId) {
  if (!taskId) { toast('Choose a task to focus on first.', { tone: 'error' }); return; }
  const ok = await act(() => api('/api/sessions/start', { method: 'POST', body: { taskId } }), { success: 'Focus session started' });
  if (ok && state.view !== 'focus') location.hash = '#focus';
}

// ------------------------------------------------------------ the dial ---

const R = 104;
const CIRC = 2 * Math.PI * R;

function dial(session) {
  const block = (state.boot.preferences.breakEveryMinutes || 45) * 60;
  const secs = elapsedSeconds();
  const frac = Math.min(1, secs / block);
  return `<div class="dial ${session ? `is-${session.status}` : 'is-idle'}" data-dial>
    <svg viewBox="0 0 240 240" aria-hidden="true">
      <circle class="dial-track" cx="120" cy="120" r="${R}"/>
      <circle class="dial-fill" cx="120" cy="120" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - frac)}" transform="rotate(-90 120 120)" data-dial-fill/>
    </svg>
    <div class="dial-face">
      <div class="dial-time" data-clock role="timer" aria-live="off">${fmtClock(secs)}</div>
      <div class="dial-sub" data-dial-sub>${session ? dialSub(session, secs, block) : `${block / 60}-minute focus block`}</div>
    </div>
  </div>`;
}

function dialSub(session, secs, block) {
  if (session.status === 'paused') return 'Paused';
  if (secs >= block) return 'Block complete. A break is a good idea.';
  return `${Math.ceil((block - secs) / 60)} min left in this block`;
}

/** Called every second: update only the numbers, not the whole page. */
export function tickTimer() {
  const s = state.boot?.activeSession;
  const secs = elapsedSeconds();
  const clock = fmtClock(secs);
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = clock; });
  if (s) {
    const block = (state.boot.preferences.breakEveryMinutes || 45) * 60;
    const fill = document.querySelector('[data-dial-fill]');
    if (fill) fill.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.min(1, secs / block))));
    const sub = document.querySelector('[data-dial-sub]');
    if (sub) sub.textContent = dialSub(s, secs, block);
    document.title = `${clock} ${s.taskTitle} | FocusFlow`;
  } else {
    document.title = 'FocusFlow';
  }
}

export function renderTimerPill() {
  const s = state.boot?.activeSession;
  if (!s) return '';
  return `<div class="pill ${s.status === 'paused' ? 'is-paused' : ''}">
    <a href="#focus" class="pill-link"><span class="pill-dot" aria-hidden="true"></span><span class="pill-task">${esc(s.taskTitle)}</span><span class="pill-time" data-clock>${fmtClock(elapsedSeconds())}</span></a>
    <button class="pill-btn" data-action="${s.status === 'running' ? 'pause' : 'resume'}" aria-label="${s.status === 'running' ? 'Pause timer' : 'Resume timer'}">
      ${s.status === 'running'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'}
    </button>
  </div>`;
}

// ---------------------------------------------------------------- view ---

/** Open tasks, most urgent first: due by tomorrow, then priority, then deadline. */
function taskOptions(selectedId) {
  const today = state.boot.today;
  const soon = addDays(today, 1);
  const w = { high: 0, medium: 1, low: 2 };
  const open = state.boot.tasks.filter((t) => t.status !== 'done')
    .sort((a, b) => ((a.dueDate && a.dueDate <= soon) ? 0 : 1) - ((b.dueDate && b.dueDate <= soon) ? 0 : 1)
      || w[a.priority] - w[b.priority]
      || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  return open.map((t) => `<option value="${esc(t.id)}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
}

function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function recentSessions() {
  const list = state.boot.recentSessions.slice(0, 12);
  if (!list.length) return '<p class="muted">Sessions you finish appear here.</p>';
  return `<ul class="sessions">${list.map((s) => {
    const title = taskById(s.taskId)?.title || s.taskTitleSnapshot || '(deleted task)';
    return `<li>
      <div class="session-main">
        <span class="session-title">${esc(title)}</span>
        <span class="session-dur">${fmtMinutes(s.durationSeconds / 60)}</span>
      </div>
      <div class="session-meta">
        <span>${esc(fmtDateTime(s.endedAt))}</span>
        ${s.source === 'manual' ? '<span class="tag">logged by hand</span>' : ''}
        ${s.note ? `<span class="session-note">${esc(s.note)}</span>` : ''}
        <button class="link-btn" data-action="delete-session" data-id="${esc(s.id)}" aria-label="Delete session for ${esc(title)}">Delete</button>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

export function renderFocus() {
  const s = state.boot.activeSession;
  const task = s ? taskById(s.taskId) : null;
  const hasOpen = state.boot.tasks.some((t) => t.status !== 'done');
  const preselect = state.focusTaskId || '';

  const controls = s
    ? `<div class="timer-task">
        <span class="muted">Focusing on</span>
        <strong>${esc(s.taskTitle)}</strong>
        ${task?.estimateMinutes ? `<span class="muted">${fmtMinutes(task.actualMinutes)} tracked before this session, estimate ${fmtMinutes(task.estimateMinutes)}</span>` : ''}
      </div>
      <div class="timer-controls">
        ${s.status === 'running'
          ? '<button class="btn btn-ghost btn-lg" data-action="pause">Pause</button>'
          : '<button class="btn btn-ghost btn-lg" data-action="resume">Resume</button>'}
        <button class="btn btn-primary btn-lg" data-action="open-stop">Stop and save</button>
      </div>`
    : hasOpen
      ? `<form class="timer-start" data-form="start-timer">
          <label class="field"><span>What are you working on?</span>
            <select name="taskId" required>${taskOptions(preselect)}</select></label>
          <button class="btn btn-primary btn-lg">Start focus</button>
        </form>`
      : `<div class="empty"><p>Add a task on the Today page, then start a focus session for it here.</p><a class="btn btn-ghost btn-sm" href="#today">Go to Today</a></div>`;

  return `<div class="view view-focus">
    <div class="view-head">
      <h1>Focus</h1>
      <p class="lede">Track the time a task really takes. The timer keeps running if you close or refresh the page.</p>
    </div>
    <div class="focus-grid">
      <section class="panel timer-panel" aria-label="Focus timer">
        ${dial(s)}
        ${controls}
      </section>
      <div class="stack">
        <section class="panel" aria-labelledby="log-h">
          <div class="panel-head"><h2 id="log-h">Log time by hand</h2></div>
          <p class="muted small">Forgot to start the timer? Add the time here.</p>
          ${hasOpen || state.boot.tasks.length ? `<form class="log-form" data-form="log-time">
            <label class="field field-wide"><span>Task</span><select name="taskId" required>${state.boot.tasks.filter((t) => t.status !== 'done').length ? taskOptions(preselect) : ''}</select></label>
            <label class="field"><span>Minutes</span><input name="minutes" type="number" min="1" max="720" required placeholder="120"></label>
            <label class="field"><span>Finished at</span><input name="endedAt" type="datetime-local" value="${nowLocalInput()}" max="${nowLocalInput()}"></label>
            <label class="checkline"><input type="checkbox" name="completeTask"> Mark the task done</label>
            <button class="btn btn-ghost">Log time</button>
          </form>` : '<p class="muted">Add a task first.</p>'}
        </section>
        <section class="panel" aria-labelledby="recent-h">
          <div class="panel-head"><h2 id="recent-h">Recent sessions</h2></div>
          ${recentSessions()}
        </section>
      </div>
    </div>
  </div>`;
}

function openStopDialog() {
  const s = state.boot.activeSession;
  if (!s) return;
  const dlg = document.getElementById('stop-dialog');
  dlg.innerHTML = `<form data-form="stop-timer">
    <h2 id="stop-title">Save this session</h2>
    <p class="stop-sum"><strong>${esc(s.taskTitle)}</strong> <span data-clock>${fmtClock(elapsedSeconds())}</span></p>
    <label class="field field-wide"><span>Quick note (optional)</span><input name="note" maxlength="500" placeholder="What did you get done?"></label>
    <label class="checkline"><input type="checkbox" name="completeTask"> The task is finished</label>
    <label class="checkline"><input type="checkbox" name="reflect" checked> Write a journal reflection next</label>
    <div class="dialog-actions">
      <button type="button" class="btn btn-ghost btn-danger-text" data-action="discard">Discard session</button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-action="close-stop">Keep going</button>
      <button class="btn btn-primary">Save session</button>
    </div>
  </form>`;
  dlg.showModal();
}

export const focusHandlers = {
  async click(action) {
    const s = state.boot.activeSession;
    switch (action) {
      case 'pause':
        if (s) await act(() => api(`/api/sessions/${s.id}/pause`, { method: 'POST' }));
        return true;
      case 'resume':
        if (s) await act(() => api(`/api/sessions/${s.id}/resume`, { method: 'POST' }));
        return true;
      case 'open-stop':
        openStopDialog();
        return true;
      case 'close-stop':
        document.getElementById('stop-dialog').close();
        return true;
      case 'discard': {
        document.getElementById('stop-dialog').close();
        const ok = await confirmDialog('Discard this session? The time will not be saved.', { confirmLabel: 'Discard' });
        if (ok && s) await act(() => api(`/api/sessions/${s.id}/discard`, { method: 'POST' }), { success: 'Session discarded' });
        return true;
      }
      default:
        return false;
    }
  },
  async clickWithEl(action, el) {
    if (action === 'delete-session') {
      const ok = await confirmDialog('Delete this session? Its time will be removed from your totals.');
      if (ok) await act(() => api(`/api/sessions/${el.dataset.id}`, { method: 'DELETE' }), { success: 'Session deleted' });
      return true;
    }
    return false;
  },
  async submit(name, form) {
    const fd = new FormData(form);
    if (name === 'start-timer') {
      await startTimer(fd.get('taskId'));
      return true;
    }
    if (name === 'stop-timer') {
      const s = state.boot.activeSession;
      document.getElementById('stop-dialog').close();
      const saved = await act(() => api(`/api/sessions/${s.id}/stop`, {
        method: 'POST', body: { note: fd.get('note') || '', completeTask: fd.get('completeTask') === 'on' },
      }), { success: (r) => `Saved ${fmtMinutes(r.durationSeconds / 60)} on ${s.taskTitle}` });
      if (saved && fd.get('reflect') === 'on') {
        state.journalTaskId = s.taskId;
        location.hash = '#journal';
      }
      return true;
    }
    if (name === 'log-time') {
      const endedAt = fd.get('endedAt') ? new Date(fd.get('endedAt')).toISOString() : undefined;
      const ok = await act(() => api('/api/sessions/manual', {
        method: 'POST',
        body: { taskId: fd.get('taskId'), minutes: Number(fd.get('minutes')), endedAt, completeTask: fd.get('completeTask') === 'on' },
      }), { success: (r) => `Logged ${fmtMinutes(r.durationSeconds / 60)}` });
      if (ok) form.reset();
      return true;
    }
    return false;
  },
};
