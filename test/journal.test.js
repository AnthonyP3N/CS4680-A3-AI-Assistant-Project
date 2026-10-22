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
