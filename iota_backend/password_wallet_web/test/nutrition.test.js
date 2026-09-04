// Turning ingredient lines into grams, macros and an amino acid profile.
// Uses a synthetic food table so these tests never depend on the generated
// USDA data.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DAILY_FIBER_G,
  DAILY_SALT_MAX_G,
  analyse,
  dailyFractions,
  energyShares,
  perServing,
  gramsFor,
  parseIngredientLine,
} from '../src/nutrition/nutrition.js';

/// Deliberately round numbers, so arithmetic errors are obvious.
const FOODS = [
  {
    id: 'flour',
    match: [/mąk/i, /flour/i],
    per100g: { kcal: 100, protein: 10, fat: 1, carbs: 70, sugars: 1, fiber: 8, sodium: 2 },
    aa: { lys: 100, leu: 200, ile: 100, val: 100, thr: 100, trp: 20, his: 50, sulfur: 100, phe_tyr: 200 },
  },
  {
    id: 'milk',
    match: [/mlek/i, /milk/i],
    per100g: { kcal: 60, protein: 3, fat: 3, carbs: 5, sugars: 5, fiber: 0, sodium: 40 },
    aa: { lys: 300, leu: 300, ile: 200, val: 200, thr: 150, trp: 50, his: 100, sulfur: 100, phe_tyr: 300 },
    gramsPerMl: 1.03,
  },
  {
    id: 'egg',
    match: [/jajk/i, /egg/i],
    per100g: { kcal: 140, protein: 12, fat: 10, carbs: 1, sugars: 0, fiber: 0, sodium: 140 },
    aa: { lys: 900, leu: 1100, ile: 700, val: 800, thr: 600, trp: 200, his: 300, sulfur: 600, phe_tyr: 1100 },
    gramsPerPiece: 50,
  },
  {
    id: 'salt',
    match: [/sól|soli/i, /salt/i],
    per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0, sugars: 0, fiber: 0, sodium: 38000 },
    aa: {},
  },
];

// --- parsing ------------------------------------------------------------------

test('splits an ingredient line into amount, unit and food', () => {
  assert.deepEqual(parseIngredientLine('200 g płatków owsianych'), {
    amount: 200,
    unit: 'g',
    food: 'płatków owsianych',
  });
});

test('reads a bare count as an amount with no unit', () => {
  assert.deepEqual(parseIngredientLine('2 jajka'), { amount: 2, unit: null, food: 'jajka' });
});

test('recognises a spoon unit through its declension', () => {
  const parsed = parseIngredientLine('1/4 łyżeczki soli');
  assert.equal(parsed.amount, 0.25);
  assert.equal(parsed.unit, 'łyżeczka');
  assert.equal(parsed.food, 'soli');
});

test('takes the midpoint of a range', () => {
  // "180-190 ml" is one amount for nutrition purposes; the midpoint is the
  // least wrong single value.
  const parsed = parseIngredientLine('180-190 ml mleka');
  assert.equal(parsed.amount, 185);
  assert.equal(parsed.unit, 'ml');
});

test('a line with no amount parses as unquantified', () => {
  assert.deepEqual(parseIngredientLine('wanilia (opcjonalnie)'), {
    amount: null,
    unit: null,
    food: 'wanilia (opcjonalnie)',
  });
});

test('a unit attached to the number still separates', () => {
  assert.deepEqual(parseIngredientLine('500g mąki'), { amount: 500, unit: 'g', food: 'mąki' });
});

// --- grams --------------------------------------------------------------------

const food = (id) => FOODS.find((f) => f.id === id);

test('mass units convert directly', () => {
  assert.equal(gramsFor({ amount: 200, unit: 'g' }, food('flour')), 200);
  assert.equal(gramsFor({ amount: 10, unit: 'dag' }, food('flour')), 100);
  assert.equal(gramsFor({ amount: 2, unit: 'kg' }, food('flour')), 2000);
});

test('volume units need the density of that food', () => {
  assert.equal(gramsFor({ amount: 300, unit: 'ml' }, food('milk')), 309);
  // A food with no density cannot be weighed from a volume.
  assert.equal(gramsFor({ amount: 300, unit: 'ml' }, food('flour')), null);
});

