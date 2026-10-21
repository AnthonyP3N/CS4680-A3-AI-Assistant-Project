import { api } from './api.js';
import { clearAiSettings, getAiSettings, onExternalChange, saveAiSettings, testConnection } from './backend.js';
import { PROVIDERS } from './lib/providers.js';
import { act, confirmDialog, esc, fmtDateLong, onRender, refresh, render, state, toast } from './core.js';
import { renderToday, todayHandlers } from './views/today.js';
import { focusHandlers, renderFocus, renderTimerPill, tickTimer } from './views/focus.js';
import { journalHandlers, renderJournal } from './views/journal.js';
import { insightsHandlers, loadStats, renderInsights } from './views/insights.js';
import { coachHandlers, renderCoach } from './views/coach.js';

const VIEWS = {
  today: { render: renderToday, handlers: todayHandlers },
  focus: { render: renderFocus, handlers: focusHandlers },
  journal: { render: renderJournal, handlers: journalHandlers },
  insights: { render: renderInsights, handlers: insightsHandlers },
  coach: { render: renderCoach, handlers: coachHandlers },
};

const main = document.getElementById('main');

// -------------------------------------------------------------- render ---

/** Remember which control had focus so a re-render doesn't throw the user out of it. */
function focusKey(el) {
  if (!el || el === document.body) return null;
  for (const attr of ['data-change', 'data-action', 'name']) {
    const v = el.getAttribute?.(attr);
    if (v) {
      const extra = el.dataset.i !== undefined ? `[data-i="${el.dataset.i}"]` : el.dataset.id ? `[data-id="${el.dataset.id}"]` : el.dataset.filter ? `[data-filter="${el.dataset.filter}"]` : el.dataset.range ? `[data-range="${el.dataset.range}"]` : el.dataset.mode ? `[data-mode="${el.dataset.mode}"]` : '';
      return `#main [${attr}="${CSS.escape(v)}"]${extra}`;
    }
  }
  return null;
}

function renderApp() {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === state.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (state.loadError) {
    main.innerHTML = `<div class="view"><div class="error-box" role="alert"><p><strong>FocusFlow couldn’t load your data.</strong> ${esc(state.loadError)}</p><button class="btn btn-ghost btn-sm" data-action="reload">Try again</button></div></div>`;
    return;
  }
  if (!state.boot) {
    main.innerHTML = '<div class="view"><p class="muted loading-line">Loading…</p></div>';
    return;
  }

  document.getElementById('topbar-date').textContent = fmtDateLong(state.boot.today);
  document.getElementById('timer-pill').innerHTML = renderTimerPill();

  const key = main.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  const scroll = window.scrollY;
  main.innerHTML = VIEWS[state.view].render();
  if (key) document.querySelector(key)?.focus({ preventScroll: true });
  window.scrollTo(0, scroll);
  tickTimer();
}
onRender(renderApp);

// -------------------------------------------------------------- router ---

function route() {
  const name = location.hash.replace('#', '') || 'today';
  const changed = name !== state.view;
  state.view = VIEWS[name] ? name : 'today';
  if (state.view === 'insights' && state.boot) loadStats();
  else render();
  if (changed) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', route);

// --------------------------------------------------------- delegation ---

async function dispatch(kind, name, el, event) {
  const order = [VIEWS[state.view].handlers, focusHandlers, todayHandlers];
  for (const h of order) {
    if (kind === 'click') {
      if (h.click && await h.click(name, el, event)) return true;
      if (h.clickWithEl && await h.clickWithEl(name, el, event)) return true;
    } else if (h[kind] && await h[kind](name, el, event)) return true;
  }
  return false;
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = el.dataset.action;
  if (el.tagName === 'INPUT' && el.type === 'checkbox') return; // handled by change
  el.closest('details.menu')?.removeAttribute('open');
  if (action === 'reload') { boot(); return; }
  if (action === 'open-settings') { openSettings(); return; }
  if (await settingsClick(action, el)) return;
  e.preventDefault();
  await dispatch('click', action, el, e);
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const name = el.dataset.change || (el.dataset.action === 'toggle-done' ? 'toggle-done' : null);
  if (!name) return;
  await dispatch('change', name, el, e);
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  const name = form.dataset.form;
  if (!name) return;
  e.preventDefault();
  const btn = form.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try {
    if (name === 'settings') await saveSettings(form);
    else await dispatch('submit', name, form, e);
  } finally {
    if (btn && document.contains(btn)) btn.disabled = false;
  }
});

