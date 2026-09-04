// Recipe content schema: derived titles, ingredient parsing, ordering, and
// the line counts history reports. All pure — no chain, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_PAYLOAD_BYTES, payloadBytes } from '../src/app/payload.js';
import {
  RECIPE_FORMAT_VERSION,
  bodyBelowTitle,
  ingredientsOf,
  servingsOf,
  lineDelta,
  newRecipeContent,
  parseIngredients,
  sortedByTitle,
  titleOf,
} from '../src/recipes/content.js';

const entry = (md) => ({ content: { md } });
const titles = (entries) => entries.map((e) => titleOf(e.content));

test('new content carries the schema version, servings, ingredients and markdown', () => {
  assert.deepEqual(newRecipeContent({ servings: 8, ingredients: '500g flour', md: '# Rosół' }), {
    v: RECIPE_FORMAT_VERSION,
    servings: 8,
    ingredients: '500g flour',
    md: '# Rosół',
  });
});

test('new content defaults to one serving and empty text', () => {
  assert.deepEqual(newRecipeContent({}), {
    v: RECIPE_FORMAT_VERSION,
    servings: 1,
    ingredients: '',
    md: '',
  });
});

// --- servings ----------------------------------------------------------------

test('a recipe written before servings existed counts as one', () => {
  assert.equal(servingsOf({ v: 1, md: '# Old' }), 1);
  assert.equal(servingsOf({ v: 2, ingredients: '', md: '' }), 1);
  assert.equal(servingsOf(undefined), 1);
});

test('reads a stored serving count', () => {
  assert.equal(servingsOf({ servings: 8 }), 8);
});

test('a nonsensical serving count falls back to one', () => {
  // Zero would divide the whole panel by zero; negatives and junk are no
  // more meaningful.
  for (const bad of [0, -3, 'eight', null, NaN, Infinity]) {
    assert.equal(servingsOf({ servings: bad }), 1, `servings: ${bad}`);
  }
});

test('a fractional serving count rounds down to a whole serving', () => {
  assert.equal(servingsOf({ servings: 8.7 }), 8);
});

// --- back compatibility -----------------------------------------------------

test('a v1 recipe with no ingredients field reads as empty ingredients', () => {
  // Recipes written before the ingredients field existed must still open.
  assert.equal(ingredientsOf({ v: 1, md: '# Old recipe' }), '');
  assert.deepEqual(parseIngredients(ingredientsOf({ v: 1, md: '# Old' })), []);
});

test('a v1 recipe still yields its title', () => {
  assert.equal(titleOf({ v: 1, md: '# Old recipe' }), 'Old recipe');
});

// --- ingredient parsing -----------------------------------------------------

test('one line becomes one ingredient', () => {
  assert.deepEqual(parseIngredients('500g flour\n2 large eggs'), ['500g flour', '2 large eggs']);
});

test('blank and whitespace-only lines are dropped', () => {
  assert.deepEqual(parseIngredients('500g flour\n\n   \n2 eggs\n'), ['500g flour', '2 eggs']);
});

test('surrounding whitespace is trimmed', () => {
  assert.deepEqual(parseIngredients('  500g flour  '), ['500g flour']);
});

test('a leading dash or star bullet is stripped', () => {
  assert.deepEqual(parseIngredients('- 500g flour\n* 2 eggs\n-  200g twaróg'), [
    '500g flour',
    '2 eggs',
    '200g twaróg',
  ]);
});

test('a dash inside the text is left alone', () => {
  assert.deepEqual(parseIngredients('sugar-free syrup\n1-2 apples'), [
    'sugar-free syrup',
    '1-2 apples',
  ]);
});

test('a bare bullet with no text is dropped', () => {
  assert.deepEqual(parseIngredients('- \n-\n500g flour'), ['500g flour']);
});

test('empty ingredients yield no entries', () => {
  assert.deepEqual(parseIngredients(''), []);
  assert.deepEqual(parseIngredients('   \n\n'), []);
  assert.deepEqual(parseIngredients(undefined), []);
});

// --- titles -----------------------------------------------------------------

test('derives the title from a heading at any level', () => {
  assert.equal(titleOf({ md: '# One' }), 'One');
  assert.equal(titleOf({ md: '## Two' }), 'Two');
  assert.equal(titleOf({ md: '### Three' }), 'Three');
});

test('strips surrounding whitespace from the heading text', () => {
  assert.equal(titleOf({ md: '##   Pierogi ruskie  ' }), 'Pierogi ruskie');
});

test('skips leading blank lines to find the heading', () => {
  assert.equal(titleOf({ md: '\n\n# Rosół\n\nbroth' }), 'Rosół');
});

test('uses the first heading even when prose comes before it', () => {
  assert.equal(titleOf({ md: 'a note to self\n\n# Real Title' }), 'Real Title');
});

test('falls back to the first non-empty line when there is no heading', () => {
  assert.equal(titleOf({ md: '\n\nboil water\nthen wait' }), 'boil water');
});

test('the title never comes from the ingredients field', () => {
  // Ingredients are not part of the recipe's identity; a recipe with only
  // ingredients typed is still untitled.
  assert.equal(titleOf({ ingredients: '500g flour', md: '' }), 'untitled');
});

test('falls back to untitled for empty or whitespace-only markdown', () => {
  assert.equal(titleOf({ md: '' }), 'untitled');
  assert.equal(titleOf({ md: '   \n\n  ' }), 'untitled');
  assert.equal(titleOf({}), 'untitled');
});

