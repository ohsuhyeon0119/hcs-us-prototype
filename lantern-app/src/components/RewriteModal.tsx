'use client';
import { useState } from 'react';
import { afterMarks, beforeMarks, segment } from '@/lib/highlight';
import { attrLabel } from '@/lib/types';
import type { Change, RewriteResult, Turn } from '@/lib/types';

export default function RewriteModal({
  base,
  result,
  loading,
  error,
  blocked,
  onApply,
  onCancel,
}: {
  base: Turn[];
  result: RewriteResult | null;
  loading: boolean;
  error: string | null;
  blocked: string[];
  onApply: () => void;
  onCancel: () => void;
}) {
  const [hover, setHover] = useState<{ change: number; side: 'l' | 'r' } | null>(null);
  const changes = result?.changes ?? [];
  const after = result?.turns ?? base;

  const cell = (side: 'l' | 'r', turn: Turn, i: number) => {
    const marks = side === 'l' ? beforeMarks(changes, i) : afterMarks(changes, i);
    const segs = segment(turn.text, marks);
    return (
      <div className={`turn ${turn.role === 'user' ? 'u' : 'a'}`}>
        <div className={`bubble ${turn.role === 'user' ? 'u' : 'a'}`}>
          {segs.map((s, j) => {
            if (s.change === undefined) return <span key={j}>{s.text}</span>;
            const c = changes[s.change];
            const on = hover?.change === s.change;
            return (
              <span
                key={j}
                className={`hl ${side === 'l' ? 'before' : 'after'} ${on ? 'pairon' : ''}`}
                onMouseEnter={() => setHover({ change: s.change!, side })}
                onMouseLeave={() => setHover(null)}
              >
                {s.text}
                {on && hover?.side === side && <Why c={c} />}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="modalwrap" onClick={onCancel}>
      <div className="modal diff" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="mhead">
            <span className="mtitle">Applying your policy</span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={onCancel}>
              ✕
            </button>
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            {blocked.length
              ? `${blocked.map(attrLabel).join(' and ')} ${blocked.length > 1 ? 'are' : 'is'} blocked. Left is what you wrote, right is how the system rewrote it. Hover a highlighted phrase to see why.`
              : 'Nothing is blocked, so your conversation is unchanged.'}
          </div>
        </div>

        {error && <div className="err">{error}</div>}

        {loading ? (
          <div className="diffloading">
            <span className="spin" />
            <span className="note">Rewriting your conversation…</span>
          </div>
        ) : (
          <>
            <div className="diffhead">
              <div>
                <span className="section">BEFORE · WHAT YOU WROTE</span>
                <span className="note">
                  {changes.length} phrase{changes.length === 1 ? '' : 's'} flagged
                </span>
              </div>
              <div>
                <span className="section">AFTER · SYSTEM REWRITE</span>
                <span className="note">
                  {changes.length} rewrite{changes.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <div className="diffscroll">
              {base.map((t, i) => (
                <div className="diffrow" key={i}>
                  <div className="diffcell">{cell('l', t, i)}</div>
                  <div className="diffcell">{cell('r', after[i] ?? t, i)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="footerbar" style={{ marginTop: 0 }}>
          <span className="note" style={{ flex: 1, textAlign: 'left' }}>
            You can still edit any message by hand afterwards.
          </span>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={onApply} disabled={loading || !result}>
            Apply rewrite
          </button>
        </div>
      </div>
    </div>
  );
}

function Why({ c }: { c: Change }) {
  return (
    <span className="whytip" onClick={(e) => e.stopPropagation()}>
      <span className="wh">
        ✦ {attrLabel(c.attr)} · {c.strategy}
      </span>
      <span className="wb">{c.reason}</span>
      <span className="wr" />
      <span className="wp">
        {c.before} → {c.after || '(removed)'}
      </span>
    </span>
  );
}
