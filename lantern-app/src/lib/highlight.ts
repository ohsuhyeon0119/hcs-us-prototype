import type { Change } from './types';

export type Seg = { text: string; change?: number };

/** Split `text` on the given phrases, tagging each hit with its change index. */
export function segment(text: string, marks: { text: string; change: number }[]): Seg[] {
  const hits = marks
    .filter((m) => m.text && text.includes(m.text))
    .map((m) => ({ ...m, start: text.indexOf(m.text) }))
    .sort((a, b) => a.start - b.start);

  const out: Seg[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    if (h.start > cursor) out.push({ text: text.slice(cursor, h.start) });
    out.push({ text: h.text, change: h.change });
    cursor = h.start + h.text.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out.length ? out : [{ text }];
}

export const beforeMarks = (changes: Change[], turnIndex: number) =>
  changes.map((c, i) => ({ ...c, i })).filter((c) => c.turnIndex === turnIndex && c.before)
    .map((c) => ({ text: c.before, change: c.i }));

export const afterMarks = (changes: Change[], turnIndex: number) =>
  changes.map((c, i) => ({ ...c, i })).filter((c) => c.turnIndex === turnIndex && c.after)
    .map((c) => ({ text: c.after, change: c.i }));
