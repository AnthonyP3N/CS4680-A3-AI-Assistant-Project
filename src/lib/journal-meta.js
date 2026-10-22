// Labels and small helpers for journal entries, shared by the journal page
// and the quick check-in sheet after a session.

export const TAG_OPTIONS = [
  ['win', 'Win'],
  ['stuck', 'Stuck'],
  ['distraction', 'Distraction'],
  ['idea', 'Idea'],
];

const ALL_TAGS = Object.fromEntries([...TAG_OPTIONS, ['reflection', 'Reflection']]);
export const tagLabel = (t) => ALL_TAGS[t] || t;

export const ENERGY_OPTIONS = [
  ['low', 'Low'],
  ['ok', 'OK'],
  ['high', 'High'],
];
export const energyLabel = (e) => ({ low: 'Low energy', ok: 'OK energy', high: 'High energy' })[e] || '';

/** Questions to start from. `short` is the label used for quick switching. */
export const PROMPTS = [
  { q: 'What would you change tomorrow?', short: 'Change tomorrow?' },
  { q: 'What helped you focus?', short: 'What helped you focus?' },
  { q: 'What took longer than expected?', short: 'What took longer?' },
  { q: 'What got in the way today?', short: 'What got in the way?' },
  { q: 'What are you proud of from this session?', short: 'Proud of?' },
  { q: 'What is the smallest next step?', short: 'Smallest next step?' },
];

/** First sentence of the entry, cut at a word, for entries without a title. */
function firstSentence(body, max = 60) {
  const line = (body || '').trim().split(/\n/)[0];
  const sentence = (/^(.+?[.!?])(\s|$)/.exec(line)?.[1] || line).replace(/[.!]$/, '');
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : max)}…`;
}

/** What to call an entry: its title, its first sentence, or what it was about. */
export function entryTitle(entry, taskTitle) {
  if (entry.title) return entry.title;
  if (entry.body?.trim()) return firstSentence(entry.body);
  return taskTitle ? `Check-in after ${taskTitle}` : 'Quick check-in';
}

