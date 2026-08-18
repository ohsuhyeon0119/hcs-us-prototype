'use client';
import { afterMarks, segment } from '@/lib/highlight';
import type { Change, Turn } from '@/lib/types';

export default function Chat({
  turns,
  changes = [],
  onEdit,
}: {
  turns: Turn[];
  changes?: Change[];
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
        const segs = segment(t.text, afterMarks(changes, i));
        return (
          <div className="turn u" key={i}>
            <div className="bubble u">
              {onEdit && (
                <button className="editbtn" onClick={() => onEdit(i)}>
                  EDIT
                </button>
              )}
              {segs.map((s, j) =>
                s.change === undefined ? (
                  <span key={j}>{s.text}</span>
                ) : (
                  <span className="hl after" key={j} title="rewritten to satisfy your policy">
                    {s.text}
                  </span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
