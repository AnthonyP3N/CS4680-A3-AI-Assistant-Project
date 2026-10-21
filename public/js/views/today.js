import { api } from '../api.js';
import {
  act, addDays, confirmDialog, dueLabel, esc, fmtMinutes, fmtTime12, minutesToTime, nowMinutes, 
  render, state, taskById, timeToMinutes,
} from '../core.js';
import { startTimer } from './focus.js';

function progressBar(t) {
  if (!t.actualMinutes) return '';
  const est = t.estimateMinutes || 0;
  const act = t.actualMinutes || 0;
  const scale = Math.max(est, act, 1);
  const over = est && act > est;
  return `<div class="ledger-mini" aria-hidden="true">
      <span class="ledger-est" style="width:${(est / scale) * 100}%"></span>
      <span class="ledger-act${over ? ' is-over' : ''}" style="width:${(act / scale) * 100}%"></span>
    </div>`;
}

function taskMeta(t, today) {
  const bits = [];
  if (t.priority === 'high' && t.status !== 'done') bits.push('<span class="prio-high-label">High priority</span>');
  if (t.category) bits.push(`<span class="tag">${esc(t.category)}</span>`);
  const due = dueLabel(t.dueDate, today);
  if (due && t.status !== 'done') bits.push(`<span class="${due.startsWith('Overdue') ? 'due due-late' : due === 'Due today' ? 'due due-now' : 'due'}">${esc(due)}</span>`);
  const time = t.estimateMinutes
    ? (t.actualMinutes ? `${fmtMinutes(t.actualMinutes)} of ${fmtMinutes(t.estimateMinutes)}` : `${fmtMinutes(t.estimateMinutes)} estimate`)
    : t.actualMinutes ? `${fmtMinutes(t.actualMinutes)} tracked` : '';
  if (time) bits.push(`<span class="time">${esc(time)}</span>`);
  return bits.join('');
}

