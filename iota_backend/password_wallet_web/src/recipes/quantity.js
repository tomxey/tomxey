// Quantity primitives shared by portion scaling and nutrition: how a number
// is written in a recipe, and how to read or re-render it.

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;

/// A quantity: mixed number ("1 1/2"), fraction ("1/2"), or plain number.
export const QUANTITY = String.raw`(?:${NUMBER}\s+\d+\/\d+|\d+\/\d+|${NUMBER})`;

/// Parse "1 1/2", "1/2", "0,5" or "500" into a number.
export function readQuantity(text) {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  return Number(text.replace(',', '.'));
}

/// The decimal separator a source number used, for round-tripping.
export function separatorOf(text) {
  return text.includes(',') ? ',' : '.';
}

/// Round by magnitude, so scaling never produces a wall of decimals:
/// 100 and above is whole, 10 and above one decimal, below that two.
///
/// `separator` keeps the author's convention: a recipe written with "0,5"
/// should not come back as "0.75". Sources without a decimal point default
/// to a dot.
export function formatQuantity(value, separator = '.') {
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const rounded = String(Number(value.toFixed(decimals)));
  return separator === ',' ? rounded.replace('.', ',') : rounded;
}
