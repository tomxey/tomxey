// The markdown subset used by recipes. `parse` is pure and testable here;
// the DOM half is covered in markdown-render.test.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/recipes/markdown.js';

/// Collapse an inline tree to plain text, for assertions that don't care
/// about emphasis structure.
const flatten = (inline) =>
  inline.map((node) => (node.type === 'text' || node.type === 'code' ? node.text : flatten(node.inline))).join('');

test('parses headings at each supported level', () => {
  const blocks = parse('# One\n\n## Two\n\n### Three');
  assert.deepEqual(
    blocks.map((b) => [b.type, b.level, flatten(b.inline)]),
    [
      ['heading', 1, 'One'],
      ['heading', 2, 'Two'],
      ['heading', 3, 'Three'],
    ],
  );
});

test('treats a fourth-level heading as a paragraph', () => {
  const [block] = parse('#### Too deep');
  assert.equal(block.type, 'para');
  assert.equal(flatten(block.inline), '#### Too deep');
});

test('groups consecutive dash items into one unordered list', () => {
  const [block] = parse('- flour\n- water\n- salt');
  assert.equal(block.type, 'list');
  assert.equal(block.ordered, false);
  assert.deepEqual(
    block.items.map((i) => flatten(i.inline)),
    ['flour', 'water', 'salt'],
  );
});

test('parses ordered lists', () => {
  const [block] = parse('1. mix\n2. knead');
  assert.equal(block.type, 'list');
  assert.equal(block.ordered, true);
  assert.deepEqual(
    block.items.map((i) => flatten(i.inline)),
    ['mix', 'knead'],
  );
});

test('nests one level of indented list items under their parent', () => {
  const [block] = parse('- dough\n  - flour\n  - water\n- filling');
  assert.equal(block.items.length, 2);
  assert.deepEqual(
    block.items[0].children.map((i) => flatten(i.inline)),
    ['flour', 'water'],
  );
  assert.equal(flatten(block.items[1].inline), 'filling');
  assert.deepEqual(block.items[1].children, []);
});

test('reads task list markers as checkbox state', () => {
  const [block] = parse('- [ ] buy flour\n- [x] buy salt');
  assert.deepEqual(
    block.items.map((i) => [i.task, flatten(i.inline)]),
    [
      [false, 'buy flour'],
      [true, 'buy salt'],
    ],
  );
});

test('leaves task null for a plain list item', () => {
  const [block] = parse('- flour');
  assert.equal(block.items[0].task, null);
});

test('keeps fenced code verbatim, including markdown characters', () => {
  const [block] = parse('```\n# not a heading\n**not bold**\n```');
  assert.equal(block.type, 'code');
  assert.equal(block.text, '# not a heading\n**not bold**');
});

test('parses blockquotes and horizontal rules', () => {
  const blocks = parse('> tip: rest the dough\n\n---');
  assert.equal(blocks[0].type, 'quote');
  assert.equal(flatten(blocks[0].inline), 'tip: rest the dough');
  assert.equal(blocks[1].type, 'hr');
});

test('joins consecutive lines into one paragraph and splits on blank lines', () => {
  const blocks = parse('line one\nline two\n\nsecond para');
  assert.equal(blocks.length, 2);
  assert.equal(flatten(blocks[0].inline), 'line one line two');
  assert.equal(flatten(blocks[1].inline), 'second para');
});

test('parses bold, italic and inline code', () => {
  const [block] = parse('2 **large** eggs, *maybe* `3`');
  assert.deepEqual(
    block.inline.map((n) => [n.type, n.text ?? flatten(n.inline)]),
    [
      ['text', '2 '],
      ['strong', 'large'],
      ['text', ' eggs, '],
      ['em', 'maybe'],
      ['text', ' '],
      ['code', '3'],
    ],
  );
});

test('parses underscore italics', () => {
  const [block] = parse('_gently_');
  assert.equal(block.inline[0].type, 'em');
});

test('does not treat inline code contents as emphasis', () => {
  const [block] = parse('`a * b * c`');
  assert.deepEqual(block.inline, [{ type: 'code', text: 'a * b * c' }]);
});

test('parses an http link', () => {
  const [block] = parse('see [the source](https://example.com/x)');
  const link = block.inline[1];
  assert.equal(link.type, 'link');
  assert.equal(link.href, 'https://example.com/x');
  assert.equal(flatten(link.inline), 'the source');
});

test('refuses non-http link schemes, keeping the source as text', () => {
  const [block] = parse('[click](javascript:alert(1))');
  assert.equal(
    block.inline.every((node) => node.type === 'text'),
    true,
    'a javascript: URL must not produce a link node',
  );
  assert.equal(flatten(block.inline), '[click](javascript:alert(1))');
});

test('never produces a raw-html node for embedded markup', () => {
  const [block] = parse('<img src=x onerror=alert(1)>');
  assert.equal(block.type, 'para');
  assert.deepEqual(block.inline, [{ type: 'text', text: '<img src=x onerror=alert(1)>' }]);
});

test('returns no blocks for empty or whitespace-only input', () => {
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('   \n\n  '), []);
});