// Close "more" menus when clicking elsewhere.
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
});

// Chart tooltips: any element with data-tip.
const tip = document.createElement('div');
tip.className = 'chart-tip';
tip.hidden = true;
document.body.appendChild(tip);
function showTip(el) {
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth;
  tip.style.left = `${Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2))}px`;
  tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
}
document.addEventListener('pointerover', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); });
document.addEventListener('pointerout', (e) => { if (e.target.closest?.('[data-tip]')) tip.hidden = true; });
document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); else tip.hidden = true; });

// ------------------------------------------------------------ settings ---

function providerOptions(selected) {
  return Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
}

function openSettings() {
  const p = state.boot.preferences;
  const ai = getAiSettings();
  const prov = PROVIDERS[ai.provider] || PROVIDERS.gemini;
  const dlg = document.getElementById('settings');
  dlg.innerHTML = `<form data-form="settings">
    <h2 id="settings-title">Settings</h2>

    <fieldset class="ai-settings">
      <legend>AI coach</legend>
      <p class="muted small">FocusFlow uses your own API key. Without one, the coach runs in demo mode with simple offline rules.</p>
      <label class="field"><span>Provider</span>
        <select name="aiProvider" data-ai="provider">${providerOptions(ai.provider)}</select></label>
      <label class="field"><span>API key</span>
        <span class="key-row">
          <input type="password" name="aiKey" value="${esc(ai.key)}" autocomplete="off" spellcheck="false" placeholder="Paste your key" data-ai="key">
          <button type="button" class="btn btn-ghost btn-sm" data-action="ai-toggle-key" aria-label="Show key">Show</button>
        </span></label>
      <p class="small"><a href="${esc(prov.keyUrl)}" target="_blank" rel="noopener noreferrer" data-ai="key-link">Get a ${esc(prov.label)} key</a> <span class="muted" data-ai="key-hint">${esc(prov.keyHint)}</span></p>
      <label class="field"><span>Model (optional)</span>
        <input name="aiModel" value="${esc(ai.model)}" placeholder="${esc(prov.defaultModel)}" autocomplete="off" spellcheck="false" data-ai="model"></label>
      <div class="key-note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <p>Your key is saved only in this browser and is sent directly to the provider you chose. FocusFlow has no server, so nobody else can see it, and it is never included when you export your data. Any usage is billed to your own account, so a free-tier key or one with a spending limit is a good idea. Don’t save a key on a shared computer.</p>
      </div>
      <div class="settings-data">
        <button type="button" class="btn btn-ghost btn-sm" data-action="ai-test">Test connection</button>
        ${ai.key ? '<button type="button" class="btn btn-ghost btn-sm btn-danger-text" data-action="ai-remove">Remove key</button>' : ''}
      </div>
      <p class="ai-status small" data-ai="status" role="status" aria-live="polite"></p>
    </fieldset>

    <fieldset>
      <legend>Planning defaults</legend>
      <div class="field-row">
        <label class="field"><span>Usual start time</span><input type="time" name="dayStart" value="${esc(p.dayStart)}" required></label>
        <label class="field"><span>Time available per day (min)</span><input type="number" name="availableMinutes" min="15" max="960" step="15" value="${p.availableMinutes}" required></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Take a break every (min)</span><input type="number" name="breakEveryMinutes" min="15" max="180" step="5" value="${p.breakEveryMinutes}" required></label>
        <label class="field"><span>Break length (min)</span><input type="number" name="breakMinutes" min="0" max="60" step="5" value="${p.breakMinutes}" required></label>
      </div>
      <p class="muted small">Time zone: ${esc(p.timezone)}</p>
    </fieldset>

    <fieldset>
      <legend>Your data</legend>
      <p class="muted small">Everything is saved in this browser only${state.boot.persistent ? '' : ' (your browser is blocking site storage, so data will be lost when you close the tab)'}. Export a backup now and then, and import it to move to another browser or computer.</p>
      <div class="settings-data">
        <button type="button" class="btn btn-ghost btn-sm" data-action="export-data">Export my data</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="import-data">Import a backup</button>
        <input type="file" accept="application/json,.json" data-ai="import-file" hidden>
        <button type="button" class="btn btn-ghost btn-sm" data-action="settings-sample">Replace with sample week</button>
        <button type="button" class="btn btn-ghost btn-sm btn-danger-text" data-action="settings-reset">Delete all data</button>
      </div>
    </fieldset>

    <div class="dialog-actions">
      <button type="button" class="btn btn-ghost" data-action="settings-close">Cancel</button>
      <button class="btn btn-primary">Save settings</button>
    </div>
  </form>`;

  // Switching provider updates the key link and the default model hint.
  dlg.querySelector('[data-ai=provider]').addEventListener('change', (e) => {
    const next = PROVIDERS[e.target.value];
    const link = dlg.querySelector('[data-ai=key-link]');
    link.href = next.keyUrl;
    link.textContent = `Get a ${next.label} key`;
    dlg.querySelector('[data-ai=key-hint]').textContent = next.keyHint;
    dlg.querySelector('[data-ai=model]').placeholder = next.defaultModel;
    if (e.target.value !== getAiSettings().provider) {
      dlg.querySelector('[data-ai=key]').value = '';
      dlg.querySelector('[data-ai=model]').value = '';
    }
    setAiStatus('');
  });
  dlg.querySelector('[data-ai=import-file]').addEventListener('change', (e) => importFile(e.target.files?.[0]));
  dlg.showModal();
}

