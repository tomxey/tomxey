// Portion scaling, for display and for the todo copy. Nothing here changes
// what is stored on chain — a recipe is always written at one portion.
//
// The rules differ between the two fields on purpose:
//
//   body        an allow-list of quantity units. A bare number never scales,
//               so "30 min", "180°C", "24cm tin" and step numbers survive.
//   ingredients the leading number of a line scales even without a unit,
//               because an ingredient line *is* a quantity.
//
// Wrongly scaling a temperature ruins a dish; missing a quantity in the
// method costs nothing, since the amounts that matter are in the ingredients
// list. So the body rule is deliberately biased toward doing nothing.

import { parseIngredients } from './content.js';
import { QUANTITY, formatQuantity, readQuantity, separatorOf } from './quantity.js';

/// Units that mean "quantity". Stems, so Polish declensions (łyżka/łyżki/
/// łyżek) and English plurals all match without listing every form.
const UNIT_STEMS = [
  'gram',
  'kilogram',
  'litr',
  'mililitr',
  'łyżeczk',
  'łyżk',
  'szklank',
  'szczypt',
  'tbsp',
  'tsp',
  'cup',
  'ounce',
  'pound',
];

/// Unit symbols, which must not be followed by more letters — otherwise "g"
/// would match the "g" of "garlic".
const UNIT_SYMBOLS = ['kg', 'mg', 'dag', 'dkg', 'ml', 'dl', 'cl', 'oz', 'lbs', 'lb', 'g', 'l'];

/// Units that mark a number as *not* a quantity. Only needed for ingredient
/// lines, where a bare leading number would otherwise scale; the body's
/// allow-list already ignores everything unlisted.
const NON_QUANTITY = ['min', 'minut', 'godz', 'hour', 'h', '°c', '°f'];


const UNIT = `(?:(?:${UNIT_STEMS.join('|')})[\\p{L}]*|(?:${UNIT_SYMBOLS.join('|')})(?![\\p{L}]))`;

/// Body rule: a quantity — optionally a range — immediately followed by a
/// unit, or a braced number. Without the range, "50-80 g" would scale only
/// its second half.
const BODY = new RegExp(
  `\\{(${QUANTITY})\\}|(${QUANTITY})(?:(\\s*[-–]\\s*)(${QUANTITY}))?(\\s*)(${UNIT})`,
  'giu',
);

/// Ingredient rule: the leading quantity of the line, optionally a range.
const LEADING = new RegExp(`^(${QUANTITY})(\\s*[-–]\\s*(${QUANTITY}))?`, 'iu');

const BRACED = new RegExp(`\\{(${QUANTITY})\\}`, 'giu');

/// One quantity as it should appear at this scale. At ×1 the author's own
/// text is kept — "1/4" stays a quarter and "0,5" keeps its comma, because
/// nothing has changed and rewriting it would just edit their recipe.
function renderQuantity(text, multiplier) {
  if (multiplier === 1) return text;
  return formatQuantity(readQuantity(text) * multiplier, separatorOf(text));
}

/// A factor of 1 still runs, so braces are stripped and quantities are
/// highlighted — the highlight is how you check the parser got it right.
function safeFactor(factor) {
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

/// Accumulates `{text, scaled}` segments, merging adjacent plain text so
/// callers can rely on the segment list being minimal.
function makeSegments() {
  const segments = [];
  return {
    plain(text) {
      if (!text) return;
      const last = segments[segments.length - 1];
      if (last && !last.scaled) last.text += text;
      else segments.push({ text, scaled: false });
    },
    quantity(text) {
      segments.push({ text, scaled: true });
    },
    done: () => segments,
  };
}

/// Body text -> segments. Only quantities carrying a known unit, and numbers
/// the author braced explicitly, are scaled.
export function scaleSegments(text, factor) {
  const multiplier = safeFactor(factor);
  const source = String(text ?? '');
  const out = makeSegments();
  let cursor = 0;

  const pattern = new RegExp(BODY.source, BODY.flags);
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [whole, braced, from, dash, to, gap, unit] = match;
    out.plain(source.slice(cursor, match.index));

    if (braced !== undefined) {
      out.quantity(renderQuantity(braced, multiplier));
    } else {
      const amount =
        to === undefined
          ? renderQuantity(from, multiplier)
          : `${renderQuantity(from, multiplier)}${dash}${renderQuantity(to, multiplier)}`;
      out.quantity(`${amount}${gap}${unit}`);
    }
    cursor = match.index + whole.length;
  }

  out.plain(source.slice(cursor));
  return out.done();
}

/// One ingredient line -> segments. The leading quantity scales even without
/// a unit; a range scales at both ends. Anything after it is left alone, so a
/// trailing "(180°C oven)" is not multiplied.
export function scaleLine(line, factor) {
  const multiplier = safeFactor(factor);
  const source = String(line ?? '');
  const out = makeSegments();

  const leading = LEADING.exec(source);
  if (!leading || startsWithNonQuantity(source, leading[0].length)) {
    // No leading amount (or it counts minutes, not grams) — only braces apply.
    return scaleBraced(source, multiplier);
  }

  const [whole, from, , to] = leading;
  const scaledFrom = renderQuantity(from, multiplier);
  out.quantity(
    to === undefined
      ? scaledFrom
      : `${scaledFrom}${whole.slice(from.length, whole.length - to.length)}${renderQuantity(to, multiplier)}`,
  );

  for (const segment of scaleBraced(source.slice(whole.length), multiplier)) {
    if (segment.scaled) out.quantity(segment.text);
    else out.plain(segment.text);
  }
  return out.done();
}

/// True when the text right after a leading number names a time or a
/// temperature rather than an amount.
function startsWithNonQuantity(source, offset) {
  const rest = source.slice(offset).trimStart().toLowerCase();
  return NON_QUANTITY.some(
    (unit) => rest.startsWith(unit) && !/^\p{L}/u.test(rest.slice(unit.length)),
  );
}

/// Only the explicit `{n}` marks, used for the remainder of an ingredient
/// line and for lines with no leading amount.
function scaleBraced(text, multiplier) {
  const out = makeSegments();
  let cursor = 0;

  const pattern = new RegExp(BRACED.source, BRACED.flags);
  let match;
  while ((match = pattern.exec(text)) !== null) {
    out.plain(text.slice(cursor, match.index));
    out.quantity(renderQuantity(match[1], multiplier));
    cursor = match.index + match[0].length;
  }
  out.plain(text.slice(cursor));
  return out.done();
}

/// The ingredient list as plain scaled lines — what gets copied into a todo
/// item, and what the picker counts.
export function scaledIngredientLines(text, factor) {
  return parseIngredients(text).map((line) =>
    scaleLine(line, factor)
      .map((segment) => segment.text)
      .join(''),
  );
}
