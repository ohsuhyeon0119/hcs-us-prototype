import { listScenarios } from '@/lib/store';
import { attrLabel } from '@/lib/types';
import type { Scenario, Span } from '@/lib/types';

export const dynamic = 'force-dynamic';

const fmt = (t?: string) => (t ? new Date(t).toLocaleString('ko-KR') : '—');

export default async function ScenariosPage() {
  const scenarios = await listScenarios();

  return (
    <div className="adminwrap">
      <div className="right" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="block">
          <div className="phead">
            <div>
              <div className="pid-lg" style={{ fontFamily: 'var(--font)', fontSize: 20 }}>
                등록된 시나리오
              </div>
              <div className="note">
                참가자는 아래 순서대로 모든 시나리오를 진행합니다. 시나리오는{' '}
                <code className="mono">data/scenarios.json</code> 에서 관리합니다.
              </div>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="sn">{scenarios.length}</div>
              <div className="sl">시나리오</div>
            </div>
            <div className="stat">
              <div className="sn">{scenarios.reduce((n, s) => n + s.turns.length, 0)}</div>
              <div className="sl">전체 대화 턴</div>
            </div>
            <div className="stat">
              <div className="sn">{scenarios.reduce((n, s) => n + (s.spans?.length ?? 0), 0)}</div>
              <div className="sl">주석된 PII 문구</div>
            </div>
          </div>
        </div>

        {scenarios.length === 0 && (
          <div className="block empty-block">등록된 시나리오가 없습니다.</div>
        )}

        {scenarios.map((s, i) => (
          <ScenarioCard key={s.id} s={s} index={i} />
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({ s, index }: { s: Scenario; index: number }) {
  return (
    <div className="block">
      <div className="scenhead">
        <span className="idx">{index + 1}</span>
        <div>
          <div className="scentitle">{s.title}</div>
          <div className="note mono">
            {s.id} · {s.turns.length}턴 · 주석 {s.spans?.length ?? 0}개 · {fmt(s.annotatedAt)}
          </div>
        </div>
      </div>

      <div className="demogrid" style={{ gridTemplateColumns: '1fr', gap: 8 }}>
        <Row k="받는 사람" v={s.recipient} />
        <Row k="목적" v={s.purpose} />
        <Row k="AI가 할 일" v={s.aiTask} />
      </div>

      <div className="section" style={{ margin: '20px 0 8px' }}>노출하도록 설계된 속성</div>
      <div>
        {(s.exposed ?? []).length === 0 ? (
          <span className="note">지정되지 않음</span>
        ) : (
          s.exposed.map((k) => (
            <span className="pill" key={k} style={{ background: 'var(--ink)', color: '#fff' }}>
              {attrLabel(k)}
            </span>
          ))
        )}
      </div>

      <div className="section" style={{ margin: '20px 0 10px' }}>대화</div>
      <div className="scroller">
        <div className="thread">
          {s.turns.map((t, i) => (
            <div className={`turn ${t.role === 'user' ? 'u' : 'a'}`} key={i}>
              <div className={`bubble ${t.role === 'user' ? 'u' : 'a'}`}>{t.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ margin: '20px 0 10px' }}>
        속성별 PII 문구 · 정책 차단 시 수정 대상
      </div>
      {(s.spans?.length ?? 0) === 0 ? (
        <div className="note">주석된 문구가 없습니다.</div>
      ) : (
        <div className="spanlist">
          {s.spans.map((sp: Span, i: number) => (
            <div className="spanrow" key={i}>
              <span className="pill">{attrLabel(sp.attr)}</span>
              <span className="mono" style={{ color: 'var(--ink3)' }}>
                턴 {sp.turnIndex + 1}
              </span>
              <span className="sptext">“{sp.text}”</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="demo" style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
      <div className="dq" style={{ width: 80, flex: 'none' }}>{k}</div>
      <div className="da" style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{v}</div>
    </div>
  );
}
