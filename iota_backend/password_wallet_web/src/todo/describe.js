// Turning a TodoItem's before/after contents into history lines.
import { DEFAULT_LIST_LABEL, listOf } from './content.js';

export function describeTodo({ change, before, after }) {
  if (change === 'created') {
    if (!after) return ['＋ created an item'];
    const subs = after.subs?.length ? ` with ${after.subs.length} subitem(s)` : '';
    return [`＋ created “${after.title}”${subs}`];
  }
  if (change === 'deleted') {
    return [before ? `✕ deleted “${before.title}”` : '✕ deleted an item'];
  }
  return diffContents(before, after);
}

function diffContents(before, after) {
  if (!before || !after) return ['edited an item (details no longer available)'];
  const lines = [];
  const title = after.title;
  if (before.title !== after.title) lines.push(`renamed “${before.title}” → “${after.title}”`);

  // The list name lives in the item, so a move is visible from the two
  // versions alone — no need to resolve anything else.
  if (listOf(before) !== listOf(after)) {
    lines.push(`→ moved “${title}” to «${listOf(after) || DEFAULT_LIST_LABEL}»`);
  }
  if (before.done !== after.done) {
    lines.push(after.done ? `☑ completed “${title}”` : `☐ reopened “${title}”`);
  }

  const beforeSubs = new Map((before.subs ?? []).map((s) => [s.id, s]));
  const afterSubs = new Map((after.subs ?? []).map((s) => [s.id, s]));
  for (const [id, sub] of afterSubs) {
    const old = beforeSubs.get(id);
    if (!old) {
      lines.push(`＋ added “${sub.text}” under “${title}”`);
    } else {
      if (old.text !== sub.text) lines.push(`renamed subitem “${old.text}” → “${sub.text}”`);
      if (old.done !== sub.done) {
        lines.push(sub.done ? `☑ completed “${sub.text}”` : `☐ reopened “${sub.text}”`);
      }
    }
  }
  for (const [id, old] of beforeSubs) {
    if (!afterSubs.has(id)) lines.push(`✕ removed “${old.text}” from “${title}”`);
  }

  if (!lines.length) lines.push(`touched “${title}” (no visible change)`);
  return lines;
}
