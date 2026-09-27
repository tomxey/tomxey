// Nutrition over the real recipes, against the generated USDA table.
//
// Unlike nutrition.test.js, which uses a synthetic table to test arithmetic,
// this checks the claims the feature actually makes about real food — and it
// fails if a regenerated table or a parsing change moves them.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FOOD_TABLE } from '../src/nutrition/foods.js';
import { analyse } from '../src/nutrition/nutrition.js';
import { CIASTECZKA, CYNAMONKI, GOFRY } from './fixtures/recipes.js';

const gofry = () => analyse(GOFRY.ingredients, 1, FOOD_TABLE);
const ciasteczka = () => analyse(CIASTECZKA.ingredients, 1, FOOD_TABLE);

test('every gofry ingredient is recognised and weighable', () => {
  const n = gofry();
  assert.deepEqual(n.unmatched, [], 'nothing should be left out of the totals');
  assert.equal(n.matchedCount, 7);
});

test('only the unquantified vanilla is uncounted in ciasteczka', () => {
  // "wanilia (opcjonalnie)" names no amount, so it genuinely cannot be
  // weighed — that is the correct outcome, not a matching failure.
  assert.deepEqual(ciasteczka().unmatched, ['wanilia (opcjonalnie)']);
});

test('the cereal-and-nut recipe is limited by lysine', () => {
  // Spelt, oats and almonds are all lysine-poor, and nothing in the recipe
  // supplies it. This is the substantive claim the panel makes.
  const n = ciasteczka();
  assert.equal(n.limiting, 'lys');
  assert.ok(n.score < 1, `expected an incomplete protein, got ${n.score}`);
});

test('adding egg and milk lifts the protein above the reference', () => {
  const n = gofry();
  assert.ok(n.score > 1, `expected a complete protein, got ${n.score}`);
});

test('the eggs and milk are what make the difference', () => {
  // Same claim, shown rather than asserted: strip the animal protein out of
  // gofry and it should fall back to being lysine-limited.
  const cerealOnly = GOFRY.ingredients
    .split('\n')
    .filter((line) => !/jajk|mlek/i.test(line))
    .join('\n');
  const n = analyse(cerealOnly, 1, FOOD_TABLE);
  assert.equal(n.limiting, 'lys');
  assert.ok(n.score < gofry().score);
});

test('salt counts the sodium in baking powder, not just the salt line', () => {
  // Counting only the salt line reported 6% of the daily maximum; the baking
  // powder carries more sodium than the salt does.
  const n = ciasteczka();
  assert.ok(n.total.saltEquivalent > 3, `expected over 3 g of salt, got ${n.total.saltEquivalent}`);
  assert.ok(n.saltFractionOfDailyMax > 0.5);
});

test('sugars are counted and are a large share of the carbohydrate', () => {
  // A regression in the nutrient name reported every food as sugar-free.
  const n = ciasteczka();
  assert.ok(n.total.sugars > 100, `expected over 100 g of sugars, got ${n.total.sugars}`);
  assert.ok(n.total.sugars < n.total.carbs);
});

test('the batch weight is the sum of the ingredients', () => {
  const n = gofry();
  assert.ok(Math.abs(n.total.grams - 659) < 5, `batch weighed ${n.total.grams} g`);
});

test('doubling the portions doubles the energy but not the score', () => {
  const single = ciasteczka();
  const double = analyse(CIASTECZKA.ingredients, 2, FOOD_TABLE);
  assert.ok(Math.abs(double.total.kcal - single.total.kcal * 2) < 1e-6);
  assert.equal(double.score, single.score);
});

// --- food table disambiguation --------------------------------------------------
//
// findFood returns the first entry whose pattern matches, so a general
// pattern placed before a specific one silently swallows it. Each of these
// pairs would resolve to the wrong food if the table were reordered.

const foodFor = (line) => analyse(line, 1, FOOD_TABLE).matched[0]?.food ?? null;

test('an egg yolk is not counted as a whole egg', () => {
  // "żółtko z dużego jajka" contains "jajk"; the whole-egg entry would claim
  // it and count 50 g where a yolk is 17 g.
  assert.equal(foodFor('1 żółtko z dużego jajka'), 'egg-yolk');
  assert.equal(foodFor('1 jajko'), 'egg');
  assert.equal(analyse('1 żółtko z dużego jajka', 1, FOOD_TABLE).total.grams, 17);
});

test('cane sugar is not counted as white sugar', () => {
  assert.equal(foodFor('100 g cukru trzcinowego'), 'brown-sugar');
  assert.equal(foodFor('3 łyżki drobnego cukru'), 'sugar');
});

test('wheat flour and spelt flour stay apart', () => {
  assert.equal(foodFor('360 g mąki pszennej typ 550'), 'wheat-flour');
  assert.equal(foodFor('450 g mąki orkiszowej 1700'), 'spelt-flour');
});

test('butter is not confused with buttermilk-like names', () => {
  assert.equal(foodFor('100 g masła'), 'butter');
});

// --- cynamonki ------------------------------------------------------------------

test('every cynamonki ingredient is recognised and weighable', () => {
  const n = analyse(CYNAMONKI.ingredients, 1, FOOD_TABLE);
  assert.deepEqual(n.unmatched, []);
  assert.equal(n.matchedCount, 17);
});

test('mascarpone protein is excluded from the score and named', () => {
  // Branded records carry no amino acids; that protein must not sit in the
  // scoring denominator with nothing against it.
  const n = analyse(CYNAMONKI.ingredients, 1, FOOD_TABLE);
  assert.ok(n.incomplete.aminoAcids.includes('mascarpone'));
  assert.ok(n.proteinScored < n.total.protein);
});

test('the butter in both components is counted twice, not once', () => {
  const n = analyse(CYNAMONKI.ingredients, 1, FOOD_TABLE);
  const butter = n.matched.filter((m) => m.food === 'butter');
  assert.equal(butter.length, 2);
  assert.equal(butter[0].grams + butter[1].grams, 200);
});