test('spoons and cups resolve through volume', () => {
  // A teaspoon is 5 ml; milk at 1.03 g/ml gives 5.15 g.
  assert.ok(Math.abs(gramsFor({ amount: 1, unit: 'łyżeczka' }, food('milk')) - 5.15) < 1e-9);
});

test('a bare count needs a piece weight', () => {
  assert.equal(gramsFor({ amount: 2, unit: null }, food('egg')), 100);
  assert.equal(gramsFor({ amount: 2, unit: null }, food('flour')), null);
});

test('a pinch is a small fixed weight', () => {
  assert.equal(gramsFor({ amount: 1, unit: 'szczypta' }, food('salt')), 0.3);
});

test('an unquantified line has no weight', () => {
  assert.equal(gramsFor({ amount: null, unit: null }, food('flour')), null);
});

// --- the whole dish -------------------------------------------------------------

const DISH = '100 g mąki\n2 jajka\n100 ml mleka\nwanilia\n1 szczypta soli';

test('sums macros over the matched ingredients', () => {
  const result = analyse(DISH, 1, FOODS);
  // flour 100 g -> 100 kcal, egg 100 g -> 140, milk 103 g -> 61.8
  assert.ok(Math.abs(result.total.kcal - 301.8) < 1e-6);
  assert.ok(Math.abs(result.total.protein - (10 + 12 + 3.09)) < 1e-6);
  assert.ok(Math.abs(result.total.grams - (100 + 100 + 103 + 0.3)) < 1e-6);
});

test('scales linearly with the portion factor', () => {
  const single = analyse(DISH, 1, FOODS);
  const double = analyse(DISH, 2, FOODS);
  assert.ok(Math.abs(double.total.kcal - single.total.kcal * 2) < 1e-6);
  assert.ok(Math.abs(double.total.grams - single.total.grams * 2) < 1e-6);
});

test('the amino acid score is unchanged by the portion factor', () => {
  // Twice as much food is not better protein.
  assert.equal(analyse(DISH, 1, FOODS).score, analyse(DISH, 3, FOODS).score);
});

test('names what it could not count instead of dropping it', () => {
  const result = analyse(DISH, 1, FOODS);
  assert.deepEqual(result.unmatched, ['wanilia']);
  assert.equal(result.matchedCount, 4);
  assert.equal(result.totalCount, 5);
});

test('an ingredient with no matching food is excluded from the totals', () => {
  const withUnknown = analyse(`${DISH}\n999 g kryptonitu`, 1, FOODS);
  const without = analyse(DISH, 1, FOODS);
  assert.equal(withUnknown.total.kcal, without.total.kcal);
  assert.ok(withUnknown.unmatched.includes('999 g kryptonitu'));
});

test('a matched food whose weight is unknown is also reported, not guessed', () => {
  // Flour has no piece weight, so "2 flour" cannot become grams.
  const result = analyse('2 mąki', 1, FOODS);
  assert.equal(result.total.grams, 0);
  assert.deepEqual(result.unmatched, ['2 mąki']);
});

test('reports per-100 g figures alongside the totals', () => {
  const result = analyse(DISH, 1, FOODS);
  const factor = 100 / result.total.grams;
  assert.ok(Math.abs(result.per100g.kcal - result.total.kcal * factor) < 1e-6);
});

test('identifies the limiting amino acid of the dish', () => {
  const result = analyse(DISH, 1, FOODS);
  assert.ok(result.limiting);
  assert.ok(result.score > 0);
  assert.equal(Object.keys(result.ratios).length, 9);
});

test('an empty ingredient list produces no score rather than throwing', () => {
  const result = analyse('', 1, FOODS);
  assert.equal(result.total.kcal, 0);
  assert.equal(result.score, null);
  assert.deepEqual(result.unmatched, []);
});

// --- sugars and salt ------------------------------------------------------------

test('sugars are summed separately from total carbohydrate', () => {
  const result = analyse(DISH, 1, FOODS);
  // flour 100 g -> 1 g sugars, milk 103 g -> 5.15, egg and salt none.
  assert.ok(Math.abs(result.total.sugars - 6.15) < 1e-6);
  assert.ok(result.total.sugars < result.total.carbs, 'sugars are part of carbs, not extra');
});

