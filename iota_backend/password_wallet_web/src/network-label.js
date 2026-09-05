// Say which chain the page is actually talking to.
//
// The name used to be typed into each page's title and badge, which was fine
// while everything ran on testnet and wrong the moment the game moved to
// devnet: the page said testnet, the transactions went to devnet, and the only
// way to tell was to look up an object id by hand. A label that can disagree
// with the config is worse than no label.
//
// So no page writes a network name any more; this puts the resolved one in.

export function showNetwork(network) {
  const badge = document.getElementById('network-badge');
  if (badge) badge.textContent = network;
  // The <title> deliberately ships without a network, so this appends rather
  // than substitutes — nothing to keep in step.
  document.title = `${document.title} (${network})`;
}
