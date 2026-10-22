// Labels for journal tags and energy, shared by the journal and the
// quick reflection sheet.

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

export const PROMPTS = [
  'What took longer than expected?',
  'What helped you focus?',
  'What would you change tomorrow?',
];
