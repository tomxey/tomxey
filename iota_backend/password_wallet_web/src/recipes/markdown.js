// The markdown subset recipes need, parsed into a small block/inline tree.
//
// Parsing is kept separate from DOM building so the whole grammar is testable
// in node, and so there is exactly one place (the renderer) that touches the
// document. Embedded HTML is never a node type: anything that isn't in the
// grammar below ends up as literal text, which is what keeps pasted recipe
// text from becoming markup in the page holding the decrypted seed.

// Inline spans, in match precedence order. Code comes first so that
// `a * b * c` is not read as emphasis; bold before italic so `**x**` is not
// read as an empty italic.
//
// Held as a source string, not a RegExp: `parseInline` recurses into emphasis
// contents, and a shared /g/ instance would have its `lastIndex` reset by the
// inner call, restarting the outer scan forever.
const INLINE_PATTERN =
  '`([^`]+)`|\\*\\*([\\s\\S]+?)\\*\\*|\\*([^*]+?)\\*|_([^_]+?)_|\\[([^\\]]*)\\]\\(([^)\\s]+)\\)';

/// Only these schemes become links. Anything else (`javascript:`, `data:`)
/// stays as visible text.
const SAFE_SCHEME = /^https?:\/\//i;

const HEADING = /^(#{1,3})\s+(.*)$/;
const LIST_ITEM = /^(\s*)(?:[-*]|(\d+)\.)\s+(.*)$/;
const TASK_MARKER = /^\[([ xX])\]\s+(.*)$/;
const FENCE = /^\s*```/;
const RULE = /^\s*---+\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;

/// Markdown string -> array of block nodes:
///   {type:'heading', level, inline} | {type:'para', inline}
///   {type:'list', ordered, items:[{task, inline, children}]}
///   {type:'code', text} | {type:'quote', inline} | {type:'hr'}
export function parse(md) {
  const lines = String(md ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const blocks = [];
  let at = 0;

  while (at < lines.length) {
    const line = lines[at];

    if (!line.trim()) {
      at += 1;
    } else if (FENCE.test(line)) {
      at = readFence(lines, at, blocks);
    } else if (RULE.test(line)) {
      // Checked before lists, since a rule also starts with a dash.
      blocks.push({ type: 'hr' });
      at += 1;
    } else if (HEADING.test(line)) {
      const [, hashes, text] = HEADING.exec(line);
      blocks.push({ type: 'heading', level: hashes.length, inline: parseInline(text) });
      at += 1;
    } else if (QUOTE.test(line)) {
      at = readRun(lines, at, QUOTE, (text) => blocks.push({ type: 'quote', inline: parseInline(text) }));
    } else if (LIST_ITEM.test(line)) {
      at = readList(lines, at, blocks);
    } else {
      at = readParagraph(lines, at, blocks);
    }
  }
  return blocks;
}

/// A fenced block runs to the closing fence, or to the end of input if the
/// author never closed it. Contents are kept verbatim.
function readFence(lines, start, blocks) {
  let at = start + 1;
  const text = [];
  while (at < lines.length && !FENCE.test(lines[at])) {
    text.push(lines[at]);
    at += 1;
  }
  blocks.push({ type: 'code', text: text.join('\n') });
  return at < lines.length ? at + 1 : at;
}

/// Consecutive lines matching `pattern` collapse into one block, joined with
/// spaces — the same soft-wrap handling paragraphs get.
function readRun(lines, start, pattern, emit) {
  const parts = [];
  let at = start;
  while (at < lines.length && pattern.test(lines[at])) {
    parts.push(pattern.exec(lines[at])[1].trim());
    at += 1;
  }
  emit(parts.join(' '));
  return at;
}

/// Consecutive plain lines form one paragraph; any block-level construct ends
/// it.
function readParagraph(lines, start, blocks) {
  const parts = [];
  let at = start;
  while (at < lines.length && isParagraphLine(lines[at])) {
    parts.push(lines[at].trim());
    at += 1;
  }
  blocks.push({ type: 'para', inline: parseInline(parts.join(' ')) });
  return at;
}

function isParagraphLine(line) {
  if (!line.trim()) return false;
  return !(
    FENCE.test(line) ||
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line)
  );
}

/// One list block. Indented items (2+ spaces) attach to the preceding
/// top-level item; deeper nesting is flattened to that one level, which is as
/// far as recipes need to go.
function readList(lines, start, blocks) {
  const [, , ordinal] = LIST_ITEM.exec(lines[start]);
  const items = [];
  let at = start;

  while (at < lines.length && LIST_ITEM.test(lines[at])) {
    const [, indent, , rest] = LIST_ITEM.exec(lines[at]);
    const item = makeItem(rest);
    if (indent.length >= 2 && items.length > 0) items[items.length - 1].children.push(item);
    else items.push(item);
    at += 1;
  }

  blocks.push({ type: 'list', ordered: ordinal !== undefined, items });
  return at;
}

/// `- [ ] text` / `- [x] text` carry checkbox state; a plain item has none,
/// which the renderer distinguishes from an unchecked box.
function makeItem(rest) {
  const task = TASK_MARKER.exec(rest);
  return {
    task: task ? task[1].toLowerCase() === 'x' : null,
    inline: parseInline(task ? task[2] : rest),
    children: [],
  };
}

// --- DOM rendering ----------------------------------------------------------

/// Markdown -> DocumentFragment. Nodes are built one at a time; no markup is
/// ever parsed as HTML, so anything outside the grammar shows up as text.
/// `doc` is injectable so the renderer is testable without a DOM.
///
/// `transformText` optionally rewrites each *text* node into a list of inline
/// nodes — this is how portion scaling highlights quantities. It deliberately
/// never sees inline code, fenced code, or link URLs: those are quoted
/// verbatim, so rewriting them would change their meaning.
export function renderMarkdown(md, doc = globalThis.document, options = {}) {
  const fragment = doc.createDocumentFragment();
  for (const block of parse(md)) fragment.appendChild(renderBlock(block, doc, options));
  return fragment;
}

function renderBlock(block, doc, options) {
  switch (block.type) {
    case 'heading':
      return appendInline(doc.createElement(`h${block.level}`), block.inline, doc, options);
    case 'quote':
      return appendInline(doc.createElement('blockquote'), block.inline, doc, options);
    case 'hr':
      return doc.createElement('hr');
    case 'code':
      return renderCodeBlock(block.text, doc);
    case 'list':
      return renderList(block, doc, options);
    default:
      return appendInline(doc.createElement('p'), block.inline, doc, options);
  }
}

function renderCodeBlock(text, doc) {
  const pre = doc.createElement('pre');
  pre.appendChild(withText(doc.createElement('code'), text, doc));
  return pre;
}

function renderList({ ordered, items }, doc, options) {
  const list = doc.createElement(ordered ? 'ol' : 'ul');
  for (const item of items) list.appendChild(renderItem(item, doc, options));
  return list;
}

function renderItem(item, doc, options) {
  const li = doc.createElement('li');

  // `task === null` means a plain bullet, which must not grow a checkbox.
  if (item.task !== null) {
    const box = doc.createElement('input');
    box.type = 'checkbox';
    box.checked = item.task;
    // Display-only: ticking a box would mean a paid transaction per click.
    box.disabled = true;
    li.appendChild(box);
  }

  appendInline(li, item.inline, doc, options);

  if (item.children.length > 0) {
    const nested = doc.createElement('ul');
    for (const child of item.children) nested.appendChild(renderItem(child, doc, options));
    li.appendChild(nested);
  }
  return li;
}

function renderInline(node, doc, options) {
  switch (node.type) {
    case 'text':
      return doc.createTextNode(node.text);
    case 'code':
      return withText(doc.createElement('code'), node.text, doc);
    case 'link': {
      const anchor = doc.createElement('a');
      anchor.href = node.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      return appendInline(anchor, node.inline, doc, options);
    }
    default:
      // 'strong', 'em' and 'mark' all map to their own element.
      return appendInline(doc.createElement(node.type), node.inline, doc, options);
  }
}

function appendInline(parent, nodes, doc, options = {}) {
  for (const node of nodes) {
    // Only plain text is offered to the transform, and its output is rendered
    // directly rather than re-entering this loop — so a transform that emits
    // text cannot trigger itself again.
    if (node.type === 'text' && options.transformText) {
      for (const piece of options.transformText(node.text)) {
        parent.appendChild(renderInline(piece, doc, options));
      }
    } else {
      parent.appendChild(renderInline(node, doc, options));
    }
  }
  return parent;
}

function withText(element, text, doc) {
  element.appendChild(doc.createTextNode(text));
  return element;
}

// --- inline parsing ---------------------------------------------------------

/// Inline text -> array of {type:'text'|'code', text} and
/// {type:'strong'|'em'|'link', inline, href?}.
export function parseInline(text) {
  const nodes = [];
  const source = String(text ?? '');
  const inline = new RegExp(INLINE_PATTERN, 'g');
  let cursor = 0;

  let match;
  while ((match = inline.exec(source)) !== null) {
    const [whole, code, strong, star, underscore, label, href] = match;

    // A rejected link contributes its own source text, so the scheme check
    // can't be bypassed by writing the URL differently.
    if (href !== undefined && !SAFE_SCHEME.test(href)) {
      pushText(nodes, source.slice(cursor, match.index) + whole);
      cursor = match.index + whole.length;
      continue;
    }

    pushText(nodes, source.slice(cursor, match.index));
    if (code !== undefined) nodes.push({ type: 'code', text: code });
    else if (strong !== undefined) nodes.push({ type: 'strong', inline: parseInline(strong) });
    else if (star !== undefined) nodes.push({ type: 'em', inline: parseInline(star) });
    else if (underscore !== undefined) nodes.push({ type: 'em', inline: parseInline(underscore) });
    else nodes.push({ type: 'link', href, inline: parseInline(label) });
    cursor = match.index + whole.length;
  }

  pushText(nodes, source.slice(cursor));
  return nodes;
}

/// Empty runs are dropped and adjacent runs merged, so the tree is canonical:
/// a rejected link contributes its source text without splitting the run it
/// sits in.
function pushText(nodes, text) {
  if (!text) return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') last.text += text;
  else nodes.push({ type: 'text', text });
}
