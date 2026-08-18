'use client';
import { segmentTurn } from '@/lib/mask';
import { attrLabel } from '@/lib/types';
import type { Policy, Span, Turn } from '@/lib/types';

export default function Chat({
  turns,
  spans,
  policy,
  onEdit,
}: {
  turns: Turn[];
  spans: Span[];
  policy: Policy;
  onEdit?: (index: number) => void;
}) {
  return (
    <div className="thread">
      {turns.map((t, i) => {
        if (t.role === 'assistant')
          return (
            <div className="turn a" key={i}>
              <div className="bubble a">{t.text}</div>
            </div>
          );
        const segs = segmentTurn(i, t.text, spans, policy);
        return (
          <div className="turn u" key={i}>
            <div className="bubble u">
              {onEdit && (
                <button className="editbtn" onClick={() => onEdit(i)}>
                  EDIT
                </button>
              )}
              {segs.map((s, j) =>
                s.masked ? (
                  <span className="mask" key={j}>
                    {s.text}
                    <span className="tip">
                      <span className="th">🚫 {attrLabel(s.attr!)} · masked by your policy</span>
                      <span className="tb">{s.original}</span>
                    </span>
                  </span>
                ) : (
                  <span key={j}>{s.text}</span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