function setAiStatus(text, tone = '') {
  const el = document.querySelector('#settings [data-ai=status]');
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

function aiFormValues() {
  const dlg = document.getElementById('settings');
  return {
    provider: dlg.querySelector('[data-ai=provider]').value,
    key: dlg.querySelector('[data-ai=key]').value.trim(),
    model: dlg.querySelector('[data-ai=model]').value.trim(),
  };
}

async function exportData() {
  try {
    const data = await api('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusflow-backup-${state.boot.today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded');
  } catch (err) {
    toast(err.message, { tone: 'error' });
  }
}

async function importFile(file) {
  if (!file) return;
  document.getElementById('settings').close();
  let data;
  try {
    if (file.size > 4_000_000) throw new Error('That file is too large to be a FocusFlow backup.');
    data = JSON.parse(await file.text());
  } catch (err) {
    toast(err instanceof SyntaxError ? 'That file isn’t valid JSON. Choose a file made with “Export my data”.' : err.message, { tone: 'error' });
    return;
  }
  const ok = await confirmDialog('Replace everything in FocusFlow with this backup? Your current tasks, sessions and journal will be overwritten.', { confirmLabel: 'Replace with backup' });
  if (!ok) return;
  await act(() => api('/api/import', { method: 'POST', body: { data } }), {
    success: (r) => `Imported ${r.tasks} tasks, ${r.sessions} sessions and ${r.journal} journal entries`,
  });
  state.coach.result = null;
  state.insights.stats = null;
  if (state.view === 'insights') loadStats();
}

async function settingsClick(action, el) {
  const dlg = document.getElementById('settings');
  switch (action) {
    case 'settings-close':
      dlg.close();
      return true;
    case 'export-data':
      await exportData();
      return true;
    case 'import-data':
      dlg.querySelector('[data-ai=import-file]').click();
      return true;
    case 'ai-toggle-key': {
      const input = dlg.querySelector('[data-ai=key]');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.textContent = show ? 'Hide' : 'Show';
      el.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
      return true;
    }
    case 'ai-test': {
      const values = aiFormValues();
      if (!values.key) { setAiStatus('Paste an API key first.', 'error'); return true; }
      setAiStatus('Testing…');
      el.disabled = true;
      try {
        const r = await testConnection(values);
        setAiStatus(`Connected to ${r.label} (${r.model}). Save settings to use it.`, 'ok');
      } catch (err) {
        setAiStatus(err.message, 'error');
      } finally {
        el.disabled = false;
      }
      return true;
    }
    case 'ai-remove': {
      dlg.close();
      const ok = await confirmDialog('Remove your API key from this browser? The coach will switch to demo mode.', { confirmLabel: 'Remove key' });
      if (ok) {
        clearAiSettings();
        await act(async () => {}, { success: 'API key removed from this browser' });
      }
      return true;
    }
    case 'settings-sample':
    case 'settings-reset': {
      dlg.close();
      const sample = action === 'settings-sample';
      const ok = await confirmDialog(sample
        ? 'Replace all your tasks, sessions and journal entries with two weeks of sample data?'
        : 'Delete all tasks, sessions, journal entries and plans? Export first if you want a copy. Your API key is kept.', { confirmLabel: sample ? 'Replace' : 'Delete everything' });
      if (ok) {
        await act(() => api(sample ? '/api/demo/seed' : '/api/demo/reset', { method: 'POST' }), { success: sample ? 'Sample week loaded' : 'All data deleted' });
        state.coach.result = null;
        state.insights.stats = null;
        if (state.view === 'insights') loadStats();
      }
      return true;
    }
    default:
      return false;
  }
}

async function saveSettings(form) {
  const fd = new FormData(form);
  const ai = aiFormValues();
  const saved = getAiSettings();
  try {
    if (ai.key) saveAiSettings(ai);
    else if (saved.key) clearAiSettings(); // the user emptied the field
  } catch (err) {
    setAiStatus(err.message, 'error');
    return;
  }
  const body = Object.fromEntries(['dayStart', 'availableMinutes', 'breakEveryMinutes', 'breakMinutes'].map((k) => [k, k === 'dayStart' ? fd.get(k) : Number(fd.get(k))]));
  const ok = await act(() => api('/api/preferences', { method: 'PUT', body }), {
    success: () => (ai.key ? `Settings saved. The coach will use ${PROVIDERS[ai.provider].label}.` : 'Settings saved'),
  });
  if (ok) document.getElementById('settings').close();
}

// ------------------------------------------------------------- offline ---

function setOnline(on) {
  state.online = on;
  document.getElementById('offline').hidden = on;
}
window.addEventListener('online', async () => { setOnline(true); try { await refresh(); render(); } catch { /* ignore */ } });
window.addEventListener('offline', () => setOnline(false));

// ----------------------------------------------------------------- boot ---

async function boot() {
  try {
    await refresh();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== state.boot.preferences.timezone) {
      await api('/api/preferences', { method: 'PUT', body: { timezone: tz } });
      await refresh();
    }
  } catch (err) {
    state.loadError = err.message;
  }
  route();
  render();
}

setInterval(tickTimer, 1000);
// Refresh when returning to the tab, so a timer started elsewhere shows up.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.boot) {
    try { await refresh(); render(); } catch { /* offline: keep local state */ }
  }
});

setOnline(navigator.onLine);
// Another open tab changed the data: pick it up.
onExternalChange(async () => { try { await refresh(); render(); } catch { /* ignore */ } });
boot();

window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Something went wrong.', { tone: 'error' }));
