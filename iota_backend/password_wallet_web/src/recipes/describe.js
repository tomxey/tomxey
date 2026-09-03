// Turning a Recipe's before/after contents into history lines.
//
// Edits report magnitude, not a diff: `lineDelta` is a multiset comparison,
// which is enough for "+12 −3" without carrying an LCS implementation.
import { ingredientsOf, lineDelta, parseIngredients, titleOf } from './content.js';

const countLines = (md) => String(md ?? '').split('\n').length;
const countIngredients = (content) => parseIngredients(ingredientsOf(content)).length;

export function describeRecipe({ change, before, after }) {
  if (change === 'created') {
    if (!after) return ['＋ created a recipe'];
    const ingredients = countIngredients(after);
    const withIngredients = ingredients ? `, ${ingredients} ingredient(s)` : '';
    return [`＋ created «${titleOf(after)}» (${countLines(after.md)} lines${withIngredients})`];
  }
  if (change === 'deleted') {
    return [before ? `✕ deleted «${titleOf(before)}»` : '✕ deleted a recipe'];
  }
  if (!before || !after) return ['✎ edited a recipe (details no longer available)'];

  const lines = [];
  // A rename is always also an edit, since the title is derived from the
  // body — so report both, rather than hiding one behind the other.
  if (titleOf(before) !== titleOf(after)) {
    lines.push(`renamed «${titleOf(before)}» → «${titleOf(after)}»`);
  }

  // Ingredients and body are separate fields, so an edit to either is
  // reported on its own terms rather than as one undifferentiated delta.
  const ingredients = lineDelta(ingredientsOf(before), ingredientsOf(after));
  if (ingredients.added || ingredients.removed) {
    lines.push(
      `🥕 ingredients of «${titleOf(after)}» (+${ingredients.added} −${ingredients.removed})`,
    );
  }

  const body = lineDelta(before.md, after.md);
  if (body.added || body.removed) {
    lines.push(`✎ edited «${titleOf(after)}» (+${body.added} −${body.removed} lines)`);
  }

  if (!lines.length) lines.push(`touched «${titleOf(after)}» (no visible change)`);
  return lines;
}
