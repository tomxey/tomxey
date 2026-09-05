// Words for kalambury. Bundled rather than fetched: the drawer's client picks
// one locally and only its hash goes on chain, so the list must work offline.
//
// Deliberately concrete and drawable — abstract nouns make for bad rounds.
// Single words only, and nothing that needs a caption to be recognised.
//
// Grouped only so the list is easy to extend and to see what is thin; the
// groups carry no meaning at pick time. Two rules the tests enforce: no
// duplicates, and no two words that normalise to the same string — "łoś" and a
// hypothetical "los" would both become "los", and a guesser typing it could
// not be told which one they meant.

const ANIMALS = [
  'żółw', 'słoń', 'żaba', 'pingwin', 'żyrafa',
  'kot', 'pies', 'koń', 'krowa', 'świnia', 'owca', 'kura', 'kaczka', 'gęś',
  'ryba', 'rekin', 'wieloryb', 'delfin', 'krab', 'ośmiornica', 'meduza',
  'motyl', 'pszczoła', 'mrówka', 'pająk', 'ślimak', 'biedronka',
  'wąż', 'jaszczurka', 'krokodyl', 'małpa', 'niedźwiedź', 'wilk', 'lis',
  'jeż', 'wiewiórka', 'zając', 'mysz', 'nietoperz', 'sowa', 'orzeł',
  'papuga', 'paw', 'struś', 'lew', 'tygrys', 'zebra', 'hipopotam',
  'nosorożec', 'wielbłąd', 'kangur', 'panda', 'jeleń', 'foka',
];

const HOUSEHOLD = [
  'parasol', 'zegarek', 'lodówka', 'drabina', 'żarówka', 'walizka', 'miotła',
  'nożyce', 'okulary', 'waga', 'termometr',
  'łóżko', 'krzesło', 'stół', 'kanapa', 'szafa', 'lampa', 'dywan', 'poduszka',
  'lustro', 'drzwi', 'okno', 'klucz', 'kłódka', 'świeca', 'latarka',
  'telefon', 'komputer', 'telewizor', 'radio', 'aparat', 'książka', 'gazeta',
  'ołówek', 'długopis', 'pędzel', 'widelec', 'łyżka', 'nóż', 'talerz',
  'kubek', 'szklanka', 'butelka', 'garnek', 'patelnia', 'czajnik', 'koszyk',
  'wiadro', 'szczotka', 'grzebień', 'mydło', 'ręcznik', 'plecak', 'torba',
  'portfel', 'moneta', 'parasolka', 'klepsydra', 'wachlarz', 'globus', 'mapa',
];

const TOOLS = [
  'młotek', 'kompas', 'kotwica',
  'gwóźdź', 'śruba', 'piła', 'siekiera', 'lina', 'sieć', 'haczyk', 'lupa',
  'mikroskop', 'teleskop', 'lornetka', 'bateria', 'żagiel', 'wędka',
];

const FOOD = [
  'grzyb', 'truskawka',
  'chleb', 'ser', 'jajko', 'mleko', 'masło', 'jabłko', 'gruszka', 'banan',
  'pomarańcza', 'cytryna', 'arbuz', 'winogrono', 'wiśnia', 'śliwka',
  'marchewka', 'ziemniak', 'pomidor', 'ogórek', 'cebula', 'czosnek',
  'kapusta', 'dynia', 'kukurydza', 'orzech', 'ciastko', 'tort', 'lody',
  'czekolada', 'pizza', 'kanapka', 'zupa', 'makaron', 'kiełbasa', 'miód',
];

const NATURE = [
  'kaktus', 'choinka', 'wulkan',
  'drzewo', 'kwiat', 'róża', 'tulipan', 'liść', 'trawa', 'kamień', 'góra',
  'rzeka', 'jezioro', 'morze', 'plaża', 'wyspa', 'las', 'chmura', 'deszcz',
  'śnieg', 'tęcza', 'słońce', 'księżyc', 'gwiazda', 'planeta', 'ogień',
  'bałwan', 'sopel', 'pióro', 'muszla',
];

const VEHICLES = [
  'rower', 'rakieta', 'sanie', 'balon', 'latawiec',
  'samochód', 'autobus', 'pociąg', 'samolot', 'statek', 'łódka', 'helikopter',
  'motocykl', 'hulajnoga', 'traktor', 'ciężarówka', 'karetka', 'tramwaj',
  'spadochron', 'wózek',
];

const PLACES = [
  'latarnia', 'piramida', 'schody', 'zamek', 'igloo', 'wiatrak',
  'dom', 'kościół', 'wieża', 'most', 'szkoła', 'sklep', 'młyn', 'stodoła',
  'namiot', 'garaż', 'płot', 'studnia', 'fontanna', 'pomnik', 'winda',
];

const CLOTHES = [
  'koszula', 'spodnie', 'sukienka', 'kurtka', 'czapka', 'kapelusz', 'szalik',
  'rękawiczki', 'buty', 'skarpetki', 'krawat', 'pasek', 'guzik', 'sweter',
  'korona', 'maska',
];

const MUSIC_AND_SPORT = [
  'harmonijka', 'akordeon', 'gitara', 'skrzypce', 'mikrofon',
  'pianino', 'trąbka', 'bęben', 'flet', 'harfa', 'nuty',
  'piłka', 'narty', 'łyżwy', 'deskorolka', 'huśtawka', 'hantle', 'medal',
];

const CHARACTERS = [
  'król', 'królowa', 'rycerz', 'pirat', 'klaun', 'czarownica', 'duch',
  'robot', 'kosmita', 'anioł', 'mumia', 'wampir', 'syrena', 'smok',
  'jednorożec', 'strach', 'żołnierz', 'nurek', 'kucharz',
];

const BODY = ['oko', 'ucho', 'nos', 'serce', 'ząb', 'broda', 'wąsy', 'dłoń', 'stopa'];

const OTHER = ['miecz', 'tarcza', 'łuk', 'strzała', 'armata', 'flaga', 'skarb', 'trumna'];

export const WORDS = [
  ...ANIMALS,
  ...HOUSEHOLD,
  ...TOOLS,
  ...FOOD,
  ...NATURE,
  ...VEHICLES,
  ...PLACES,
  ...CLOTHES,
  ...MUSIC_AND_SPORT,
  ...CHARACTERS,
  ...BODY,
  ...OTHER,
];

/// A word this drawer has not had yet, falling back to the whole list once
/// they have had them all.
export function pickWord(used = [], random = Math.random) {
  const remaining = WORDS.filter((word) => !used.includes(word));
  const pool = remaining.length > 0 ? remaining : WORDS;
  return pool[Math.floor(random() * pool.length)];
}
