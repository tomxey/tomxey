// History lines for todo item changes. Pure — no chain, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeTodo } from '../src/todo/describe.js';

const item = (over = {}) => ({ v: 1, title: 'buy flour', done: false, subs: [], ...over });
const edit = (before, after) => describeTodo({ change: 'mutated', before, after });

test('reports a creation with its title', () => {
  assert.deepEqual(describeTodo({ change: 'created', before: null, after: item() }), [
    '＋ created “buy flour”',
  ]);
});

test('reports a deletion with its title', () => {
  assert.deepEqual(describeTodo({ change: 'deleted', before: item(), after: null }), [
    '✕ deleted “buy flour”',
  ]);
});

test('reports a rename', () => {
  assert.deepEqual(edit(item(), item({ title: 'buy rye flour' })), [
    'renamed “buy flour” → “buy rye flour”',
  ]);
});

test('reports completion and reopening', () => {
  assert.deepEqual(edit(item(), item({ done: true })), ['☑ completed “buy flour”']);
  assert.deepEqual(edit(item({ done: true }), item()), ['☐ reopened “buy flour”']);
});

test('reports a move into a list', () => {
  assert.deepEqual(edit(item(), item({ list: 'Shopping' })), ['→ moved “buy flour” to «Shopping»']);
});

test('reports a move back to the default list by its label', () => {
  assert.deepEqual(edit(item({ list: 'Shopping' }), item()), ['→ moved “buy flour” to «Main»']);
});

test('reports a move between two lists', () => {
  assert.deepEqual(edit(item({ list: 'House' }), item({ list: 'Shopping' })), [
    '→ moved “buy flour” to «Shopping»',
  ]);
});

test('reports a move alongside other changes in the same edit', () => {
  const lines = edit(item(), item({ title: 'rye flour', list: 'Shopping' }));
  assert.equal(lines.length, 2);
  assert.ok(lines.some((l) => l.includes('renamed')));
  assert.ok(lines.some((l) => l.includes('moved')));
});

test('does not report a move when the list is unchanged', () => {
  assert.deepEqual(edit(item({ list: 'Shopping' }), item({ list: 'Shopping', done: true })), [
    '☑ completed “buy flour”',
  ]);
});

test('reports subitem changes', () => {
  const before = item({ subs: [{ id: 'a', text: 'milk', done: false }] });
  assert.deepEqual(edit(before, item({ subs: [] })), ['✕ removed “milk” from “buy flour”']);
});

test('falls back when a past version is unavailable', () => {
  assert.deepEqual(edit(null, item()), ['edited an item (details no longer available)']);
});