function editForm(t) {
  const cats = state.boot.categories;
  return `<form class="task-edit" data-form="edit-task" data-id="${esc(t.id)}">
    <label class="field field-wide"><span>Title</span><input name="title" required maxlength="120" value="${esc(t.title)}"></label>
    <label class="field"><span>Category</span><input name="category" list="cat-list" maxlength="30" value="${esc(t.category)}"></label>
    <label class="field"><span>Priority</span><select name="priority">${['high', 'medium', 'low'].map((p) => `<option ${p === t.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <label class="field"><span>Due</span><input type="date" name="dueDate" value="${esc(t.dueDate || '')}"></label>
    <label class="field"><span>Estimate (min)</span><input type="number" name="estimateMinutes" min="5" max="1440" step="5" value="${esc(t.estimateMinutes ?? '')}"></label>
    <label class="field field-wide"><span>Notes</span><input name="notes" maxlength="1000" value="${esc(t.notes || '')}"></label>
    <datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row-actions">
      <button class="btn btn-primary btn-sm">Save changes</button>
      <button class="btn btn-ghost btn-sm" type="button" data-action="cancel-edit">Cancel</button>
    </div>
  </form>`;
}

function taskRow(t, today, { child = false } = {}) {
  if (state.editingTaskId === t.id) return `<li class="task is-editing">${editForm(t)}</li>`;
  const done = t.status === 'done';
  const active = state.boot.activeSession?.taskId === t.id;
  return `<li class="task${done ? ' is-done' : ''}${child ? ' is-child' : ''}${active ? ' is-active' : ''}">
    <label class="check">
      <input type="checkbox" data-action="toggle-done" data-id="${esc(t.id)}" ${done ? 'checked' : ''}>
      <span class="sr-only">Mark “${esc(t.title)}” ${done ? 'not done' : 'done'}</span>
    </label>
    <div class="task-body">
      <div class="task-title"><span>${esc(t.title)}</span></div>
      <div class="task-meta">${taskMeta(t, today)}</div>
      ${progressBar(t)}
    </div>
    <div class="task-actions">
      ${!done ? `<button class="icon-btn icon-btn-start" data-action="start" data-id="${esc(t.id)}" ${state.boot.activeSession ? 'disabled' : ''} aria-label="Start focus timer for ${esc(t.title)}" title="${state.boot.activeSession ? 'A timer is already running' : 'Start focus timer'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button>` : ''}
      <details class="menu">
        <summary class="icon-btn" aria-label="More actions for ${esc(t.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></summary>
        <div class="menu-pop">
          <button data-action="edit" data-id="${esc(t.id)}">Edit</button>
          ${!done ? `<button data-action="breakdown" data-id="${esc(t.id)}">Break down with Coach</button>` : ''}
          <button data-action="delete" data-id="${esc(t.id)}" class="danger">Delete</button>
        </div>
      </details>
    </div>
  </li>`;
}

function visibleTasks() {
  const { tasks } = state.boot;
  const weight = { high: 0, medium: 1, low: 2 };
  return tasks
    .filter((t) => (state.taskFilter === 'open' ? t.status !== 'done' : state.taskFilter === 'done' ? t.status === 'done' : true))
    .filter((t) => !state.categoryFilter || t.category === state.categoryFilter)
    .sort((a, b) => {
      if (state.taskFilter === 'done') return (b.completedAt || '').localeCompare(a.completedAt || '');
      return (a.status === 'done') - (b.status === 'done')
        || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        || weight[a.priority] - weight[b.priority];
    });
}

function taskList(today) {
  const list = visibleTasks();
  const ids = new Set(list.map((t) => t.id));
  const roots = list.filter((t) => !t.parentId || !ids.has(t.parentId));
  const children = (id) => list.filter((t) => t.parentId === id);
  if (!state.boot.tasks.length) {
    return `<div class="empty">
      <p><strong>No tasks yet.</strong> Add what you need to get done, with a rough time estimate. FocusFlow compares that estimate with the time you actually spend.</p>
      <button class="btn btn-ghost btn-sm" data-action="load-sample">Load a sample week instead</button>
    </div>`;
  }
  if (!list.length) {
    return `<div class="empty"><p>${state.taskFilter === 'done' ? 'Nothing completed yet with this filter.' : 'Everything here is done. Add the next task above.'}</p></div>`;
  }
  return `<ul class="tasks">${roots.map((t) => taskRow(t, today) + children(t.id).map((c) => taskRow(c, today, { child: true })).join('')).join('')}</ul>`;
}

function scheduleBlock(b, dateIsToday) {
  const start = timeToMinutes(b.start);
  const end = start + b.durationMinutes;
  const now = nowMinutes();
  const isNow = dateIsToday && now >= start && now < end;
  const isPast = dateIsToday && now >= end;
  const task = b.taskId ? taskById(b.taskId) : null;
  const height = Math.max(36, b.durationMinutes * 1.1);
  return `<li class="block block-${b.type}${isNow ? ' is-now' : ''}${isPast ? ' is-past' : ''}${task?.status === 'done' ? ' is-done' : ''}" style="--h:${height}px">
    <time class="block-time">${fmtTime12(b.start)}</time>
    <div class="block-card">
      <div class="block-title">${esc(b.type === 'break' ? 'Break' : task?.title || b.title)}</div>
      <div class="block-sub">${fmtMinutes(b.durationMinutes)}</div>
      ${b.reason ? `<div class="block-reason">${esc(b.reason)}</div>` : ''}
      ${dateIsToday && b.type === 'task' && task && task.status !== 'done' && !state.boot.activeSession && !isPast
        ? `<button class="btn btn-sm btn-ghost block-start" data-action="start" data-id="${esc(task.id)}">Start</button>` : ''}
    </div>
  </li>`;
}

function scheduleCard(date, label, today) {
  const sched = state.boot.schedules[date];
  if (!sched) return '';
  const last = sched.blocks[sched.blocks.length - 1];
  const endsAt = minutesToTime(timeToMinutes(last.start) + last.durationMinutes);
  return `<section class="panel schedule" aria-labelledby="sched-${date}">
    <div class="panel-head">
      <h2 id="sched-${date}">${label}</h2>
      <span class="muted">${fmtTime12(sched.blocks[0].start)} to ${fmtTime12(endsAt)}</span>
    </div>
    <ol class="timeline">${sched.blocks.map((b) => scheduleBlock(b, date === today)).join('')}</ol>
    <div class="panel-foot">
      <span class="muted">Plan version ${sched.version}, accepted ${new Date(sched.acceptedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      <button class="link-btn" data-action="clear-schedule" data-date="${esc(date)}">Clear plan</button>
    </div>
  </section>`;
}

export function renderToday() {
  const { today, categories, tasks } = state.boot;
  const tomorrowStr = addDays(today, 1);
  const open = tasks.filter((t) => t.status !== 'done');
  const dueSoon = open.filter((t) => t.dueDate && t.dueDate <= tomorrowStr).length;
  const usedCats = [...new Set(tasks.map((t) => t.category))].filter(Boolean);
  const hasToday = !!state.boot.schedules[today];

  return `<div class="view view-today">
    <div class="view-head">
      <h1>Today</h1>
      <p class="lede">${open.length ? `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}${dueSoon ? `, ${dueSoon} due by tomorrow` : ''}.` : 'Add a task to get started.'}</p>
    </div>

    <div class="today-grid">
      <section class="panel" aria-labelledby="tasks-h">
        <div class="panel-head"><h2 id="tasks-h">Tasks</h2></div>
        <form class="quick-add" data-form="add-task">
          <label class="field field-title"><span>New task</span><input name="title" required maxlength="120" placeholder="e.g. CS homework 4" autocomplete="off"></label>
          <button class="btn btn-primary">Add task</button>
          <label class="field"><span>Estimate (min)</span><input name="estimateMinutes" type="number" min="5" max="1440" step="5" placeholder="60"></label>
          <label class="field"><span>Due</span><input name="dueDate" type="date" value="${esc(today)}"></label>
          <label class="field"><span>Priority</span><select name="priority"><option>high</option><option selected>medium</option><option>low</option></select></label>
          <label class="field"><span>Category</span><input name="category" list="cat-add" maxlength="30" value="Homework"></label>
          <datalist id="cat-add">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </form>

        <div class="filters">
          <div class="seg" role="group" aria-label="Show tasks">
            ${['open', 'done', 'all'].map((f) => `<button type="button" data-action="filter" data-filter="${f}" aria-pressed="${state.taskFilter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
          </div>
          ${usedCats.length > 1 ? `<label class="inline-select"><span class="sr-only">Category</span>
            <select data-change="category-filter"><option value="">All categories</option>${usedCats.map((c) => `<option ${c === state.categoryFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
        </div>
        ${taskList(today)}
        ${tasks.some((t) => t.actualMinutes && t.status !== 'done') ? `<p class="legend"><span class="ledger-key ledger-key-est"></span>estimate <span class="ledger-key ledger-key-act"></span>time tracked</p>` : ''}
      </section>

      <div class="stack">
        ${scheduleCard(today, 'Today’s plan', today)}
        ${!hasToday ? `<section class="panel plan-cta">
            <h2>No plan for today yet</h2>
            <p>The coach can turn your open tasks into time blocks that fit the hours you actually have, with breaks. You review every block before anything is saved.</p>
            <button class="btn btn-primary" data-action="go-plan" data-date="${esc(today)}" ${open.length ? '' : 'disabled'}>Plan my day</button>
          </section>` : ''}
        ${scheduleCard(tomorrowStr, 'Tomorrow’s plan', today)}
      </div>
    </div>
  </div>`;
}

function formToTask(form) {
  const fd = new FormData(form);
  return {
    title: fd.get('title'),
    category: fd.get('category') || 'Other',
    priority: fd.get('priority'),
    dueDate: fd.get('dueDate') || null,
    estimateMinutes: fd.get('estimateMinutes') ? Number(fd.get('estimateMinutes')) : null,
    ...(fd.has('notes') ? { notes: fd.get('notes') } : {}),
  };
}

export const todayHandlers = {
  async click(action, el) {
    const id = el.dataset.id;
    switch (action) {
      case 'filter':
        state.taskFilter = el.dataset.filter;
        render();
        return true;
      case 'start':
        await startTimer(id);
        return true;
      case 'edit':
        state.editingTaskId = id;
        render();
        document.querySelector('.task-edit input[name=title]')?.focus();
        return true;
      case 'cancel-edit':
        state.editingTaskId = null;
        render();
        return true;
      case 'delete': {
        const t = taskById(id);
        const ok = await confirmDialog(`Delete “${t.title}”? Time you already tracked stays in your history.`);
        if (ok) await act(() => api(`/api/tasks/${id}`, { method: 'DELETE' }), { success: 'Task deleted' });
        return true;
      }
      case 'breakdown':
        state.coach.mode = 'breakdown';
        state.coach.breakdownTaskId = id;
        state.coach.result = null;
        location.hash = '#coach';
        return true;
      case 'go-plan':
        state.coach.mode = 'plan';
        state.coach.result = null;
        state.coach.planDate = el.dataset.date;
        location.hash = '#coach';
        return true;
      case 'clear-schedule': {
        const ok = await confirmDialog('Clear this plan? Your tasks are not affected.', { confirmLabel: 'Clear plan' });
        if (ok) await act(() => api(`/api/schedules/${el.dataset.date}`, { method: 'DELETE' }), { success: 'Plan cleared' });
        return true;
      }
      case 'load-sample':
        await act(() => api('/api/demo/seed', { method: 'POST' }), { success: 'Sample week loaded' });
        return true;
      default:
        return false;
    }
  },
  async change(name, el) {
    if (el.dataset.action === 'toggle-done') {
      const done = el.checked;
      await act(() => api(`/api/tasks/${el.dataset.id}`, { method: 'PATCH', body: { status: done ? 'done' : 'todo' } }), { success: done ? 'Marked done' : 'Marked not done' });
      return true;
    }
    if (name === 'category-filter') {
      state.categoryFilter = el.value;
      render();
      return true;
    }
    return false;
  },
  async submit(name, form) {
    if (name === 'add-task') {
      const body = formToTask(form);
      const created = await act(() => api('/api/tasks', { method: 'POST', body }), { success: 'Task added' });
      if (created) {
        const input = document.querySelector('.quick-add input[name=title]');
        input?.focus();
      }
      return true;
    }
    if (name === 'edit-task') {
      const body = formToTask(form);
      const ok = await act(() => api(`/api/tasks/${form.dataset.id}`, { method: 'PATCH', body }), { success: 'Changes saved' });
      if (ok) { state.editingTaskId = null; render(); }
      return true;
    }
    return false;
  },
};
