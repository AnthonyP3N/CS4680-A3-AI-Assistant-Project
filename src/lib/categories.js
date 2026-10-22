// Task categories: a built-in list everyone starts with, plus any the user
// creates. Pure functions so the quick-add parser and tests can share them.

export const CATEGORY_MAX_CHARS = 30;

export const DEFAULT_CATEGORIES = Object.freeze([
  'Studying', 'Homework', 'Work', 'Exercise', 'Health', 'Personal',
  'Errands', 'Chores', 'Bills', 'Finances', 'Social', 'Other',
]);

/** Trim, collapse spaces, capitalize the first letter. '' if nothing left. */
export function cleanCategory(name) {
  if (typeof name !== 'string') return '';
  const c = name.replace(/\s+/g, ' ').trim().slice(0, CATEGORY_MAX_CHARS);
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : '';
}

const key = (s) => s.toLowerCase();

/**
 * Every category to offer: the built-in list first, then the user's own
 * (saved ones and any still used by a task), without case-insensitive
 * duplicates. Returns { suggested, custom }.
 */
export function categoryOptions(saved = [], tasks = []) {
  const seen = new Set(DEFAULT_CATEGORIES.map(key));
  const custom = [];
  for (const c of [...saved, ...tasks.map((t) => t.category)]) {
    const clean = cleanCategory(c);
    if (!clean || seen.has(key(clean))) continue;
    seen.add(key(clean));
    custom.push(clean);
  }
  custom.sort((a, b) => a.localeCompare(b));
  return { suggested: [...DEFAULT_CATEGORIES], custom };
}

/**
 * Match what someone typed to an existing category: exact (any case) first,
 * then a unique prefix ("fin" → Finances, "study" → Studying).
 * Returns null when nothing matches.
 */
export function matchCategory(text, options) {
  const t = key(cleanCategory(text));
  if (!t) return null;
  const exact = options.find((o) => key(o) === t);
  if (exact) return exact;
  const stem = t.length >= 3 ? t.replace(/(ing|es|s)$/, '') : t;
  const hits = options.filter((o) => key(o).startsWith(t) || (stem.length >= 3 && key(o).startsWith(stem)));
  return hits.length === 1 ? hits[0] : null;
}
