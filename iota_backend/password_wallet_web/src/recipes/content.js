// The recipe content schema — the plaintext shape that gets encrypted into a
// Recipe object's `data`. Kept free of chain and DOM imports so it is
// testable on its own.
//
// v2 splits ingredients out of the markdown body into their own plain-text
// field, so they can be copied into the todo list one line at a time. v3 adds
// how many servings the batch makes, which the nutrition panel divides by —
// a recipe is a tray of waffles, not a plate.
//
// Older recipes still open. A missing ingredients field reads as empty and a
// missing serving count reads as one; the recipe is written at the current
// version the next time it is saved.

export const RECIPE_FORMAT_VERSION = 3;

const HEADING = /^\s{0,3}#{1,3}\s+(.*)$/;

/// A leading list bullet, so pasting a markdown-style ingredient list works.
/// A bullet must be followed by whitespace *or be the whole line* — the line
/// is trimmed before this runs, so a lone "- " arrives here as "-" and would
/// otherwise survive as an ingredient literally named "-". Dashes inside the
/// text ("sugar-free", "1-2 apples") never match.
const BULLET = /^[-*](\s+|$)/;

export function newRecipeContent({ servings = 1, ingredients = '', md = '' } = {}) {
  return { v: RECIPE_FORMAT_VERSION, servings: servingsOf({ servings }), ingredients, md };
}

/// How many servings the batch makes. Always a whole number of at least one:
/// zero would divide the nutrition panel by zero, and a fraction of a serving
/// is not a thing anyone means.
export function servingsOf(content) {
  const value = Math.floor(Number(content?.servings));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/// The ingredients text of a recipe, defaulting to empty for v1 recipes
/// written before the field existed.
export function ingredientsOf(content) {
  return content?.ingredients ?? '';
}

/// Ingredients text -> one entry per non-empty line, bullets stripped. This
/// is the exact list that gets copied into a todo item as subitems, so it
/// stays deliberately literal: no markdown, no splitting on commas.
export function parseIngredients(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim().replace(BULLET, '').trim())
    .filter((line) => line.length > 0);
}

/// The displayed name of a recipe. Derived rather than stored, so renaming is
/// just editing the heading and the two can never disagree. Any heading level
/// counts — deriving from `#`/`##` alone would show a `###`-opening recipe as
/// the literal "### Foo". Only the body is considered: ingredients are not
/// part of a recipe's identity.
export function titleOf(content) {
  const lines = String(content?.md ?? '').split('\n');

  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) return heading[1].trim();
  }
  for (const line of lines) {
    if (line.trim()) return line.trim();
  }
  return 'untitled';
}

/// The body with its opening heading removed, because the detail view
/// already shows that heading as the recipe's title — rendering it again
/// would print the name twice.
///
/// Only a heading that *opens* the body is dropped. If the title fell back to
/// a plain first line, removing it would delete content; and a heading that
/// appears after prose is a section header the author wants to see.
export function bodyBelowTitle(content) {
  const md = String(content?.md ?? '');
  const lines = md.split('\n');

  const first = lines.findIndex((line) => line.trim());
  if (first === -1 || !HEADING.test(lines[first])) return md;

  return lines
    .slice(first + 1)
    .join('\n')
    .replace(/^\n+/, '');
}

/// Entries (`{ref, content}`) ordered by derived title — numeric-aware, so
/// "2. x" sorts before "10. x", matching the todo list's ordering. Returns a
/// new array: the caller's own order is its business.
export function sortedByTitle(entries) {
  return [...entries].sort((a, b) =>
    titleOf(a.content).localeCompare(titleOf(b.content), undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

/// Added/removed line counts between two revisions, as a multiset
/// difference. Deliberately not a diff: history only reports magnitude, and
/// this avoids carrying an LCS implementation.
export function lineDelta(before, after) {
  const counts = new Map();
  for (const line of String(before ?? '').split('\n')) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  let added = 0;
  for (const line of String(after ?? '').split('\n')) {
    const remaining = counts.get(line) ?? 0;
    if (remaining > 0) counts.set(line, remaining - 1);
    else added += 1;
  }

  let removed = 0;
  for (const remaining of counts.values()) removed += remaining;

  return { added, removed };
}
