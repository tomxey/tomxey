// Words for kalambury. Bundled rather than fetched: the drawer's client picks
// one locally and only its hash goes on chain, so the list must work offline.
//
// Deliberately concrete and drawable — abstract nouns make for bad rounds.
export const WORDS = [
  'harmonijka',
  'akordeon',
  'żółw',
  'parasol',
  'latarnia',
  'rower',
  'kaktus',
  'gitara',
  'zegarek',
  'lodówka',
  'słoń',
  'wiatrak',
  'drabina',
  'kompas',
  'żarówka',
  'walizka',
  'młotek',
  'skrzypce',
  'balon',
  'choinka',
  'grzyb',
  'igloo',
  'kotwica',
  'latawiec',
  'mikrofon',
  'okulary',
  'piramida',
  'rakieta',
  'sanie',
  'termometr',
  'waga',
  'zamek',
  'żaba',
  'miotła',
  'nożyce',
  'pingwin',
  'schody',
  'truskawka',
  'wulkan',
  'żyrafa',
];

/// A word the drawer has not had yet this game, so a short game does not
/// repeat itself. Falls back to the whole list once every word is used, rather
/// than running out.
export function pickWord(used = [], random = Math.random) {
  const remaining = WORDS.filter((word) => !used.includes(word));
  const pool = remaining.length > 0 ? remaining : WORDS;
  return pool[Math.floor(random() * pool.length)];
}
