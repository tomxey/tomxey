// The todo content schema — the plaintext shape encrypted into a TodoItem's
// `data`. Kept free of chain and DOM imports so it is testable on its own.

export const ITEM_FORMAT_VERSION = 1;

export function newItemContent(title) {
  return {
    v: ITEM_FORMAT_VERSION,
    title,
    done: false,
    order: Date.now(),
    subs: [],
  };
}

/// Append one open subitem per text, returning new content. Used when copying
/// a recipe's ingredients into a chosen top-level item: the whole list lands
/// in a single `set_data`, so one copy costs one transaction regardless of
/// how many ingredients there are.
///
/// Returns a fresh object because the UI applies the change optimistically
/// and must be able to roll back to the previous content on failure.
export function appendSubitems(content, texts) {
  return {
    ...content,
    subs: [
      ...(content.subs ?? []),
      ...texts.map((text) => ({ id: crypto.randomUUID(), text, done: false })),
    ],
  };
}
