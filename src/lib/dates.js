// Date helpers. All "calendar" dates are plain YYYY-MM-DD strings interpreted
// in the user's time zone, so a session at 11pm in Los Angeles counts toward
// that local day rather than the next UTC day.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(instant, tz = 'UTC') {
  const d = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Local wall-clock time (HH:MM, 24h) of an instant in a time zone. */
export function localTime(instant, tz = 'UTC') {
  const d = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour').value;
  const m = parts.find((p) => p.type === 'minute').value;
  return `${h}:${m}`;
}

function tzOffsetMinutes(instant, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** ISO instant for a local date + HH:MM in a time zone (DST-aware). */
export function zonedTimeToIso(dateStr, hhmm, tz) {
  const guess = Date.parse(`${dateStr}T${hhmm}:00Z`);
  const off = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t).toISOString();
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days between two date strings (b - a). */
export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(dateStr) {
  const js = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (js + 6) % 7;
}

export function weekdayName(dateStr) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayIndex(dateStr)];
}

/** Inclusive [start, end] date range for a day, Monday-start week, or month. */
export function rangeFor(range, dateStr) {
  if (range === 'day') return { start: dateStr, end: dateStr };
  if (range === 'week') {
    const start = addDays(dateStr, -weekdayIndex(dateStr));
    return { start, end: addDays(start, 6) };
  }
  if (range === 'month') {
    const start = `${dateStr.slice(0, 7)}-01`;
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(0);
    return { start, end: d.toISOString().slice(0, 10) };
  }
  throw new Error(`Unknown range: ${range}`);
}

export function datesBetween(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function timeToMinutes(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
