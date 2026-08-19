'use client';
import { useState } from 'react';
import { afterMarks, beforeMarks, segment } from '@/lib/highlight';
import { attrLabel } from '@/lib/types';
import type { Change, RewriteResult } from '@/lib/types';

const STRATEGY: Record<string, string> = {
  generalised: '일반화',
  removed: '삭제',
  ambiguity: '모호화',
  other: '수정',
};

export default function RewriteModal({
  base,
  result,
  loading,
  error,
  blocked,
  onApply,
  onCancel,
  readOnly = false,
}: {
  base: string;
  result: RewriteResult | null;
  loading: boolean;
  error: string | null;
  blocked: string[];
  onApply: () => void;
  onCancel: () => void;
  /** Reviewing an already-applied rewrite rather than approving a new one. */
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState<{ change: number; side: 'l' | 'r' } | null>(null);
  const changes = result?.changes ?? [];
  const after = result?.draft ?? base;

  const pane = (side: 'l' | 'r', text: string) => {
    const segs = segment(text, side === 'l' ? beforeMarks(changes) : afterMarks(changes));
    return (
      <div className="diffpane">
        {segs.map((s, j) => {
          if (s.change === undefined) return <span key={j}>{s.text}</span>;
          const on = hover?.change === s.change;
          return (
            <span
              key={j}
              className={`hl ${side === 'l' ? 'before' : 'after'} ${on ? 'pairon' : ''}`}
              onMouseEnter={() => setHover({ change: s.change!, side })}
              onMouseLeave={() => setHover(null)}
            >
              {s.text}
              {on && hover?.side === side && <Why c={changes[s.change]} />}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="modalwrap" onClick={onCancel}>
      <div className="modal diff" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="mhead">
            <span className="mtitle">{readOnly ? '적용된 수정 내용' : '정책 적용'}</span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={onCancel}>✕</button>
          </div>
          <div className="note" style={{ marginTop: 6 }}>
            {blocked.length
              ? `차단된 정보: ${blocked.map(attrLabel).join(', ')}. 왼쪽은 작성하신 내용, 오른쪽은 시스템이 수정한 결과입니다. 강조된 문구에 마우스를 올리면 이유를 볼 수 있습니다.`
              : '차단된 정보가 없어 메시지가 그대로 유지됩니다.'}
          </div>
        </div>

        {error && <div className="err">{error}</div>}

        {loading ? (
          <div className="diffloading">
            <span className="spin" />
            <span className="note">메시지를 수정하는 중…</span>
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
              <div className="diffcols">
                {pane('l', base)}
                {pane('r', after)}
              </div>
            </div>
          </>
        )}

        <div className="footerbar" style={{ marginTop: 0 }}>
          <span className="note" style={{ flex: 1, textAlign: 'left' }}>
            적용한 뒤에도 메시지를 직접 고쳐 쓸 수 있습니다.
          </span>
          {readOnly ? (
            <button className="btn primary" onClick={onCancel}>닫기</button>
          ) : (
            <>
              <button className="btn ghost" onClick={onCancel}>취소</button>
              <button className="btn primary" onClick={onApply} disabled={loading || !result}>
                수정 적용
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Why({ c }: { c: Change }) {
  return (
    <span className="whytip" onClick={(e) => e.stopPropagation()}>
      <span className="wh">✦ {attrLabel(c.attr)} · {STRATEGY[c.strategy] ?? c.strategy}</span>
      <span className="wb">{c.reason}</span>
    </span>
  );
}
