// Focus blocks: how long a block is, and sessions with no task, which count
// under the "Focus" category in Insights.

export const FOCUS_CATEGORY = 'Focus';
export const FOCUS_DEFAULT_TITLE = 'Focus time';
export const FOCUS_PRESETS = [15, 25, 45, 60, 90];
export const FOCUS_MIN = 5;
export const FOCUS_MAX = 240;
export const FOCUS_LABEL_MAX = 60;

/** A whole number of minutes in range, or null. */
export function focusMinutesOrNull(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= FOCUS_MIN && n <= FOCUS_MAX ? n : null;
}

/** "deep   reading " -> "Deep reading"; empty -> "Focus time". */
export function focusTitle(label) {
  const t = typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, FOCUS_LABEL_MAX) : '';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : FOCUS_DEFAULT_TITLE;
}

/** The block length for a session, falling back to the user's setting. */
export function blockMinutes(session, preferences) {
  return session?.targetMinutes || preferences?.focusMinutes || 45;
}

/**
 * What the timer shows: time left in the block, then time over it.
 * Returns { left, over, done, frac }.
 */
export function timerFace(elapsedSeconds, targetMinutes) {
  const target = targetMinutes * 60;
  const done = elapsedSeconds >= target;
  return {
    left: Math.max(0, target - elapsedSeconds),
    over: Math.max(0, elapsedSeconds - target),
    done,
    frac: target ? Math.min(1, elapsedSeconds / target) : 0,
  };
}
