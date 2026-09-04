// Normalising a word or a guess so the two can be compared as bytes.
//
// Move has no Unicode support, so all folding happens here and the contract
// does a plain byte equality. That makes this function a cross-client parity
// requirement: the drawer's phone hashes the normalised word into the
// commitment, every guesser's phone normalises before submitting, and a
// mismatch rejects a correct guess with no visible error.

/// U+0142 / U+0141. Unlike ą ć ę ń ó ś ź ż, these do not decompose under NFD,
/// so stripping combining marks leaves them untouched — the single most
/// likely way for this function to be quietly wrong in Polish.
const NON_DECOMPOSABLE = { ł: 'l', Ł: 'L' };

/// Combining diacritical marks, U+0300–U+036F, which NFD splits off the base
/// letters.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normaliseWord(text) {
  return String(text ?? '')
    .replace(/[łŁ]/g, (character) => NON_DECOMPOSABLE[character])
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
