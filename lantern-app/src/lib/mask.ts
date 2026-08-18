import type { AttrKey, Policy, Span, Turn } from './types';

/** Replace every non-space, non-punctuation character with '*', preserving shape. */
export function maskString(s: string): string {
  return s.replace(/[^\s]/g, (c) => (/[.,!?;:'"()\-]/.test(c) ? c : '*'));
}

export type Segment = { text: string; masked: boolean; attr?: AttrKey; original?: string };

/** Split one turn into segments, masking spans whose attribute is blocked. */
export function segmentTurn(turnIndex: number, text: string, spans: Span[], policy: Policy): Segment[] {
  const hits = spans
    .filter((s) => s.turnIndex === turnIndex && policy[s.attr] === 'block')
    .map((s) => ({ ...s, start: text.indexOf(s.text) }))
    .filter((s) => s.start >= 0)
    .sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue; // overlapping span, skip
    if (h.start > cursor) out.push({ text: text.slice(cursor, h.start), masked: false });
    out.push({ text: maskString(h.text), masked: true, attr: h.attr, original: h.text });
    cursor = h.start + h.text.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), masked: false });
  return out;
}

/** The conversation as the AI actually receives it, after policy enforcement. */
export function maskedTurns(turns: Turn[], spans: Span[], policy: Policy): Turn[] {
  return turns.map((t, i) =>
    t.role === 'user'
      ? { ...t, text: segmentTurn(i, t.text, spans, policy).map((s) => s.text).join('') }
      : t,
  );
}