// --- body below the title ---------------------------------------------------

test('drops the opening heading, which is already shown as the title', () => {
  assert.equal(bodyBelowTitle({ md: '# Gofry\n\n## Metoda\n\n1. Mieszaj.' }), '## Metoda\n\n1. Mieszaj.');
});

test('drops leading blank lines before the heading too', () => {
  assert.equal(bodyBelowTitle({ md: '\n\n# Gofry\n\nciasto' }), 'ciasto');
});

test('keeps every later heading', () => {
  assert.equal(bodyBelowTitle({ md: '# Gofry\n\n## Metoda\n\n## Uwagi' }), '## Metoda\n\n## Uwagi');
});

test('keeps the body intact when it does not open with a heading', () => {
  // Here the title fell back to the first line, so removing it would delete
  // content the user wrote as part of the recipe.
  const md = 'ciasto naleśnikowe\n\nwymieszaj';
  assert.equal(bodyBelowTitle({ md }), md);
});

test('keeps a heading that appears after prose', () => {
  const md = 'notatka\n\n# Gofry\n\nciasto';
  assert.equal(bodyBelowTitle({ md }), md);
});

test('a body that is only a heading becomes empty', () => {
  assert.equal(bodyBelowTitle({ md: '# Gofry' }), '');
});

test('tolerates a missing body', () => {
  assert.equal(bodyBelowTitle({}), '');
});

// --- payload size -----------------------------------------------------------

test('payload size counts both text fields', () => {
  const withIngredients = payloadBytes(newRecipeContent({ ingredients: 'flour', md: 'x' }));
  const without = payloadBytes(newRecipeContent({ ingredients: '', md: 'x' }));
  assert.equal(withIngredients - without, 5, 'ingredients bytes count toward the cap');
});

test('payload size counts a JSON-escaped newline as two bytes', () => {
  // Same character count either way, so the difference is purely the escaping.
  const plain = payloadBytes(newRecipeContent({ md: 'axb' }));
  const newline = payloadBytes(newRecipeContent({ md: 'a\nb' }));
  assert.equal(newline - plain, 1, "'\\n' serializes as two characters where 'x' was one");
});

test('payload size counts multi-byte characters by their UTF-8 length', () => {
  const ascii = payloadBytes(newRecipeContent({ md: 'o' }));
  const accented = payloadBytes(newRecipeContent({ md: 'ó' }));
  assert.equal(accented - ascii, 1, 'ó is two bytes in UTF-8');
});

test('the cap admits a payload of exactly the limit and rejects one byte more', () => {
  const envelope = payloadBytes(newRecipeContent({}));
  const fits = newRecipeContent({ md: 'a'.repeat(MAX_PAYLOAD_BYTES - envelope) });
  assert.equal(payloadBytes(fits), MAX_PAYLOAD_BYTES);

  const over = newRecipeContent({ md: 'a'.repeat(MAX_PAYLOAD_BYTES - envelope + 1) });
  assert.equal(payloadBytes(over), MAX_PAYLOAD_BYTES + 1);
});

test('the cap leaves headroom under the protocol pure-argument limit', () => {
  // max_pure_argument_size on testnet is 16384, and a 16400-byte argument was
  // rejected on chain; the gap covers the BCS length prefix.
  assert.ok(MAX_PAYLOAD_BYTES < 16384);
});

// --- ordering ---------------------------------------------------------------

test('sorts entries by derived title', () => {
  const sorted = sortedByTitle([entry('# Zapiekanka'), entry('# Pierogi'), entry('# Rosół')]);
  assert.deepEqual(titles(sorted), ['Pierogi', 'Rosół', 'Zapiekanka']);
});

test('sorts numeric title prefixes in numeric order', () => {
  const sorted = sortedByTitle([entry('# 10. last'), entry('# 2. second'), entry('# 1. first')]);
  assert.deepEqual(titles(sorted), ['1. first', '2. second', '10. last']);
});

test('sorts case-insensitively', () => {
  const sorted = sortedByTitle([entry('# banana'), entry('# Apple')]);
  assert.deepEqual(titles(sorted), ['Apple', 'banana']);
});

test('sorting leaves the input array untouched', () => {
  const input = [entry('# b'), entry('# a')];
  sortedByTitle(input);
  assert.deepEqual(titles(input), ['b', 'a'], 'callers keep their own array order');
});

// --- history line counts ----------------------------------------------------

test('line delta counts added and removed lines', () => {
  assert.deepEqual(lineDelta('a\nb\nc', 'a\nx\nc'), { added: 1, removed: 1 });
});

test('line delta is zero for identical text', () => {
  assert.deepEqual(lineDelta('a\nb', 'a\nb'), { added: 0, removed: 0 });
});

test('line delta counts repeated lines as a multiset', () => {
  assert.deepEqual(lineDelta('a\na', 'a'), { added: 0, removed: 1 });
  assert.deepEqual(lineDelta('a', 'a\na\na'), { added: 2, removed: 0 });
});

test('line delta reports a pure addition when the recipe grows', () => {
  assert.deepEqual(lineDelta('a', 'a\nb\nc'), { added: 2, removed: 0 });
});

test('line delta ignores line order', () => {
  assert.deepEqual(lineDelta('a\nb', 'b\na'), { added: 0, removed: 0 });
});
