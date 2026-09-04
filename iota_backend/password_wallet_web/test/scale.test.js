// Portion scaling. The governing asymmetry: wrongly scaling a temperature or
// a time ruins the dish, while missing a quantity in the method costs nothing
// (the amounts that matter live in the ingredients list). So the body rule is
// an allow-list of quantity units, and everything else is left alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatQuantity } from '../src/recipes/quantity.js';
import { scaleLine, scaleSegments, scaledIngredientLines } from '../src/recipes/scale.js';

/// Segments joined back into plain text — what the copy path writes.
const flat = (segments) => segments.map((s) => s.text).join('');
/// Only the highlighted parts, i.e. what the parser claims is a quantity.
const marked = (segments) => segments.filter((s) => s.scaled).map((s) => s.text);

// --- rounding ---------------------------------------------------------------

test('rounds to a whole number at or above 100', () => {
  assert.equal(formatQuantity(150), '150');
  assert.equal(formatQuantity(149.6), '150');
});

test('rounds to one decimal between 10 and 100', () => {
  assert.equal(formatQuantity(52.54), '52.5');
});

test('rounds to two decimals below 10', () => {
  assert.equal(formatQuantity(0.666), '0.67');
  assert.equal(formatQuantity(1.5), '1.5');
});

test('strips trailing zeros', () => {
  assert.equal(formatQuantity(2.0), '2');
  assert.equal(formatQuantity(2.5), '2.5');
  assert.equal(formatQuantity(150.0), '150');
});

// --- the body: things that must NOT scale ------------------------------------

test('does not scale a time', () => {
  assert.equal(flat(scaleSegments('Rest for 30 minutes.', 2)), 'Rest for 30 minutes.');
  assert.equal(flat(scaleSegments('Bake 25 min.', 2)), 'Bake 25 min.');
});

test('does not scale a temperature', () => {
  assert.equal(flat(scaleSegments('Bake at 180°C.', 2)), 'Bake at 180°C.');
  assert.equal(flat(scaleSegments('Heat to 350°F.', 2)), 'Heat to 350°F.');
});

test('does not scale a tin or pan size', () => {
  assert.equal(flat(scaleSegments('Use a 24cm tin.', 2)), 'Use a 24cm tin.');
});

test('does not scale a bare number with no unit', () => {
  assert.equal(flat(scaleSegments('Add 3 eggs.', 2)), 'Add 3 eggs.');
});

test('marks nothing when nothing is scalable', () => {
  assert.deepEqual(marked(scaleSegments('Bake at 180°C for 30 min.', 2)), []);
});

// --- the body: things that must scale ----------------------------------------

test('scales a number followed by a mass or volume unit', () => {
  assert.equal(
    flat(scaleSegments('Mix 500g flour with 250ml water.', 2)),
    'Mix 1000g flour with 500ml water.',
  );
});

test('highlights exactly the scaled quantities', () => {
  assert.deepEqual(marked(scaleSegments('Mix 500g flour with 250ml water.', 2)), ['1000g', '500ml']);
});

test('scales English spoon and cup units', () => {
  assert.equal(flat(scaleSegments('Add 2 tbsp sugar and 1 cup milk.', 2)), 'Add 4 tbsp sugar and 2 cup milk.');
});

test('scales Polish units across declensions', () => {
  assert.equal(flat(scaleSegments('Dodaj 2 łyżki cukru.', 2)), 'Dodaj 4 łyżki cukru.');
  assert.equal(flat(scaleSegments('1 łyżeczka soli.', 3)), '3 łyżeczka soli.');
  assert.equal(flat(scaleSegments('2 szklanki mąki.', 1.5)), '3 szklanki mąki.');
  assert.equal(flat(scaleSegments('1 szczypta soli.', 2)), '2 szczypta soli.');
  assert.equal(flat(scaleSegments('10 dag masła.', 2)), '20 dag masła.');
});

test('accepts a comma as the decimal separator', () => {
  assert.equal(flat(scaleSegments('0,5 szklanki mleka.', 2)), '1 szklanki mleka.');
});

test('keeps the decimal separator the author used', () => {
  // Writing "0,5" and getting "0.75" back switches convention mid-recipe.
  assert.equal(flat(scaleSegments('0,5 szklanki mleka.', 1.5)), '0,75 szklanki mleka.');
  assert.equal(flat(scaleSegments('0.5 cup milk.', 1.5)), '0.75 cup milk.');
});

test('a whole-number source defaults to a dot when it scales to a decimal', () => {
  assert.equal(flat(scaleLine('1 łyżeczka soli', 1.5)), '1.5 łyżeczka soli');
});

test('a space between number and unit is optional', () => {
  assert.equal(flat(scaleSegments('500 g flour', 2)), '1000 g flour');
});

// --- explicit {} override -----------------------------------------------------

test('braces force a bare number to scale', () => {
  assert.equal(flat(scaleSegments('Add {3} eggs.', 2)), 'Add 6 eggs.');
  assert.deepEqual(marked(scaleSegments('Add {3} eggs.', 2)), ['6']);
});

test('braces are stripped even at scale 1', () => {
  // Otherwise the markup would be visible in every unscaled recipe.
  assert.equal(flat(scaleSegments('Add {3} eggs.', 1)), 'Add 3 eggs.');
});

