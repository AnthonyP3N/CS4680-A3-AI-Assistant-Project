// Shared state, formatting helpers, and UI utilities.

import { api } from './api.js';

export const state = {
  boot: null,          // payload from /api/bootstrap
  view: 'today',
  online: navigator.onLine,
  loading: true,
  loadError: null,
  taskFilter: 'open',  // open | done | all
  categoryFilter: '',
  editingTaskId: null,
  insights: { range: 'week', date: null, stats: null, loading: false, error: null },
  coach: {
    mode: 'plan',      // plan | review | breakdown
    loading: false,
    error: null,
    result: null,      // latest revision returned by the server
    selected: null,    // Set of block indexes chosen for acceptance
    edits: {},         // index -> {start, durationMinutes}
    breakdownTaskId: '',
    showInput: false,
  },
};

const renderers = new Set();
export function onRender(fn) { renderers.add(fn); }
export function render() { for (const fn of renderers) fn(); }

export async function refresh() {
  state.boot = await api('/api/bootstrap');
  state.bootAt = Date.now();
  state.loadError = null;
}

// --------------------------------------------------------------- strings ---

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function fmtMinutes(min) {
  if (min === null || min === undefined) return '—';
  const m = Math.round(min);
  if (m === 0 && min > 0) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function fmtDateLong(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function fmtDateShort(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function localDateOf(iso) {
  const tz = state.boot?.preferences?.timezone;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function dueLabel(dueDate, today) {
  if (!dueDate) return '';
  const d = daysBetween(today, dueDate);
  if (d < 0) return `Overdue by ${-d} ${-d === 1 ? 'day' : 'days'}`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 7) return `Due ${new Date(`${dueDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `Due ${fmtDateShort(dueDate)}`;
}

export function timeToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesToTime(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function nowMinutes() {
  const tz = state.boot?.preferences?.timezone;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
}

export const taskById = (id) => state.boot?.tasks.find((t) => t.id === id);

// ------------------------------------------------------------------- UI ---

let toastTimer;
export function toast(message, { tone = 'info' } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, tone === 'error' ? 6000 : 3200);
}

/** Run an async action with a toast on failure; refreshes data and re-renders on success. */
export async function act(fn, { success, refreshAfter = true } = {}) {
  try {
    const result = await fn();
    if (refreshAfter) await refresh();
    render();
    if (success) toast(typeof success === 'function' ? success(result) : success);
    return result;
  } catch (err) {
    toast(err.message, { tone: 'error' });
    render();
    return undefined;
  }
}

export function confirmDialog(message, { confirmLabel = 'Delete', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('confirm');
    dlg.querySelector('[data-msg]').textContent = message;
    const ok = dlg.querySelector('[data-ok]');
    ok.textContent = confirmLabel;
    ok.className = tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

export function priorityBadge(p) {
  return `<span class="prio prio-${esc(p)}" title="${esc(p)} priority"><span class="sr-only">${esc(p)} priority</span></span>`;
}
