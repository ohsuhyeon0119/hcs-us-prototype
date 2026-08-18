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
            <span className="mtitle">정책 적용</span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={onCancel}>
              ✕
            </button>
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            {blocked.length
              ? `차단된 정보: ${blocked.map(attrLabel).join(', ')}. 왼쪽은 작성하신 내용, 오른쪽은 시스템이 수정한 결과입니다. 강조된 문구에 마우스를 올리면 이유를 볼 수 있습니다.`
              : '차단된 정보가 없어 대화가 그대로 유지됩니다.'}
          </div>
        </div>

        {error && <div className="err">{error}</div>}

        {loading ? (
          <div className="diffloading">
            <span className="spin" />
            <span className="note">대화를 수정하는 중…</span>
          </div>
        ) : (
          <>
            <div className="diffhead">
              <div>
                <span className="section">수정 전 · 작성하신 내용</span>
                <span className="note">문구 {changes.length}개</span>
              </div>
              <div>
                <span className="section">수정 후 · 시스템 수정</span>
                <span className="note">수정 {changes.length}건</span>
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
            적용한 뒤에도 각 메시지를 직접 수정할 수 있습니다.
          </span>
          <button className="btn ghost" onClick={onCancel}>
            취소
          </button>
          <button className="btn primary" onClick={onApply} disabled={loading || !result}>
            수정 적용
          </button>
        </div>
      </div>
    </div>
  );
}

const STRATEGY: Record<string, string> = {
  generalised: '일반화',
  removed: '삭제',
  ambiguity: '모호화',
  other: '수정',
};

function Why({ c }: { c: Change }) {
  return (
    <span className="whytip" onClick={(e) => e.stopPropagation()}>
      <span className="wh">
        ✦ {attrLabel(c.attr)} · {STRATEGY[c.strategy] ?? c.strategy}
      </span>
      <span className="wb">{c.reason}</span>
    </span>
  );
}