test('sodium is summed across every ingredient, not just the salt', () => {
  const result = analyse(DISH, 1, FOODS);
  // flour 2 + egg 140 + milk 41.2 + salt 114 mg
  assert.ok(Math.abs(result.total.sodium - (2 + 140 + 41.2 + 114)) < 1e-6);
});

test('salt equivalent is derived from sodium, not from the salt line', () => {
  // Sodium chloride is 39.3% sodium, so salt = sodium x 2.5.
  const result = analyse(DISH, 1, FOODS);
  assert.ok(Math.abs(result.total.saltEquivalent - (result.total.sodium * 2.5) / 1000) < 1e-9);
});

test('salt is reported against the daily maximum', () => {
  const result = analyse(DISH, 1, FOODS);
  assert.equal(DAILY_SALT_MAX_G, 5);
  assert.ok(
    Math.abs(result.saltFractionOfDailyMax - result.total.saltEquivalent / DAILY_SALT_MAX_G) < 1e-9,
  );
});

test('salt scales with the portion factor, since the daily share depends on how much you eat', () => {
  const half = analyse(DISH, 0.5, FOODS);
  const full = analyse(DISH, 1, FOODS);
  assert.ok(Math.abs(half.saltFractionOfDailyMax - full.saltFractionOfDailyMax / 2) < 1e-9);
});

test('a food missing a field is named rather than counted as zero', () => {
  const partial = [
    ...FOODS,
    {
      id: 'mystery',
      match: [/mystery/i],
      per100g: { kcal: 10, protein: 1, fat: 0, carbs: 2 }, // no sugars, no sodium
      aa: {},
    },
  ];
  const result = analyse('100 g mystery', 1, partial);
  assert.deepEqual(result.incomplete.sugars, ['mystery']);
  assert.deepEqual(result.incomplete.sodium, ['mystery']);
  assert.equal(result.total.kcal, 10, 'the fields it does have are still counted');
});

test('nothing is flagged incomplete when every food carries every field', () => {
  const result = analyse(DISH, 1, FOODS);
  assert.deepEqual(result.incomplete, { sugars: [], fiber: [], sodium: [], aminoAcids: [] });
});

// --- protein that has no amino acid breakdown -----------------------------------

/// USDA has macros but no amino acids for some foods (kefir, dark chocolate).
const NO_AA = {
  id: 'chocolate',
  match: [/czekolad/i],
  per100g: { kcal: 600, protein: 8, fat: 43, carbs: 46, sugars: 24, fiber: 11, sodium: 20 },
  aa: {},
};

test('protein with no amino acid data does not depress the score', () => {
  // Dividing total amino acids by total protein would count this protein in
  // the denominator with nothing in the numerator, reporting the dish as
  // worse than the data supports.
  const withChocolate = analyse('100 g mąki\n100 g czekolady', 1, [...FOODS, NO_AA]);
  const withoutChocolate = analyse('100 g mąki', 1, [...FOODS, NO_AA]);
  assert.ok(Math.abs(withChocolate.score - withoutChocolate.score) < 1e-9);
});

test('the protein that was scored is reported alongside the total', () => {
  const result = analyse('100 g mąki\n100 g czekolady', 1, [...FOODS, NO_AA]);
  assert.equal(result.total.protein, 18, 'the dish really does contain 18 g');
  assert.equal(result.proteinScored, 10, 'but only the flour protein could be scored');
});

test('a food with unscoreable protein is named', () => {
  const result = analyse('100 g mąki\n100 g czekolady', 1, [...FOODS, NO_AA]);
  assert.deepEqual(result.incomplete.aminoAcids, ['chocolate']);
});

test('a food with no protein at all is not flagged for missing amino acids', () => {
  // Sugar has neither; there is nothing unaccounted for.
  const sugar = { id: 'sugar', match: [/cukier/i], per100g: { kcal: 400, protein: 0, fat: 0, carbs: 100, sugars: 100, sodium: 0 }, aa: {} };
  const result = analyse('100 g cukier', 1, [...FOODS, sugar]);
  assert.deepEqual(result.incomplete.aminoAcids, []);
});

