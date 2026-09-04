// The nutrition panel on a recipe: macros, salt against the daily maximum,
// and the amino acid profile.
//
// Everything shown is derived from the ingredients on screen at the current
// portion scale. Nothing is stored, and nothing leaves the page.
import { AMINO_ACID_LABELS } from './aminoAcids.js';
import { FOOD_TABLE } from './foods.js';
import { DAILY_FIBER_G, DAILY_SALT_MAX_G, analyse, energyShares } from './nutrition.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const round = (value, digits = 0) => Number(value.toFixed(digits)).toLocaleString();
const percent = (fraction) => `${Math.round(fraction * 100)}%`;

/// Divide the batch into servings. Per-100 g figures and the amino acid
/// ratios are intensive — they do not change with how the batch is cut — so
/// only the absolute totals and the daily-maximum share are divided.
function perServing(batch, servings) {
  if (servings === 1) return { ...batch, servings };
  const total = Object.fromEntries(
    Object.entries(batch.total).map(([key, value]) => [key, value / servings]),
  );
  return {
    ...batch,
    servings,
    total,
    proteinScored: batch.proteinScored / servings,
    saltFractionOfDailyMax: batch.saltFractionOfDailyMax / servings,
  };
}

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'fat', label: 'Fat' },
  { key: 'carbs', label: 'Carbohydrate' },
];

/// Render the panel for `ingredientsText` at `portions` into `container`.
///
/// `servings` divides the batch: a recipe is a tray of waffles, not a plate,
/// so reporting its totals as one person's intake — and worse, as a
/// percentage of a daily maximum — overstates them by however many servings
/// it actually makes.
export function renderNutrition(container, ingredientsText, portions, servings = 1) {
  const batch = analyse(ingredientsText, portions, FOOD_TABLE);
  const n = perServing(batch, Math.max(1, Math.floor(servings) || 1));
  container.replaceChildren();

  // The collapsed row carries the headline figures. A summary that just says
  // "nutrition" is easy to scroll past without realising anything is there.
  const summary = document.getElementById('recipe-nutrition-summary');
  if (summary) {
    summary.textContent =
      n.matchedCount === 0
        ? 'nutrition'
        : `nutrition · ${round(n.total.kcal)} kcal · ${round(n.total.protein, 1)} g protein`;
  }

  if (n.matchedCount === 0) {
    container.appendChild(
      el('p', 'hint', 'No ingredients recognised, so there is nothing to total up.'),
    );
    return n;
  }

  if (n.servings > 1) {
    container.appendChild(
      el('p', 'hint', `Per serving, one of ${n.servings} from this recipe.`),
    );
  } else {
    container.appendChild(el('p', 'hint', 'For the whole recipe as scaled.'));
  }
  container.appendChild(macros(n));
  container.appendChild(fibre(n));
  container.appendChild(salt(n));
  if (n.score !== null) container.appendChild(aminoAcids(n));
  container.appendChild(caveats(n));
  return n;
}

// --- macros ------------------------------------------------------------------

function macros(n) {
  const box = el('div', 'nutri-block');
  box.appendChild(
    el('div', 'nutri-headline', `${round(n.total.kcal)} kcal · ${round(n.total.grams)} g total`),
  );

  // One stacked bar of where the energy comes from. Grams alone hide this:
  // the fat here weighs less than the protein but carries twice the energy.
  const shares = energyShares(n.total);
  const stack = el('div', 'macro-stack');
  for (const { key } of MACROS) {
    if (shares[key] <= 0) continue;
    const part = el('div', `macro-part macro-${key}`);
    part.style.width = `${shares[key] * 100}%`;
    part.title = `${MACROS.find((m) => m.key === key).label}: ${percent(shares[key])} of energy`;
    stack.appendChild(part);
  }
  box.appendChild(stack);

  const rows = el('dl', 'nutri-rows');
  for (const { key, label } of MACROS) {
    const name = el('dt');
    name.appendChild(el('span', `macro-dot macro-${key}`));
    name.appendChild(el('span', null, label));
    rows.appendChild(name);
    rows.appendChild(
      el('dd', null, `${round(n.total[key], 1)} g · ${percent(shares[key])} of energy`),
    );

    if (key === 'carbs') {
      // Both are part of the carbohydrate figure above, not additional to it.
      rows.appendChild(el('dt', 'sub', 'of which sugars'));
      rows.appendChild(
        el('dd', 'sub', `${round(n.total.sugars, 1)} g · ${percent(shares.sugars)} of energy`),
      );
      rows.appendChild(el('dt', 'sub', 'of which fibre'));
      rows.appendChild(
        el('dd', 'sub', `${round(n.total.fiber, 1)} g · ${percent(n.fiberFractionOfDaily)} of 25 g/day`),
      );
    }
  }
  box.appendChild(rows);
  box.appendChild(
    el('p', 'hint', `Per 100 g: ${round(n.per100g.kcal)} kcal, ${round(n.per100g.protein, 1)} g protein.`),
  );
  return box;
}

// --- fibre -------------------------------------------------------------------

