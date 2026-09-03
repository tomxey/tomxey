// Todo content schema helpers, including appending copied recipe ingredients
// as subitems. Pure — no chain, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LIST,
  appendSubitems,
  listNames,
  listOf,
  newItemContent,
  nextContent,
  withList,
} from '../src/todo/content.js';

const inList = (list) => ({ content: { ...newItemContent('x'), list } });

test('a new item starts open with no subitems', () => {
  const content = newItemContent('Shopping');
  assert.equal(content.title, 'Shopping');
  assert.equal(content.done, false);
  assert.deepEqual(content.subs, []);
});

// --- applying a change ------------------------------------------------------

test('a change that mutates in place produces the new content', () => {
  const next = nextContent(newItemContent('x'), (c) => {
    c.done = true;
  });
  assert.equal(next.done, true);
});

test('whatever a change returns is ignored', () => {
  // Concise arrows return their assignment: `(c) => (c.done = !c.done)`
  // evaluates to a boolean, `(c) => (c.subs = c.subs.filter(…))` to an array,
  // and `(c) => c.subs.push(…)` to a number. Treating any of those as
  // replacement content substitutes it for the item and breaks rendering.
  const done = nextContent(newItemContent('x'), (c) => (c.done = true));
  assert.equal(done.title, 'x', 'a boolean return must not replace the content');
  assert.equal(done.done, true);

  const subs = nextContent({ ...newItemContent('x'), subs: [{ id: 'a' }] }, (c) => (c.subs = []));
  assert.equal(subs.title, 'x', 'an array return must not replace the content');
  assert.deepEqual(subs.subs, []);

  const pushed = nextContent(newItemContent('x'), (c) => c.subs.push({ id: 'b' }));
  assert.equal(pushed.title, 'x', 'a number return must not replace the content');
  assert.equal(pushed.subs.length, 1);
});

test('applying a change leaves the previous content untouched', () => {
  const previous = newItemContent('x');
  const snapshot = structuredClone(previous);
  nextContent(previous, (c) => {
    c.title = 'y';
    c.subs.push({ id: 'a' });
  });
  assert.deepEqual(previous, snapshot, 'rollback depends on the previous object surviving');
});

// --- lists ------------------------------------------------------------------

test('an item with no list field belongs to the default list', () => {
  // This is what makes every existing item work with no migration.
  assert.equal(listOf(newItemContent('x')), DEFAULT_LIST);
  assert.equal(listOf({ title: 'x' }), DEFAULT_LIST);
  assert.equal(listOf({ title: 'x', list: '' }), DEFAULT_LIST);
});

test('reads the list name of a grouped item', () => {
  assert.equal(listOf({ title: 'x', list: 'Shopping' }), 'Shopping');
});

test('moving an item into a list sets the name', () => {
  assert.equal(withList(newItemContent('x'), 'Shopping').list, 'Shopping');
});

test('moving an item back to the default drops the field entirely', () => {
  // Keeps "no field means default" the single canonical representation, and
  // keeps the blob a few bytes smaller.
  const grouped = withList(newItemContent('x'), 'Shopping');
  assert.equal('list' in withList(grouped, DEFAULT_LIST), false);
});

test('a list name is trimmed on the way in', () => {
  assert.equal(withList(newItemContent('x'), '  Shopping  ').list, 'Shopping');
  assert.equal('list' in withList(newItemContent('x'), '   '), false);
});

test('moving does not mutate the content it was given', () => {
  const before = newItemContent('x');
  const snapshot = structuredClone(before);
  withList(before, 'Shopping');
  assert.deepEqual(before, snapshot);
});

test('moving preserves the rest of the item', () => {
  const before = { ...newItemContent('x'), done: true, subs: [{ id: 'a', text: 'y', done: false }] };
  const moved = withList(before, 'Shopping');
  assert.equal(moved.done, true);
  assert.deepEqual(moved.subs, before.subs);
});

test('list names are the distinct names in use, default excluded', () => {
  const items = [inList('Shopping'), inList(undefined), inList('House'), inList('Shopping')];
  assert.deepEqual(listNames(items), ['House', 'Shopping']);
});

test('list names sort numeric-aware and case-insensitively', () => {
  assert.deepEqual(listNames([inList('10. z'), inList('2. b'), inList('apple'), inList('Banana')]), [
    '2. b',
    '10. z',
    'apple',
    'Banana',
  ]);
});

test('no lists exist when every item is in the default', () => {
  assert.deepEqual(listNames([inList(undefined), inList('')]), []);
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
