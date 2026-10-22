import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JOURNAL_MAX_CHARS, validateJournal } from '../src/lib/inputs.js';
import { draftStatus, wordCount } from '../src/lib/text.js';

// A real ~1,000-word reflection, the case people asked about.
const LONG = readFileSync(new URL('./fixtures/long-entry.txt', import.meta.url), 'utf8');

test('a 1,000-word entry fits and saves', () => {
  assert.ok(wordCount(LONG) >= 1000, `fixture has ${wordCount(LONG)} words`);
  assert.ok(LONG.length < JOURNAL_MAX_CHARS);
  const { value, error } = validateJournal({ body: LONG });
  assert.equal(error, undefined);
  assert.equal(value.body, LONG.trim());
  assert.equal(draftStatus(LONG).tone, '');
  assert.match(draftStatus(LONG).text, /^1,\d{3} words$/);
});

test('approaching the limit shows words left', () => {
  const text = 'word '.repeat(Math.ceil((JOURNAL_MAX_CHARS * 0.85) / 5));
  const s = draftStatus(text);
  assert.equal(s.tone, 'warn');
  assert.match(s.text, /About [\d,]+ words left\./);
});

test('over the limit is explained in words and never truncated', () => {
  const twice = `${LONG}\n\n${LONG}`;
  const s = draftStatus(twice);
  assert.equal(s.tone, 'over');
  assert.match(s.text, /About [\d,]+ words over the limit/);
  assert.match(s.text, /nothing has been cut/);
  const { error } = validateJournal({ body: twice });
  assert.match(error, /too long to save/);
});

test('word counting ignores extra whitespace', () => {
  assert.equal(wordCount('  one\n\ntwo   three '), 3);
  assert.equal(wordCount(''), 0);
});

test('entries can have an optional title, which is cleaned and length-checked', async () => {
  const { validateJournal, JOURNAL_TITLE_MAX } = await import('../src/lib/inputs.js');
  assert.equal(validateJournal({ title: '  A smaller   start ', body: 'x' }).value.title, 'A smaller start');
  assert.equal(validateJournal({ body: 'x' }).value.title, '');
  assert.ok(validateJournal({ title: 'Only a title' }).value, 'a title alone is enough to save');
  assert.match(validateJournal({ title: 'x'.repeat(JOURNAL_TITLE_MAX + 1), body: 'x' }).error, /title/);
});

test('entries without a title are named by their first sentence or their task', async () => {
  const { entryTitle } = await import('../src/lib/journal-meta.js');
  assert.equal(entryTitle({ title: 'Mine', body: 'Body.' }), 'Mine');
  assert.equal(entryTitle({ body: 'Library mornings work. Two chapters done.' }), 'Library mornings work');
  assert.equal(entryTitle({ body: '' }, 'CS4680 homework 4'), 'Check-in after CS4680 homework 4');
  assert.equal(entryTitle({ body: '' }), 'Quick check-in');
  const long = entryTitle({ body: 'Kept checking messages while editing my resume and every check felt like a few seconds' });
  assert.ok(long.endsWith('…') && long.length <= 61, long);
});
