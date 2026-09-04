// Macros and protein quality for a dish, computed from its ingredient lines.
//
// Everything here runs locally on already-decrypted text. There is no
// nutrition API call, deliberately: sending "500 g mąki orkiszowej, 2 jajka"
// to a third party on every recipe view would undo the property the rest of
// the app is built on.
//
// The governing rule is the same as the scaler's: never present a total that
// silently omits something. Anything unrecognised, or recognised but
// unweighable, is returned in `unmatched` for the UI to name.

import { parseIngredients } from '../recipes/content.js';
import { QUANTITY, readQuantity } from '../recipes/quantity.js';
import { scoreAminoAcids } from './aminoAcids.js';

/// How each unit becomes grams. Mass converts directly; volume needs the
/// food's density; a bare count needs its piece weight.
const UNITS = [
  { canonical: 'g', match: /^g\b/i, grams: 1 },
  { canonical: 'dag', match: /^d[ak]g\b/i, grams: 10 },
  { canonical: 'kg', match: /^kg\b/i, grams: 1000 },
  { canonical: 'mg', match: /^mg\b/i, grams: 0.001 },

  { canonical: 'ml', match: /^ml\b/i, ml: 1 },
  { canonical: 'l', match: /^l\b/i, ml: 1000 },
  { canonical: 'dl', match: /^dl\b/i, ml: 100 },

  { canonical: 'łyżeczka', match: /^(łyżeczk|tsp)\p{L}*/iu, ml: 5 },
  { canonical: 'łyżka', match: /^(łyżk|tbsp)\p{L}*/iu, ml: 15 },
  { canonical: 'szklanka', match: /^(szklank|cup)\p{L}*/iu, ml: 250 },

  // A pinch is not really a unit, but it is a weight people write down.
  { canonical: 'szczypta', match: /^szczypt\p{L}*/iu, grams: 0.3 },
];

const LEADING = new RegExp(`^(${QUANTITY})(?:\\s*[-–]\\s*(${QUANTITY}))?\\s*`, 'iu');

/// One ingredient line -> `{amount, unit, food}`. `amount` is null when the
/// line names no quantity ("wanilia"), `unit` is null for a bare count.
///
/// A range collapses to its midpoint: "180-190 ml" is a single amount here,
/// and the midpoint is the least wrong choice of one.
export function parseIngredientLine(line) {
  const text = String(line ?? '').trim();
  const leading = LEADING.exec(text);

  if (!leading) {
    // "szczypta soli", "łyżka miodu" — a unit with no number means one of it,
    // which is how people write these. Without this they stay uncounted.
    const bare = matchUnit(text);
    if (bare) return { amount: 1, unit: bare.unit, food: bare.rest };
    return { amount: null, unit: null, food: text };
  }

  const [whole, from, to] = leading;
  const amount =
    to === undefined ? readQuantity(from) : (readQuantity(from) + readQuantity(to)) / 2;

  const rest = text.slice(whole.length);
  const hit = matchUnit(rest);
  return hit ? { amount, unit: hit.unit, food: hit.rest } : { amount, unit: null, food: rest.trim() };
}

function matchUnit(text) {
  for (const unit of UNITS) {
    const hit = unit.match.exec(text);
    if (hit) return { unit: unit.canonical, rest: text.slice(hit[0].length).trim() };
  }
  return null;
}

/// Weight in grams of a parsed line of a given food, or null when it cannot
/// be determined — an unknown density, a missing piece weight, or no amount
/// at all. Null means "say so", never "assume something".
export function gramsFor(parsed, food) {
  if (parsed.amount === null || !food) return null;

  if (parsed.unit === null) {
    return food.gramsPerPiece ? parsed.amount * food.gramsPerPiece : null;
  }

  const unit = UNITS.find((u) => u.canonical === parsed.unit);
  if (!unit) return null;
  if (unit.grams !== undefined) return parsed.amount * unit.grams;
  return food.gramsPerMl ? parsed.amount * unit.ml * food.gramsPerMl : null;
}

function findFood(name, foods) {
  return foods.find((food) => food.match.some((pattern) => pattern.test(name))) ?? null;
}

