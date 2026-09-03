// The todo content schema — the plaintext shape encrypted into a TodoItem's
// `data`. Kept free of chain and DOM imports so it is testable on its own.

export const ITEM_FORMAT_VERSION = 1;

/// Items are grouped into named lists. The name lives in the item itself, so
/// a list exists exactly while some item names it — there is nothing else to
/// create or delete, and no migration for items written before lists existed.
///
/// The default list is the absence of a name. Keeping it as `''` rather than
/// a reserved string means every pre-existing item is already in it.
export const DEFAULT_LIST = '';

/// Label for the default list. Only ever shown, never stored.
export const DEFAULT_LIST_LABEL = 'Main';

export function listOf(content) {
  return content?.list?.trim() ? content.list : DEFAULT_LIST;
}

/// Move an item into a list, returning new content. Moving back to the
/// default removes the field, so "no field" stays the one canonical way to
/// say default.
export function withList(content, list) {
  const name = String(list ?? '').trim();
  const next = { ...content };
  if (name) next.list = name;
  else delete next.list;
  return next;
}

/// The distinct list names currently in use, default excluded, ordered the
/// way the list bar shows them.
export function listNames(items) {
  const names = new Set();
  for (const item of items) {
    const name = listOf(item.content);
    if (name !== DEFAULT_LIST) names.add(name);
  }
  return [...names].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

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
