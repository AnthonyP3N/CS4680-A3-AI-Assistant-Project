// Formatting helpers for the UI. Dates are local YYYY-MM-DD strings.
import { addDays, diffDays } from './dates.js';

export { addDays, diffDays };

export function fmtMinutes(min) {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
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
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "14:30" -> "2:30 pm" */
export function fmtTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function timeToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesToTime(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const noon = (d) => new Date(`${d}T12:00:00`);

export const fmtDateLong = (d) => noon(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtDateShort = (d) => noon(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtWeekday = (d) => noon(d).toLocaleDateString(undefined, { weekday: 'long' });
export const fmtDayShort = (d) => noon(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtTimeOfDay(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function localDateOf(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function nowMinutesIn(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
}

/** "Due today", "Overdue by 2 days", "Due Friday", "Due Oct 30". */
export function dueLabel(dueDate, today) {
  if (!dueDate) return 'No due date';
  const d = diffDays(today, dueDate);
  if (d < 0) return `Overdue by ${-d} ${-d === 1 ? 'day' : 'days'}`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 7) return `Due ${fmtWeekday(dueDate)}`;
  return `Due ${fmtDateShort(dueDate)}`;
}

export const fmtNum = (n) => Number(n).toLocaleString('en-US');

export function pluralize(n, one, many = `${one}s`) {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}
