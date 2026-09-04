// The nutrition panel on a recipe: macros, salt against the daily maximum,
// and the amino acid profile.
//
// Everything shown is derived from the ingredients on screen at the current
// portion scale. Nothing is stored, and nothing leaves the page.
import { AMINO_ACID_LABELS } from './aminoAcids.js';
import { FOOD_TABLE } from './foods.js';
import { DAILY_SALT_MAX_G, analyse } from './nutrition.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const round = (value, digits = 0) => Number(value.toFixed(digits)).toLocaleString();

/// Render the panel for `ingredientsText` at `portions` into `container`.
export function renderNutrition(container, ingredientsText, portions) {
  const n = analyse(ingredientsText, portions, FOOD_TABLE);
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

  container.appendChild(macros(n));
  container.appendChild(salt(n));
  if (n.score !== null) container.appendChild(aminoAcids(n));
  container.appendChild(caveats(n));
  return n;
}

function macros(n) {
  const box = el('div', 'nutri-macros');
  box.appendChild(
    el('div', 'nutri-headline', `${round(n.total.kcal)} kcal · ${round(n.total.grams)} g total`),
  );

  const rows = [
    ['Protein', `${round(n.total.protein, 1)} g`],
    ['Fat', `${round(n.total.fat, 1)} g`],
    ['Carbohydrate', `${round(n.total.carbs, 1)} g`],
    ['— of which sugars', `${round(n.total.sugars, 1)} g`],
  ];
  const list = el('dl', 'nutri-rows');
  for (const [label, value] of rows) {
    list.appendChild(el('dt', label.startsWith('—') ? 'sub' : null, label));
    list.appendChild(el('dd', null, value));
  }
  box.appendChild(list);
  box.appendChild(
    el('p', 'hint', `per 100 g: ${round(n.per100g.kcal)} kcal, ${round(n.per100g.protein, 1)} g protein`),
  );
  return box;
}

function salt(n) {
  const box = el('div', 'nutri-salt');
  const percent = Math.round(n.saltFractionOfDailyMax * 100);
  box.appendChild(el('div', 'nutri-sub', 'Salt'));
  box.appendChild(
    el('div', null, `${round(n.total.saltEquivalent, 2)} g — ${percent}% of the WHO ${DAILY_SALT_MAX_G} g daily maximum`),
  );
  box.appendChild(bar(n.saltFractionOfDailyMax, percent > 100));
  box.appendChild(
    el('p', 'hint', 'For the whole recipe as scaled. Includes sodium from baking powder and dairy, not just added salt.'),
  );
  return box;
}

function aminoAcids(n) {
  const box = el('div', 'nutri-aa');
  box.appendChild(el('div', 'nutri-sub', 'Protein quality'));
  box.appendChild(
    el(
      'div',
      null,
      `score ${n.score.toFixed(2)} · limiting: ${AMINO_ACID_LABELS[n.limiting].toLowerCase()}`,
    ),
  );

  const chart = el('div', 'nutri-chart');
  // Worst first: the limiting amino acid is the one worth acting on.
  for (const [name, ratio] of Object.entries(n.ratios).sort((a, b) => a[1] - b[1])) {
    chart.appendChild(el('span', 'aa-name', AMINO_ACID_LABELS[name]));
    chart.appendChild(bar(ratio, false, name === n.limiting));
    chart.appendChild(el('span', 'aa-pct', `${Math.round(ratio * 100)}%`));
  }
  box.appendChild(chart);
  box.appendChild(
    el(
      'p',
      'hint',
      'Percentage of the FAO/WHO reference pattern per gram of protein. The lowest one caps how much of the rest the body can use.',
    ),
  );
  return box;
}

/// A proportion bar. Ratios above 1 fill the track completely rather than
/// overflowing it; the number beside it carries the real value.
function bar(ratio, over = false, limiting = false) {
  const track = el('div', `nutri-bar${over ? ' over' : ''}${limiting ? ' limiting' : ''}`);
  const fill = el('div', 'nutri-fill');
  fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  track.appendChild(fill);
  return track;
}

/// What the numbers do not cover. Shown whenever anything is missing, so a
/// total is never quietly short.
function caveats(n) {
  const box = el('div', 'nutri-caveats');

  if (n.unmatched.length) {
    box.appendChild(el('p', 'hint', `Not counted: ${n.unmatched.join(', ')}`));
  }
  if (n.incomplete.aminoAcids.length) {
    const grams = round(n.total.protein - n.proteinScored, 1);
    box.appendChild(
      el(
        'p',
        'hint',
        `Protein quality excludes ${grams} g of protein from ${n.incomplete.aminoAcids.join(', ')}, which has no amino acid data.`,
      ),
    );
  }
  for (const field of ['sugars', 'sodium']) {
    if (n.incomplete[field].length) {
      box.appendChild(el('p', 'hint', `${field} unknown for: ${n.incomplete[field].join(', ')}`));
    }
  }
  box.appendChild(
    el('p', 'hint', 'Reference values from USDA FoodData Central; real ingredients vary.'),
  );
  return box;
}
