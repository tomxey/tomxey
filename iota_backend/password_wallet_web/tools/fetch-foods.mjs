#!/usr/bin/env node
//
// Generates src/nutrition/foods.js from USDA FoodData Central.
//
//   node tools/fetch-foods.mjs                 # uses DEMO_KEY (30 req/hour)
//   FDC_API_KEY=... node tools/fetch-foods.mjs # a free key from api.data.gov
//
// Run by hand, never at runtime: the app must not make network calls with a
// recipe on screen. The generated file is committed so the numbers are
// reviewable in a diff, and every entry carries the fdcId it came from.
//
// USDA supplies composition. Three things it does not, which are written by
// hand below with a reason each:
//
//   match         Polish patterns, matched against the food part of an
//                 ingredient line. Stems, so declensions work.
//   gramsPerMl    density, needed to weigh an amount given in ml or spoons.
//   gramsPerPiece weight of one, needed for bare counts like "2 jajka".

import { writeFileSync } from 'node:fs';

const API_KEY = process.env.FDC_API_KEY || 'DEMO_KEY';

// Amino acids, mapped to the pairs the FAO/WHO pattern scores.
const AA_FIELDS = {
  Histidine: 'his',
  Isoleucine: 'ile',
  Leucine: 'leu',
  Lysine: 'lys',
  Threonine: 'thr',
  Tryptophan: 'trp',
  Valine: 'val',
  Methionine: 'sulfur',
  Cystine: 'sulfur',
  Phenylalanine: 'phe_tyr',
  Tyrosine: 'phe_tyr',
};

/// The mapping to review. Each fdcId is a judgement call about which USDA
/// food best represents the Polish ingredient; a wrong choice produces
/// confidently wrong numbers, so the generator prints every description it
/// fetched for checking against these notes.
const FOODS = [
  {
    id: 'spelt-flour',
    fdcId: 169745, // "Spelt, uncooked" — the grain. Typ 1700 is a high
    // extraction (near-wholemeal) flour, so whole grain is the closer proxy
    // of the two available; refined spelt flour would understate protein.
    match: [String.raw`mąk\p{L}*\s+orkiszow`, String.raw`orkiszow`, String.raw`spelt`],
    gramsPerMl: 0.52, // 1 cup (250 ml) = 130 g
  },
  {
    id: 'oats',
    fdcId: 169705, // "Oats" — verified to carry all 11 amino acids.
    match: [String.raw`płatk\p{L}*\s+owsian`, String.raw`owsian`, String.raw`\boats?\b`],
    gramsPerMl: 0.36, // 1 cup rolled oats = 90 g
  },
  {
    id: 'almonds',
    fdcId: 170567,
    match: [String.raw`migdał`, String.raw`almond`],
    gramsPerMl: 0.38, // 1 cup ground = 96 g
  },
  {
    id: 'egg',
    fdcId: 171287, // "Egg, whole, raw, fresh"
    match: [String.raw`jajk`, String.raw`jaj\b`, String.raw`\beggs?\b`],
    gramsPerPiece: 50, // a medium egg without shell
  },
  {
    id: 'milk',
    fdcId: 171265,
    match: [String.raw`mlek`, String.raw`\bmilk\b`],
    gramsPerMl: 1.03,
  },
  {
    id: 'kefir',
    fdcId: 170904, // "Kefir, lowfat, plain, LIFEWAY" — actual kefir, not a
    // yoghurt stand-in. Branded, but it is the only kefir SR Legacy carries.
    match: [String.raw`kefir`],
    gramsPerMl: 1.03,
  },
  {
    id: 'olive-oil',
    fdcId: 171413,
    match: [String.raw`oliw`, String.raw`olive oil`],
    gramsPerMl: 0.91,
  },
  {
    id: 'sugar',
    fdcId: 169655,
    match: [String.raw`cukier`, String.raw`cukru`, String.raw`\bsugar\b`],
    gramsPerMl: 0.85,
  },
  {
    id: 'honey',
    fdcId: 169640,
    match: [String.raw`mi[oó]d`, String.raw`miodu`, String.raw`honey`],
    gramsPerMl: 1.42,
  },
  {
    id: 'dark-chocolate',
    fdcId: 170273, // 70-85% cacao
    match: [String.raw`czekolad`, String.raw`chocolate`],
  },
  {
    id: 'salt',
    fdcId: 173468,
    match: [String.raw`\bsól\b`, String.raw`\bsoli\b`, String.raw`\bsalt\b`],
    gramsPerMl: 1.2, // 1 tsp fine table salt = 6 g
  },
  {
    id: 'baking-powder',
    // Straight phosphate double-acting, which is the common European
    // formulation. NOT the low-sodium variant (172805): sodium is the whole
    // reason this ingredient is tracked, and that one has almost none.
    fdcId: 172804,
    match: [String.raw`proszk\p{L}*\s+do\s+pieczenia`, String.raw`baking powder`],
    gramsPerMl: 0.92, // 1 tsp = 4.6 g
  },
  {
    id: 'baking-soda',
    fdcId: 175040,
    match: [String.raw`sod\p{L}*\s+oczyszczon`, String.raw`baking soda`],
    gramsPerMl: 0.92, // 1 tsp = 4.6 g
  },
  {
    id: 'vanilla',
    fdcId: 173471,
    match: [String.raw`wanili`, String.raw`vanilla`],
    gramsPerMl: 0.88, // alcohol-based extract
  },
];