test('quantities are highlighted at scale 1 too', () => {
  // The highlight doubles as a parser check: it must show what was recognised
  // even when nothing changes.
  assert.deepEqual(marked(scaleSegments('Mix 500g flour.', 1)), ['500g']);
});

// --- ingredient lines ---------------------------------------------------------

test('scales the leading quantity of an ingredient line', () => {
  assert.equal(flat(scaleLine('500g flour', 2)), '1000g flour');
  assert.equal(flat(scaleLine('2 large eggs', 2)), '4 large eggs');
});

test('scales a bare leading count, unlike in the body', () => {
  assert.deepEqual(marked(scaleLine('3 eggs', 2)), ['6']);
});

test('scales a fraction', () => {
  assert.equal(flat(scaleLine('1/2 tsp salt', 2)), '1 tsp salt');
});

// --- at ×1, quantities are shown exactly as written -------------------------

test('a fraction keeps its written form at scale 1', () => {
  // Rewriting "1/4" as "0.25" when nothing has changed edits the author's
  // text for no reason.
  assert.equal(flat(scaleLine('1/4 łyżeczki soli', 1)), '1/4 łyżeczki soli');
  assert.deepEqual(marked(scaleLine('1/4 łyżeczki soli', 1)), ['1/4']);
});

test('a mixed number and a comma decimal keep their form at scale 1', () => {
  assert.equal(flat(scaleLine('1 1/2 cup milk', 1)), '1 1/2 cup milk');
  assert.equal(flat(scaleSegments('0,5 szklanki mleka', 1)), '0,5 szklanki mleka');
});

test('a range keeps its written form at scale 1', () => {
  assert.equal(flat(scaleLine('180-190 ml mleka', 1)), '180-190 ml mleka');
});

test('scaling away from 1 still normalises to a decimal', () => {
  assert.equal(flat(scaleLine('1/4 łyżeczki soli', 2)), '0.5 łyżeczki soli');
});

// --- ranges in the method body ----------------------------------------------

test('scales both ends of a range in the body', () => {
  assert.equal(
    flat(scaleSegments('wmieszaj 50-80 g czekolady', 2)),
    'wmieszaj 100-160 g czekolady',
  );
});

test('highlights a body range as one quantity', () => {
  assert.deepEqual(marked(scaleSegments('wmieszaj 50-80 g czekolady', 2)), ['100-160 g']);
});

test('leaves a range alone when its unit is not a quantity', () => {
  // Rolling thickness and oven temperature must survive untouched.
  assert.equal(flat(scaleSegments('Wałkuj na 4-6 mm', 2)), 'Wałkuj na 4-6 mm');
  assert.equal(flat(scaleSegments('Piecz w 180-190°C', 2)), 'Piecz w 180-190°C');
});

test('scales a mixed number', () => {
  assert.equal(flat(scaleLine('1 1/2 cup milk', 2)), '3 cup milk');
});

test('scales both ends of a range', () => {
  assert.equal(flat(scaleLine('2-3 apples', 2)), '4-6 apples');
});

test('leaves a line with no leading number alone', () => {
  assert.equal(flat(scaleLine('salt to taste', 2)), 'salt to taste');
  assert.deepEqual(marked(scaleLine('salt to taste', 2)), []);
});

test('does not scale a leading number followed by a time unit', () => {
  assert.equal(flat(scaleLine('30 min marinating', 2)), '30 min marinating');
});

test('only the leading quantity of an ingredient line scales', () => {
  // A trailing note must not be multiplied along with the amount.
  assert.equal(flat(scaleLine('2 eggs (180°C oven)', 2)), '4 eggs (180°C oven)');
});

// --- the copy path ------------------------------------------------------------

test('produces scaled plain lines for copying into a todo item', () => {
  const text = '500g flour\n- 2 large eggs\n\nsalt to taste';
  assert.deepEqual(scaledIngredientLines(text, 2), ['1000g flour', '4 large eggs', 'salt to taste']);
});

test('copying at scale 1 matches the parsed ingredient list', () => {
  assert.deepEqual(scaledIngredientLines('500g flour\n2 eggs', 1), ['500g flour', '2 eggs']);
});

test('a fractional scale produces readable amounts', () => {
  assert.deepEqual(scaledIngredientLines('500g flour\n2 eggs\n1 szczypta soli', 0.3), [
    '150g flour',
    '0.6 eggs',
    '0.3 szczypta soli',
  ]);
});

// --- guard rails --------------------------------------------------------------

test('a non-positive or junk factor behaves as 1', () => {
  assert.equal(flat(scaleSegments('Mix 500g flour.', 0)), 'Mix 500g flour.');
  assert.equal(flat(scaleSegments('Mix 500g flour.', -2)), 'Mix 500g flour.');
  assert.equal(flat(scaleSegments('Mix 500g flour.', NaN)), 'Mix 500g flour.');
  assert.equal(flat(scaleSegments('Mix 500g flour.', undefined)), 'Mix 500g flour.');
});

test('adjacent unscaled text stays in one segment', () => {
  const segments = scaleSegments('Bake at 180°C for 30 min.', 2);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].scaled, false);
});