/// Unlike salt, this is a target to reach rather than a ceiling to stay
/// under, so meeting it is the good outcome and the bar is not a warning.
function fibre(n) {
  const box = el('div', 'nutri-block');
  const share = n.fiberFractionOfDaily;
  box.appendChild(el('div', 'nutri-sub', 'Fibre'));
  box.appendChild(
    el('div', 'nutri-line', `${round(n.total.fiber, 1)} g — ${percent(share)} of the ${DAILY_FIBER_G} g daily reference`),
  );

  const track = el('div', 'meter');
  const fill = el('div', `meter-fill${share >= 1 ? ' met' : ''}`);
  fill.style.width = `${Math.min(100, share * 100)}%`;
  track.appendChild(fill);
  box.appendChild(track);

  box.appendChild(
    el('p', 'hint', 'Already included in the carbohydrate figure above, and charged at 2 kcal/g rather than 4.'),
  );
  return box;
}

// --- salt --------------------------------------------------------------------

function salt(n) {
  const box = el('div', 'nutri-block');
  const share = n.saltFractionOfDailyMax;
  box.appendChild(el('div', 'nutri-sub', 'Salt'));
  box.appendChild(
    el('div', 'nutri-line', `${round(n.total.saltEquivalent, 2)} g — ${percent(share)} of the WHO ${DAILY_SALT_MAX_G} g daily maximum`),
  );

  const track = el('div', 'meter');
  const fill = el('div', `meter-fill${share > 1 ? ' over' : ''}`);
  fill.style.width = `${Math.min(100, share * 100)}%`;
  track.appendChild(fill);
  box.appendChild(track);

  box.appendChild(
    el('p', 'hint', 'Includes sodium from baking powder and dairy, not just added salt.'),
  );
  return box;
}

// --- amino acids ----------------------------------------------------------------

function aminoAcids(n) {
  const box = el('div', 'nutri-block');
  const complete = n.score >= 1;

  box.appendChild(el('div', 'nutri-sub', 'Protein quality'));
  box.appendChild(
    el(
      'div',
      'nutri-line',
      complete
        ? `Complete — every amino acid meets the reference. Lowest is ${AMINO_ACID_LABELS[n.limiting].toLowerCase()} at ${percent(n.score)}.`
        : `Short on ${AMINO_ACID_LABELS[n.limiting].toLowerCase()} at ${percent(n.score)} of the reference, which caps how much of the rest is usable.`,
    ),
  );
  // Stated above the chart, not below it, since that is where the question
  // "what are these percentages" gets asked.
  box.appendChild(
    el(
      'p',
      'hint',
      'Share of the FAO/WHO reference per gram of protein. Above 100% is not better — surplus amino acids are simply used for energy. The only thing that matters is whether any falls below the line, because the lowest one caps how much of the rest can be used.',
    ),
  );

  // The axis runs past the longest bar so that differences are visible, and
  // never tighter than 125% so the reference line is not jammed at the edge.
  // Clipping every bar at 100% — as this did — made 110% and 225% identical.
  const ratios = Object.entries(n.ratios).sort((a, b) => a[1] - b[1]);
  const axis = Math.max(1.25, ...ratios.map(([, r]) => r));

  const chart = el('div', 'aa-chart');
  for (const [name, ratio] of ratios) {
    chart.appendChild(el('span', 'aa-name', AMINO_ACID_LABELS[name]));

    const track = el('div', 'aa-track');
    // The reference marker is what makes a bar readable: left of it is short.
    const marker = el('div', 'aa-reference');
    marker.style.left = `${(1 / axis) * 100}%`;
    track.appendChild(marker);

    // Red means below the reference. The limiting amino acid is not itself a
    // problem when it still clears 100%.
    const fill = el('div', `aa-fill${ratio < 1 ? ' short' : ''}`);
    fill.style.width = `${(ratio / axis) * 100}%`;
    track.appendChild(fill);
    chart.appendChild(track);

    chart.appendChild(el('span', `aa-pct${ratio < 1 ? ' short' : ''}`, percent(ratio)));
  }
  box.appendChild(chart);
  box.appendChild(el('p', 'hint aa-legend', `The line marks 100%. Axis runs to ${percent(axis)}.`));
  return box;
}

// --- caveats ---------------------------------------------------------------------

/// Below this, naming a gap is noise rather than honesty — a tenth of a gram
/// of protein in baking powder changes nothing, and reporting "excludes 0 g"
/// reads as a bug.
const NEGLIGIBLE_GRAMS = 0.05;

function caveats(n) {
  const box = el('div', 'nutri-caveats');

  if (n.unmatched.length) {
    box.appendChild(el('p', 'hint', `Not counted: ${n.unmatched.join(', ')}.`));
  }

  const unscored = n.total.protein - n.proteinScored;
  if (n.incomplete.aminoAcids.length && unscored >= NEGLIGIBLE_GRAMS) {
    box.appendChild(
      el(
        'p',
        'hint',
        `Protein quality excludes ${round(unscored, 1)} g of protein from ${n.incomplete.aminoAcids.join(', ')}, which has no amino acid data.`,
      ),
    );
  }
  for (const field of ['sugars', 'sodium']) {
    if (n.incomplete[field].length) {
      box.appendChild(el('p', 'hint', `${field} unknown for: ${n.incomplete[field].join(', ')}.`));
    }
  }
  box.appendChild(el('p', 'hint', 'Reference values from USDA FoodData Central; real ingredients vary.'));
  return box;
}
