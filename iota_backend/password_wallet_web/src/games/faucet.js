// A one-click link to the testnet faucet with the address already filled in.
//
// The faucet is a single-page app that reads `?address=` on load:
//
//   new URLSearchParams(window.location.search).get("address")?.trim() ?? ""
//
// and validates it against /^0x[0-9a-fA-F]{64}$/ before enabling its button.
// So the address has to be the full normalised form — a short or unpadded one
// prefills a field the faucet then refuses, which looks like the faucet is
// broken rather than like a bad link.

/// The exact shape the faucet accepts. Same regex it applies itself.
const FUNDABLE = /^0x[0-9a-fA-F]{64}$/;

export function isFundableAddress(address) {
  return FUNDABLE.test(String(address ?? '').trim());
}

/// `null` rather than a broken link when the address is not something the
/// faucet will take — the caller hides the button instead of offering a click
/// that leads to a rejected form.
export function faucetUrl(base, address) {
  const trimmed = String(address ?? '').trim();
  if (!base || !isFundableAddress(trimmed)) return null;
  return `${String(base).replace(/\/$/, '')}/?address=${encodeURIComponent(trimmed)}`;
}