// --- a unit with no number --------------------------------------------------

test('a leading unit with no number means one of it', () => {
  // "szczypta soli" and "łyżka miodu" are how people actually write these;
  // requiring "1 szczypta" would leave them uncounted.
  assert.deepEqual(parseIngredientLine('szczypta soli'), {
    amount: 1,
    unit: 'szczypta',
    food: 'soli',
  });
  assert.deepEqual(parseIngredientLine('łyżka miodu'), { amount: 1, unit: 'łyżka', food: 'miodu' });
});

test('a line that merely starts with a word is still unquantified', () => {
  assert.equal(parseIngredientLine('wanilia (opcjonalnie)').amount, null);
  assert.equal(parseIngredientLine('sól do smaku').amount, null);
});

// --- energy split ---------------------------------------------------------------

test('energy shares use the Atwater factors', () => {
  // protein 4 kcal/g, fat 9, carbohydrate 4
  const shares = energyShares({ protein: 10, fat: 10, carbs: 10 });
  const total = 40 + 90 + 40;
  assert.ok(Math.abs(shares.protein - 40 / total) < 1e-9);
  assert.ok(Math.abs(shares.fat - 90 / total) < 1e-9);
  assert.ok(Math.abs(shares.carbs - 40 / total) < 1e-9);
});

