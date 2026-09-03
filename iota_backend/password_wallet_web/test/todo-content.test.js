// Todo content schema helpers, including appending copied recipe ingredients
// as subitems. Pure — no chain, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendSubitems, newItemContent } from '../src/todo/content.js';

test('a new item starts open with no subitems', () => {
  const content = newItemContent('Shopping');
  assert.equal(content.title, 'Shopping');
  assert.equal(content.done, false);
  assert.deepEqual(content.subs, []);
});

test('appends one subitem per text', () => {
  const next = appendSubitems(newItemContent('Shopping'), ['500g flour', '2 eggs']);
  assert.deepEqual(
    next.subs.map((s) => [s.text, s.done]),
    [
      ['500g flour', false],
      ['2 eggs', false],
    ],
  );
});

test('keeps existing subitems and their state', () => {
  const before = { ...newItemContent('Shopping'), subs: [{ id: 'a', text: 'milk', done: true }] };
  const next = appendSubitems(before, ['500g flour']);
  assert.deepEqual(
    next.subs.map((s) => s.text),
    ['milk', '500g flour'],
  );
  assert.equal(next.subs[0].done, true, 'an already-ticked subitem stays ticked');
});

test('gives every appended subitem a distinct id', () => {
  const next = appendSubitems(newItemContent('Shopping'), ['a', 'b', 'c']);
  assert.equal(new Set(next.subs.map((s) => s.id)).size, 3);
});

test('does not mutate the content it was given', () => {
  // The UI applies changes optimistically and rolls back on failure, so the
  // previous content object has to stay intact.
  const before = newItemContent('Shopping');
  const snapshot = structuredClone(before);
  appendSubitems(before, ['500g flour']);
  assert.deepEqual(before, snapshot);
});

test('appending nothing leaves the subitems unchanged', () => {
  const before = { ...newItemContent('Shopping'), subs: [{ id: 'a', text: 'milk', done: false }] };
  assert.deepEqual(appendSubitems(before, []).subs, before.subs);
});

test('preserves the rest of the item', () => {
  const before = { ...newItemContent('Shopping'), done: true, order: 42 };
  const next = appendSubitems(before, ['x']);
  assert.equal(next.title, 'Shopping');
  assert.equal(next.done, true);
  assert.equal(next.order, 42);
  assert.equal(next.v, before.v);
});
