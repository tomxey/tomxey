// End-to-end scaling behaviour over the real recipes in test/fixtures.
//
// The unit tests in scale.test.js check rules in isolation; these check that
// two recipes someone actually cooks from come out right, which is how the
// range and fraction bugs were caught in the first place.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyBelowTitle, titleOf } from '../src/recipes/content.js';
import { scaleSegments, scaledIngredientLines } from '../src/recipes/scale.js';
import { ALL, CIASTECZKA, GOFRY, MUST_NOT_CHANGE } from './fixtures/recipes.js';

const scaleBody = (md, factor) =>
  md
    .split('\n')
    .map((line) =>
      scaleSegments(line, factor)
        .map((s) => s.text)
        .join(''),
    )
    .join('\n');

// --- titles ------------------------------------------------------------------

test('each fixture derives its own name as the title', () => {
  for (const recipe of ALL) {
    assert.equal(titleOf({ md: recipe.md }), recipe.name);
  }
});

test('the title heading is not repeated in the body', () => {
  for (const recipe of ALL) {
    assert.equal(bodyBelowTitle({ md: recipe.md }).startsWith(`# ${recipe.name}`), false);
  }
});

// --- the invariant that matters ----------------------------------------------

test('times, temperatures, sizes and the flour type never change at any scale', () => {
  for (const factor of [0.3, 0.5, 1, 1.5, 2, 3]) {
    for (const recipe of ALL) {
      const scaled = `${scaleBody(recipe.md, factor)}\n${scaledIngredientLines(recipe.ingredients, factor).join('\n')}`;
      const original = `${recipe.md}\n${recipe.ingredients}`;
      for (const fragment of MUST_NOT_CHANGE) {
        if (!original.includes(fragment)) continue;
        assert.ok(
          scaled.includes(fragment),
          `×${factor} altered “${fragment}” in ${recipe.name}`,
        );
      }
    }
  }
});

test('a scale of 1 leaves both recipes byte-identical', () => {
  for (const recipe of ALL) {
    assert.equal(scaleBody(recipe.md, 1), recipe.md);
    assert.deepEqual(
      scaledIngredientLines(recipe.ingredients, 1),
      recipe.ingredients.split('\n'),
    );
  }
});

// --- gofry -------------------------------------------------------------------

test('gofry ingredients double', () => {
  assert.deepEqual(scaledIngredientLines(GOFRY.ingredients, 2), [
    '400 g mąki orkiszowej 1700',
    '4 jajka (białka ubić osobno na pianę)',
    '600 ml mleka (lub kefiru)',
    '50 g oliwy',
    '40 g cukru (lub łyżka miodu)',
    '2 łyżeczka proszku do pieczenia',
    'szczypta soli',
  ]);
});

test('gofry ingredients halve', () => {
  assert.deepEqual(scaledIngredientLines(GOFRY.ingredients, 0.5), [
    '100 g mąki orkiszowej 1700',
    '1 jajka (białka ubić osobno na pianę)',
    '150 ml mleka (lub kefiru)',
    '12.5 g oliwy',
    '10 g cukru (lub łyżka miodu)',
    '0.5 łyżeczka proszku do pieczenia',
    'szczypta soli',
  ]);
});

test('the gofry method has no quantities, so it never changes', () => {
  for (const factor of [0.5, 2, 3]) {
    assert.equal(scaleBody(GOFRY.md, factor), GOFRY.md);
  }
});

// --- ciasteczka --------------------------------------------------------------

test('ciasteczka ingredients double, including the range and the fraction', () => {
  assert.deepEqual(scaledIngredientLines(CIASTECZKA.ingredients, 2), [
    '900 g mąki orkiszowej 1700',
    '400 g płatków owsianych (zmiel ~połowę)',
    '200 g mielonych migdałów',
    '140 g oliwy',
    '160 g cukru',
    '360-380 ml mleka',
    '4 łyżeczki proszku do pieczenia',
    '0.5 łyżeczki soli',
    'wanilia (opcjonalnie)',
  ]);
});

test('the chocolate range in the method scales at both ends', () => {
  // Regression: this used to scale only the second number, giving "50-160 g".
  const scaled = scaleBody(CIASTECZKA.md, 2);
  assert.ok(scaled.includes('wmieszaj 100-160 g posiekanej'), scaled);
  assert.equal(scaled.includes('50-160'), false, 'only the upper bound was scaled');
});

test('the fraction stays a fraction until it is actually scaled', () => {
  // Regression: "1/4" used to render as "0.25" even at ×1.
  assert.ok(scaledIngredientLines(CIASTECZKA.ingredients, 1).includes('1/4 łyżeczki soli'));
});

test('a fractional scale keeps the ciasteczka amounts readable', () => {
  assert.deepEqual(scaledIngredientLines(CIASTECZKA.ingredients, 0.5), [
    '225 g mąki orkiszowej 1700',
    '100 g płatków owsianych (zmiel ~połowę)',
    '50 g mielonych migdałów',
    '35 g oliwy',
    '40 g cukru',
    '90-95 ml mleka',
    '1 łyżeczki proszku do pieczenia',
    '0.13 łyżeczki soli',
    'wanilia (opcjonalnie)',
  ]);
});