test('energy shares sum to one', () => {
  const shares = energyShares({ protein: 51.4, fat: 49.4, carbs: 177 });
  const sum = shares.protein + shares.fat + shares.carbs;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('fat dominates the split despite weighing less', () => {
  // 49 g of fat carries more energy than 51 g of protein — the point of
  // showing shares rather than grams.
  const shares = energyShares({ protein: 51.4, fat: 49.4, carbs: 177 });
  assert.ok(shares.fat > shares.protein);
});

test('a dish with no macros yields zero shares rather than NaN', () => {
  assert.deepEqual(energyShares({ protein: 0, fat: 0, carbs: 0 }), {
    protein: 0,
    fat: 0,
    carbs: 0,
    sugars: 0,
  });
});

// --- fibre ----------------------------------------------------------------------

const FIBROUS = [
  {
    id: 'oats',
    match: [/owsian|oats/i],
    per100g: { kcal: 389, protein: 17, fat: 7, carbs: 66, sugars: 1, fiber: 10, sodium: 2 },
    aa: { lys: 700, leu: 1280, ile: 690, val: 930, thr: 570, trp: 230, his: 400, sulfur: 720, phe_tyr: 1470 },
  },
];

test('fibre is summed and reported', () => {
  const result = analyse('100 g oats', 1, FIBROUS);
  assert.equal(result.total.fiber, 10);
});

test('fibre is part of the carbohydrate figure, not additional to it', () => {
  // USDA carbohydrate is "by difference", which already contains the fibre.
  const result = analyse('100 g oats', 1, FIBROUS);
  assert.ok(result.total.fiber < result.total.carbs);
});

test('fibre is counted against a daily reference like salt is', () => {
  const result = analyse('100 g oats', 1, FIBROUS);
  assert.equal(DAILY_FIBER_G, 25);
  assert.ok(Math.abs(result.fiberFractionOfDaily - 10 / 25) < 1e-9);
});

test('a food with no fibre figure is named rather than counted as zero', () => {
  const noFiber = [
    { id: 'mystery', match: [/mystery/i], per100g: { kcal: 10, protein: 1, fat: 0, carbs: 2 }, aa: {} },
  ];
  assert.deepEqual(analyse('100 g mystery', 1, noFiber).incomplete.fiber, ['mystery']);
});

test('energy shares charge fibre at 2 kcal per gram, not 4', () => {
  // Atwater's 4 kcal/g applies to available carbohydrate; fibre yields about
  // half that, so counting it at 4 overstates the carb share.
  const withFiber = energyShares({ protein: 0, fat: 0, carbs: 100, fiber: 100 });
  const withoutFiber = energyShares({ protein: 0, fat: 0, carbs: 100, fiber: 0 });
  // Both are all-carb, so shares are 100% either way; compare against protein.
  const mixed = energyShares({ protein: 50, fat: 0, carbs: 100, fiber: 100 });
  const mixedNoFiber = energyShares({ protein: 50, fat: 0, carbs: 100, fiber: 0 });
  assert.equal(withFiber.carbs, 1);
  assert.equal(withoutFiber.carbs, 1);
  assert.ok(
    mixed.protein > mixedNoFiber.protein,
    'all-fibre carbohydrate should carry less energy, raising protein’s share',
  );
});

test('energy shares treat missing fibre as none', () => {
  const shares = energyShares({ protein: 10, fat: 10, carbs: 10 });
  assert.ok(Math.abs(shares.protein + shares.fat + shares.carbs - 1) < 1e-9);
});

// --- sugars as a share of energy -------------------------------------------------

test('sugars carry their own share of energy', () => {
  // Sugars are available carbohydrate, so 4 kcal/g.
  const shares = energyShares({ protein: 0, fat: 0, carbs: 100, sugars: 25 });
  assert.ok(Math.abs(shares.sugars - 0.25) < 1e-9);
});

test('the sugar share is part of the carbohydrate share, not additional', () => {
  const shares = energyShares({ protein: 10, fat: 10, carbs: 100, sugars: 40 });
  assert.ok(shares.sugars < shares.carbs);
  assert.ok(Math.abs(shares.protein + shares.fat + shares.carbs - 1) < 1e-9);
});

test('sugars beyond the carbohydrate figure cannot exceed it', () => {
  // Defensive: a table error must not produce a share above the carb share.
  const shares = energyShares({ protein: 0, fat: 0, carbs: 10, sugars: 999 });
  assert.ok(shares.sugars <= shares.carbs);
});

test('no sugars means a zero share, not NaN', () => {
  assert.equal(energyShares({ protein: 1, fat: 1, carbs: 1 }).sugars, 0);
  assert.equal(energyShares({ protein: 0, fat: 0, carbs: 0 }).sugars, 0);
});

// --- dividing a batch into servings ---------------------------------------------

const BATCH = () => analyse('1000 g mąki\n10 jajka\n1 szczypta soli', 1, FOODS);

test('per-serving grams are the batch divided', () => {
  const one = BATCH();
  const ten = perServing(one, 10);
  assert.ok(Math.abs(ten.total.fiber - one.total.fiber / 10) < 1e-9);
  assert.ok(Math.abs(ten.total.kcal - one.total.kcal / 10) < 1e-9);
});

test('every daily-reference fraction is divided too', () => {
  // The fibre percentage was left at the batch value while its grams were
  // divided, so the panel read "8.2 g · 327% of 25 g/day".
  const one = BATCH();
  const ten = perServing(one, 10);
  for (const key of Object.keys(dailyFractions(one.total))) {
    assert.ok(
      Math.abs(ten[key] - one[key] / 10) < 1e-9,
      `${key}: expected ${one[key] / 10}, got ${ten[key]}`,
    );
  }
});

test('a daily fraction always matches the grams shown beside it', () => {
  // The invariant the bug broke: whatever total is displayed, its percentage
  // is that total over the reference.
  const ten = perServing(BATCH(), 10);
  assert.ok(Math.abs(ten.fiberFractionOfDaily - ten.total.fiber / DAILY_FIBER_G) < 1e-9);
  assert.ok(
    Math.abs(ten.saltFractionOfDailyMax - ten.total.saltEquivalent / DAILY_SALT_MAX_G) < 1e-9,
  );
});

test('intensive figures are not divided', () => {
  // Per-100 g and the amino acid ratios do not depend on how the batch is cut.
  const one = BATCH();
  const ten = perServing(one, 10);
  assert.deepEqual(ten.per100g, one.per100g);
  assert.deepEqual(ten.ratios, one.ratios);
  assert.equal(ten.score, one.score);
});

test('one serving leaves the batch untouched', () => {
  const one = BATCH();
  assert.deepEqual(perServing(one, 1).total, one.total);
});

test('a junk serving count is treated as one', () => {
  const one = BATCH();
  for (const bad of [0, -2, NaN, undefined, 0.4]) {
    assert.deepEqual(perServing(one, bad).total, one.total, `servings: ${bad}`);
  }
});
