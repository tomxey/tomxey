// The DOM half of the recipe markdown renderer. Driven through an injected
// fake document so it runs in node without a DOM dependency — and so the
// assertions can see exactly which nodes were created.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { renderMarkdown } from '../src/recipes/markdown.js';
import { scaleSegments } from '../src/recipes/scale.js';
import { CIASTECZKA } from './fixtures/recipes.js';

/// The smallest document surface the renderer is allowed to use. Anything
/// else (notably innerHTML) is absent, so reaching for it throws.
function fakeDocument() {
  const element = (tag) => ({
    tag,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  });
  return {
    createElement: element,
    createTextNode: (text) => ({ tag: '#text', text, children: [] }),
    createDocumentFragment: () => element('#fragment'),
  };
}

/// Tree -> nested arrays, text nodes as bare strings.
const outline = (node) =>
  node.tag === '#text' ? node.text : [node.tag, ...node.children.map(outline)];

const render = (md) => outline(renderMarkdown(md, fakeDocument())).slice(1);

/// Depth-first search for the first element with the given tag.
function find(node, tag) {
  if (node.tag === tag) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, tag);
    if (hit) return hit;
  }
  return null;
}

test('renders each heading level as the matching element', () => {
  assert.deepEqual(render('# One\n\n## Two\n\n### Three'), [
    ['h1', 'One'],
    ['h2', 'Two'],
    ['h3', 'Three'],
  ]);
});

test('renders emphasis as nested elements inside a paragraph', () => {
  assert.deepEqual(render('2 **large** eggs'), [['p', '2 ', ['strong', 'large'], ' eggs']]);
});

test('renders an unordered list', () => {
  assert.deepEqual(render('- flour\n- water'), [['ul', ['li', 'flour'], ['li', 'water']]]);
});

test('renders an ordered list as ol', () => {
  assert.deepEqual(render('1. mix\n2. knead'), [['ol', ['li', 'mix'], ['li', 'knead']]]);
});

test('renders nested items as a list inside the parent item', () => {
  assert.deepEqual(render('- dough\n  - flour'), [['ul', ['li', 'dough', ['ul', ['li', 'flour']]]]]);
});

test('renders a task item as a disabled checkbox', () => {
  const fragment = renderMarkdown('- [x] buy salt', fakeDocument());
  const box = find(fragment, 'input');
  assert.equal(box.type, 'checkbox');
  assert.equal(box.checked, true);
  assert.equal(box.disabled, true, 'recipe checkboxes are display-only in this version');
});

test('renders an unchecked task item', () => {
  const box = find(renderMarkdown('- [ ] buy flour', fakeDocument()), 'input');
  assert.equal(box.checked, false);
});

test('renders fenced code as pre > code with contents intact', () => {
  assert.deepEqual(render('```\n# literal\n```'), [['pre', ['code', '# literal']]]);
});

test('renders blockquotes and rules', () => {
  assert.deepEqual(render('> rest it\n\n---'), [['blockquote', 'rest it'], ['hr']]);
});

test('renders a safe link with target and rel hardening', () => {
  const link = find(renderMarkdown('[src](https://example.com)', fakeDocument()), 'a');
  assert.equal(link.href, 'https://example.com');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
});

test('creates no anchor for a javascript: URL', () => {
  const fragment = renderMarkdown('[click](javascript:alert(1))', fakeDocument());
  assert.equal(find(fragment, 'a'), null, 'a javascript: URL must never become a link');
  assert.deepEqual(outline(fragment).slice(1), [['p', '[click](javascript:alert(1))']]);
});

test('renders embedded HTML as visible text, creating no elements', () => {
  const fragment = renderMarkdown('<img src=x onerror=alert(1)>', fakeDocument());
  assert.equal(find(fragment, 'img'), null);
  assert.deepEqual(outline(fragment).slice(1), [['p', '<img src=x onerror=alert(1)>']]);
});

// --- transformText hook (used for portion scaling) ---------------------------

/// Stand-in for the scaler: turns "500g" into a highlighted "1000g".
const doubling = (text) =>
  text
    .split(/(500g)/)
    .filter(Boolean)
    .map((part) =>
      part === '500g'
        ? { type: 'mark', inline: [{ type: 'text', text: '1000g' }] }
        : { type: 'text', text: part },
    );

const renderWith = (md, transformText) =>
  outline(renderMarkdown(md, fakeDocument(), { transformText })).slice(1);

test('applies transformText to paragraph text', () => {
  assert.deepEqual(renderWith('Mix 500g flour', doubling), [
    ['p', 'Mix ', ['mark', '1000g'], ' flour'],
  ]);
});

test('applies transformText inside emphasis and list items', () => {
  assert.deepEqual(renderWith('- **500g** flour', doubling), [
    ['ul', ['li', ['strong', ['mark', '1000g']], ' flour']],
  ]);
});

test('never applies transformText to inline code', () => {
  // A quantity shown as code is being quoted literally, not stated.
  assert.deepEqual(renderWith('use `500g` exactly', doubling), [
    ['p', 'use ', ['code', '500g'], ' exactly'],
  ]);
});

test('never applies transformText to a fenced code block', () => {
  assert.deepEqual(renderWith('```\n500g\n```', doubling), [['pre', ['code', '500g']]]);
});

test('never rewrites a link href', () => {
  const link = find(
    renderMarkdown('[x](https://example.com/500g)', fakeDocument(), { transformText: doubling }),
    'a',
  );
  assert.equal(link.href, 'https://example.com/500g');
});

test('does not re-apply transformText to its own output', () => {
  // The real scaler re-matches what it produces — "500g" at ×1 is still
  // "500g" — so feeding a produced node's text back through the transform
  // recurses until the stack dies. The earlier fake transform hid this
  // because its output ("1000g") no longer matched its own pattern.
  const selfMatching = (text) =>
    text.includes('500g')
      ? [{ type: 'mark', inline: [{ type: 'text', text }] }]
      : [{ type: 'text', text }];

  assert.deepEqual(renderWith('Mix 500g', selfMatching), [['p', ['mark', 'Mix 500g']]]);
});

test('renders a real recipe body through the real scaler without recursing', () => {
  // End-to-end against the recipe that actually crashed: its method contains
  // "50-80 g", which the scaler marks as a quantity.
  const transformText = (text) =>
    scaleSegments(text, 1).map((s) =>
      s.scaled ? { type: 'mark', inline: [{ type: 'text', text: s.text }] } : { type: 'text', text: s.text },
    );

  const fragment = renderMarkdown(CIASTECZKA.md, fakeDocument(), { transformText });
  const marks = [];
  const walk = (n) => {
    if (n.tag === 'mark') marks.push(outline(n).slice(1).join(''));
    (n.children ?? []).forEach(walk);
  };
  walk(fragment);
  assert.deepEqual(marks, ['50-80 g']);
});

test('renders unchanged when no transformText is given', () => {
  assert.deepEqual(render('Mix 500g flour'), [['p', 'Mix 500g flour']]);
});

test('the renderer source never mentions innerHTML', () => {
  // The page that renders recipes holds the decrypted seed in memory, so
  // treating recipe text as HTML would be an XSS path into the wallet. This
  // guards the invariant at the source level, where it is actually enforced.
  const source = readFileSync(new URL('../src/recipes/markdown.js', import.meta.url), 'utf8');
  assert.equal(source.includes('innerHTML'), false);
  assert.equal(source.includes('outerHTML'), false);
  assert.equal(source.includes('insertAdjacentHTML'), false);
});
