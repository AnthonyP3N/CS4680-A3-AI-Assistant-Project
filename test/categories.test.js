import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATEGORIES, categoryOptions, cleanCategory, matchCategory } from '../src/lib/categories.js';
import { normalizeDb } from '../src/lib/db.js';
import { validateTask } from '../src/lib/inputs.js';

test('built-in list includes the everyday categories', () => {
  for (const c of ['Studying', 'Homework', 'Exercise', 'Errands', 'Personal', 'Work', 'Chores', 'Bills', 'Finances']) {
    assert.ok(DEFAULT_CATEGORIES.includes(c), c);
  }
});

test('options merge saved and in-use categories without case duplicates', () => {
  const { suggested, custom } = categoryOptions(['homework', 'Guitar', 'guitar', ' '], [{ category: 'Volunteering' }, { category: 'WORK' }]);
  assert.deepEqual(suggested, [...DEFAULT_CATEGORIES]);
  assert.deepEqual(custom, ['Guitar', 'Volunteering']);
});

test('matching and cleaning', () => {
  assert.equal(matchCategory('studying', DEFAULT_CATEGORIES), 'Studying');
  assert.equal(matchCategory('xyz', DEFAULT_CATEGORIES), null);
  assert.equal(cleanCategory('  side   project '), 'Side project');
});

test('tasks: category is cleaned, and due-date years are sanity-checked', () => {
  assert.equal(validateTask({ title: 'A', category: '  errands ' }).value.category, 'Errands');
  assert.match(validateTask({ title: 'A', dueDate: '1222-12-12' }).error, /year/);
  assert.ok(!validateTask({ title: 'A', dueDate: '2026-12-12' }).error);
  assert.match(validateTask({ title: 'A', category: 'x'.repeat(31) }).error, /30 characters/);
});

test('older data: unused "Study" is replaced by the new built-in list', () => {
  const db = normalizeDb({ categories: ['Homework', 'Study', 'Work', 'Personal', 'Health', 'Guitar'], tasks: [] });
  assert.ok(!db.categories.includes('Study'));
  assert.ok(db.categories.includes('Guitar') && db.categories.includes('Studying') && db.categories.includes('Bills'));
  const kept = normalizeDb({ categories: ['Study'], tasks: [{ category: 'Study' }] });
  assert.ok(kept.categories.includes('Study'));
});
