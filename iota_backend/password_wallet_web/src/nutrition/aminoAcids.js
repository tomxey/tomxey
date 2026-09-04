// Amino acid scoring for a dish's protein.
//
// The question this answers is not "how much protein" but "how usable is it":
// protein is built from all nine indispensable amino acids at once, so the
// scarcest one caps how much of the rest the body can use. That scarcest one
// is the limiting amino acid, and the ratio it achieves is the amino acid
// score.
//
// Reference: FAO/WHO/UNU, Protein and Amino Acid Requirements in Human
// Nutrition (WHO Technical Report Series 935, 2007), scoring pattern for
// adults, in mg per gram of protein.
//
// This is a raw amino acid score, not PDCAAS or DIAAS: those additionally
// weight by digestibility, which needs per-food coefficients that are both
// contested and largely unavailable for the foods here. Saying "score 0.62,
// limiting lysine" is defensible from public composition data; claiming a
// digestibility-corrected figure would not be.

export const REFERENCE_PATTERN = Object.freeze({
  his: 15,
  ile: 30,
  leu: 59,
  lys: 45,
  sulfur: 22, // methionine + cystine
  phe_tyr: 38, // phenylalanine + tyrosine
  thr: 23,
  trp: 6,
  val: 39,
});

/// Human-readable names, for the chart.
export const AMINO_ACID_LABELS = Object.freeze({
  his: 'Histidine',
  ile: 'Isoleucine',
  leu: 'Leucine',
  lys: 'Lysine',
  sulfur: 'Methionine + cystine',
  phe_tyr: 'Phenylalanine + tyrosine',
  thr: 'Threonine',
  trp: 'Tryptophan',
  val: 'Valine',
});

/// Score a dish. `aminoAcidsMg` totals each amino acid in milligrams across
/// the whole dish; `proteinGrams` is its total protein.
///
/// Returns `{ratios, score, limiting}` where each ratio is the amount present
/// per gram of protein divided by the reference. Ratios above 1 are reported
/// as-is: knowing tryptophan sits at 180% is informative, and clipping hides
/// it. The score is the minimum ratio.
export function scoreAminoAcids(aminoAcidsMg, proteinGrams) {
  if (!(proteinGrams > 0)) {
    return { ratios: {}, score: null, limiting: null };
  }

  const ratios = {};
  for (const [name, required] of Object.entries(REFERENCE_PATTERN)) {
    // A value the food table does not carry counts as zero, not as "assume
    // adequate" — an incomplete table must not read as complete protein.
    const perGram = (aminoAcidsMg[name] ?? 0) / proteinGrams;
    ratios[name] = perGram / required;
  }

  let limiting = null;
  for (const [name, ratio] of Object.entries(ratios)) {
    if (limiting === null || ratio < ratios[limiting]) limiting = name;
  }

  return { ratios, score: ratios[limiting], limiting };
}