const EMPTY_MACROS = {
  grams: 0,
  kcal: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  sugars: 0,
  sodium: 0, // mg
};

/// Sodium chloride is 39.3% sodium by mass, so salt = sodium × 2.54. The
/// rounded 2.5 is the factor food labelling uses.
const SALT_PER_SODIUM = 2.5;

/// WHO recommends adults consume less than 5 g of salt (2 g sodium) a day.
/// Reference: WHO Guideline: Sodium intake for adults and children (2012).
export const DAILY_SALT_MAX_G = 5;

/// Fields that a food table entry may be missing. Summing a missing value as
/// zero would understate a total silently, so which foods lacked it is
/// reported instead.
const OPTIONAL_FIELDS = ['sugars', 'sodium'];

/// Whether a food table entry carries an amino acid breakdown at all. USDA
/// has macros but no amino acids for some foods — kefir and dark chocolate
/// among them — and their protein must be kept out of the scoring
/// denominator rather than counted with nothing against it.
const hasAminoAcids = (food) => Object.keys(food.aa ?? {}).length > 0;

/// Analyse an ingredients block at a given portion factor.
///
/// Returns totals, per-100 g figures, the amino acid profile, and — the part
/// that keeps the numbers honest — which lines were counted and which were
/// not.
export function analyse(ingredientsText, factor = 1, foods = []) {
  const multiplier = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const lines = parseIngredients(ingredientsText);

  const total = { ...EMPTY_MACROS };
  const aminoAcids = {};
  const matched = [];
  const unmatched = [];
  const incomplete = Object.fromEntries(OPTIONAL_FIELDS.map((field) => [field, []]));
  incomplete.aminoAcids = [];
  // Protein from foods whose amino acids are known — the only protein the
  // score can legitimately be computed over.
  let proteinScored = 0;

  for (const line of lines) {
    const parsed = parseIngredientLine(line);
    const food = findFood(parsed.food, foods);
    const grams = gramsFor(parsed, food) ;

    if (food === null || grams === null) {
      unmatched.push(line);
      continue;
    }

    const weight = grams * multiplier;
    const per = weight / 100;
    total.grams += weight;
    total.kcal += food.per100g.kcal * per;
    total.protein += food.per100g.protein * per;
    total.fat += food.per100g.fat * per;
    total.carbs += food.per100g.carbs * per;

    for (const field of OPTIONAL_FIELDS) {
      const value = food.per100g[field];
      if (value === undefined || value === null) incomplete[field].push(food.id);
      else total[field] += value * per;
    }

    if (hasAminoAcids(food)) {
      proteinScored += food.per100g.protein * per;
      for (const [name, mgPer100g] of Object.entries(food.aa)) {
        aminoAcids[name] = (aminoAcids[name] ?? 0) + mgPer100g * per;
      }
    } else if (food.per100g.protein > 0 && !incomplete.aminoAcids.includes(food.id)) {
      incomplete.aminoAcids.push(food.id);
    }
    matched.push({ line, food: food.id, grams: weight });
  }

  const { ratios, score, limiting } = scoreAminoAcids(aminoAcids, proteinScored);
  const per100g = total.grams > 0 ? scaleMacros(total, 100 / total.grams) : { ...EMPTY_MACROS };

  // Salt is derived from total sodium rather than from the salt line, so
  // sodium in baking powder, soda and dairy is counted too.
  total.saltEquivalent = (total.sodium * SALT_PER_SODIUM) / 1000;
  per100g.saltEquivalent = (per100g.sodium * SALT_PER_SODIUM) / 1000;

  return {
    total,
    per100g,
    incomplete,
    proteinScored,
    saltFractionOfDailyMax: total.saltEquivalent / DAILY_SALT_MAX_G,
    aminoAcids,
    ratios,
    score,
    limiting,
    matched,
    unmatched,
    matchedCount: matched.length,
    totalCount: lines.length,
  };
}

function scaleMacros(macros, factor) {
  return Object.fromEntries(
    Object.keys(EMPTY_MACROS).map((field) => [field, macros[field] * factor]),
  );
}