async function fetchAll(ids) {
  const params = new URLSearchParams({ api_key: API_KEY });
  for (const id of ids) params.append('fdcIds', id);
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods?${params}`);
  if (!response.ok) {
    throw new Error(`FoodData Central returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

const amount = (nutrients, name) =>
  nutrients.find((n) => n.nutrient?.name === name && n.nutrient?.unitName !== 'kJ')?.amount ?? null;

function extract(record) {
  const nutrients = record.foodNutrients ?? [];
  const aa = {};
  for (const [usdaName, key] of Object.entries(AA_FIELDS)) {
    const grams = amount(nutrients, usdaName);
    // USDA reports amino acids in grams per 100 g; the app works in mg.
    if (grams !== null) aa[key] = Number(((aa[key] ?? 0) / 1 + grams * 1000).toFixed(1));
  }
  return {
    per100g: {
      kcal: amount(nutrients, 'Energy'),
      protein: amount(nutrients, 'Protein'),
      fat: amount(nutrients, 'Total lipid (fat)'),
      carbs: amount(nutrients, 'Carbohydrate, by difference'),
      // Sugar and honey are nearly all sugars, so separating them from total
      // carbohydrate is what makes the carb figure readable.
      // SR Legacy calls this 'Total Sugars'; newer datasets use the NLEA
      // name. Getting it wrong reports every food as sugar-free.
      sugars:
        amount(nutrients, 'Total Sugars') ??
        amount(nutrients, 'Sugars, total including NLEA') ??
        amount(nutrients, 'Sugars, total'),
      // Salt is derived from this, and it comes from baking powder and dairy
      // as well as from the salt line.
      sodium: amount(nutrients, 'Sodium, Na'),
    },
    aa,
  };
}

const records = await fetchAll(FOODS.map((f) => f.fdcId));
const byId = new Map(records.map((r) => [r.fdcId, r]));

const entries = FOODS.map((food) => {
  const record = byId.get(food.fdcId);
  if (!record) throw new Error(`no record returned for ${food.id} (fdcId ${food.fdcId})`);
  const { per100g, aa } = extract(record);
  console.log(
    `  ${food.id.padEnd(16)} ${String(food.fdcId).padEnd(8)} ${record.description}` +
      `  [${Object.keys(aa).length} aa groups, protein ${per100g.protein}]`,
  );
  return { ...food, description: record.description, per100g, aa };
});

const source = `// GENERATED by tools/fetch-foods.mjs — do not edit by hand.
//
// Composition from USDA FoodData Central (SR Legacy), fetched ${new Date().toISOString().slice(0, 10)}.
// Each entry names the fdcId it came from; \`description\` is USDA's own, kept
// so a wrong mapping is visible on sight.
//
// Values are per 100 g: macros in grams (energy in kcal), amino acids in mg.
// Real foods vary — these are reference figures, not a measurement of what is
// in your kitchen.

export const FOODS = ${JSON.stringify(entries, null, 2)
  .replace(/"match": \[([^\]]*)\]/g, (_, inner) => `"match": [${inner.trim().replace(/\s+/g, ' ')}]`)};

/// Match patterns are stored as strings so this file stays plain data; they
/// become case-insensitive Unicode regexes here.
export const FOOD_TABLE = FOODS.map((food) => ({
  ...food,
  match: food.match.map((pattern) => new RegExp(pattern, 'iu')),
}));
`;

writeFileSync(new URL('../src/nutrition/foods.js', import.meta.url), source);
console.log(`\nwrote src/nutrition/foods.js with ${entries.length} foods`);
