import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickAdd } from '../src/lib/quickadd.js';

const WED = '2026-10-21'; // a Wednesday

test('reads estimate, weekday, priority and category from one line', () => {
  const p = parseQuickAdd('Physics lab report 90m fri high #homework', WED);
  assert.equal(p.title, 'Physics lab report');
  assert.equal(p.estimateMinutes, 90);
  assert.equal(p.dueDate, '2026-10-23');
  assert.equal(p.dueText, 'Friday');
  assert.equal(p.priority, 'high');
  assert.equal(p.category, 'Homework');
});

test('durations in many shapes', () => {
  assert.equal(parseQuickAdd('a 2h', WED).estimateMinutes, 120);
  assert.equal(parseQuickAdd('a 1.5h', WED).estimateMinutes, 90);
  assert.equal(parseQuickAdd('a 1h30', WED).estimateMinutes, 90);
  assert.equal(parseQuickAdd('a 45min', WED).estimateMinutes, 45);
  assert.equal(parseQuickAdd('Read 2 chapters', WED).estimateMinutes, null, 'a bare number stays in the title');
  assert.equal(parseQuickAdd('Read 2 chapters', WED).title, 'Read 2 chapters');
});

test('today, tomorrow and the same weekday', () => {
  assert.equal(parseQuickAdd('x today', WED).dueDate, WED);
  assert.equal(parseQuickAdd('x tomorrow', WED).dueDate, '2026-10-22');
  assert.equal(parseQuickAdd('x wed', WED).dueDate, WED);
  assert.equal(parseQuickAdd('x mon', WED).dueDate, '2026-10-26');
});

test('only the first of each kind is used; the rest stays in the title', () => {
  const p = parseQuickAdd('Email 30m 45m tue fri', WED);
  assert.equal(p.estimateMinutes, 30);
  assert.equal(p.dueText, 'Tuesday');
  assert.equal(p.title, 'Email 45m fri');
});

test('no title when only tokens are typed', () => {
  assert.equal(parseQuickAdd('45m today', WED).title, '');
});
