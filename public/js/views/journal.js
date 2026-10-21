import { api } from '../api.js';
import { act, confirmDialog, esc, fmtDateLong, localDateOf, render, state, taskById } from '../core.js';

const TAGS = [
  ['reflection', 'Reflection'],
  ['win', 'Win'],
  ['stuck', 'Stuck'],
  ['distraction', 'Distraction'],
  ['energy-high', 'High energy'],
  ['energy-low', 'Low energy'],
  ['idea', 'Idea'],
];
const tagLabel = (t) => TAGS.find(([k]) => k === t)?.[1] || t;

const PROMPTS = [
  'What took longer than you expected, and why?',
  'What helped you focus today?',
  'What would you do differently tomorrow?',
];

export function renderJournal() {
  const linked = state.journalTaskId ? taskById(state.journalTaskId) : null;
  const entries = state.boot.journal;
  const groups = new Map();
  for (const e of entries) {
    const d = localDateOf(e.createdAt);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(e);
  }
  const prompt = linked ? `How did “${linked.title}” go? What took the most time?` : PROMPTS[new Date().getDate() % PROMPTS.length];

  return `<div class="view view-journal">
    <div class="view-head">
      <h1>Journal</h1>
      <p class="lede">A private place to notice what helps and what gets in the way.</p>
    </div>
    <div class="journal-grid">
      <section class="panel compose" aria-labelledby="write-h">
        <div class="panel-head"><h2 id="write-h">New entry</h2></div>
        <form data-form="add-entry">
          <label class="field field-wide"><span class="sr-only">Entry</span>
            <textarea name="body" rows="6" maxlength="5000" required placeholder="${esc(prompt)}"></textarea></label>
          <fieldset class="tag-picker">
            <legend>Tags (optional)</legend>
            ${TAGS.map(([k, label]) => `<label class="chip"><input type="checkbox" name="tags" value="${k}"><span>${label}</span></label>`).join('')}
          </fieldset>
          ${linked ? `<p class="linked">About <strong>${esc(linked.title)}</strong> <button type="button" class="link-btn" data-action="unlink-task">Remove link</button></p><input type="hidden" name="taskId" value="${esc(linked.id)}">` : ''}
          <div class="row-actions"><button class="btn btn-primary">Save entry</button></div>
        </form>
        <p class="privacy">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
          Entries stay on this device’s FocusFlow server. The coach only reads them if you tick “Include my journal” when asking for a review. Tags are counted on Insights; your words are not.
        </p>
      </section>

      <section class="entries" aria-labelledby="entries-h">
        <div class="panel-head">
          <h2 id="entries-h">Entries</h2>
          ${entries.length ? '<a class="link-btn" href="/api/export" download>Export all data</a>' : ''}
        </div>
        ${entries.length ? [...groups.entries()].map(([date, list]) => `
          <div class="entry-day">
            <h3>${esc(fmtDateLong(date))}</h3>
            ${list.map((e) => `<article class="entry">
              <div class="entry-head">
                <time datetime="${esc(e.createdAt)}">${new Date(e.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                ${e.taskId && taskById(e.taskId) ? `<span class="muted">about ${esc(taskById(e.taskId).title)}</span>` : ''}
                <button class="link-btn entry-del" data-action="delete-entry" data-id="${esc(e.id)}">Delete</button>
              </div>
              <p>${esc(e.body).replace(/\n/g, '<br>')}</p>
              ${e.tags?.length ? `<div class="entry-tags">${e.tags.map((t) => `<span class="tag tag-${esc(t)}">${esc(tagLabel(t))}</span>`).join('')}</div>` : ''}
            </article>`).join('')}
          </div>`).join('')
        : '<div class="empty"><p>No entries yet. A two-line note after a focus session is enough. Over a week, these notes explain what the numbers can’t.</p></div>'}
      </section>
    </div>
  </div>`;
}

export const journalHandlers = {
  async click(action, el) {
    if (action === 'unlink-task') {
      state.journalTaskId = null;
      const text = document.querySelector('textarea[name=body]')?.value;
      render(); // keep what the user typed
      const ta = document.querySelector('textarea[name=body]');
      if (ta && text) ta.value = text;
      return true;
    }
    if (action === 'delete-entry') {
      const ok = await confirmDialog('Delete this journal entry? This can’t be undone.');
      if (ok) await act(() => api(`/api/journal/${el.dataset.id}`, { method: 'DELETE' }), { success: 'Entry deleted' });
      return true;
    }
    return false;
  },
  async submit(name, form) {
    if (name !== 'add-entry') return false;
    const fd = new FormData(form);
    const ok = await act(() => api('/api/journal', {
      method: 'POST',
      body: { body: fd.get('body'), tags: fd.getAll('tags'), taskId: fd.get('taskId') || null },
    }), { success: 'Entry saved' });
    if (ok) { state.journalTaskId = null; render(); }
    return true;
  },
};
