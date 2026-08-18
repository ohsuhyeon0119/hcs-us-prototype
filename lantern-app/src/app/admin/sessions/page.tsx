'use client';
import { useEffect, useState } from 'react';
import { ATTRIBUTES, attrLabel } from '@/lib/types';
import type { ActionType, LogEvent } from '@/lib/types';

type Summary = {
  participantId: string;
  startedAt: string | null;
  lastAt: string | null;
  eventCount: number;
  scenarios: string[];
  revisions: number;
  simulations: number;
  completed: boolean;
  demographics: Record<string, string>;
};

const DEMO_Q: [string, string][] = [
  ['age', '연령'],
  ['gender', '성별'],
  ['llmFreq', 'AI 챗 사용 빈도'],
  ['everDisclosed', '개인정보 입력 경험'],
];

const ACTION_KO: Record<ActionType, string> = {
  session_start: '세션 시작',
  demographics_submit: '설문 제출',
  scenario_start: '시나리오 시작',
  policy_toggle: '정책 변경',
  execute_click: '정책 적용 클릭',
  rewrite_preview: '수정안 생성',
  rewrite_apply: '수정 적용',
  rewrite_cancel: '수정 취소',
  content_edit_open: '직접 수정 시작',
  content_edit_save: '직접 수정 저장',
  content_edit_cancel: '직접 수정 취소',
  simulate_click: '시뮬레이션 실행',
  simulate_result: '시뮬레이션 결과',
  simulate_error: '시뮬레이션 실패',
  finish_click: '마치기 클릭',
  reflection_submit: '회고 제출',
  scenario_end: '시나리오 종료',
  session_end: '세션 종료',
};

const TONE: Partial<Record<ActionType, string>> = {
  policy_toggle: 'act-policy',
  execute_click: 'act-accent',
  rewrite_preview: 'act-accent',
  rewrite_apply: 'act-accent',
  rewrite_cancel: 'act-muted',
  content_edit_open: 'act-muted',
  content_edit_cancel: 'act-muted',
  content_edit_save: 'act-ink',
  simulate_click: 'act-sim',
  simulate_result: 'act-sim',
  simulate_error: 'act-err',
  reflection_submit: 'act-ink',
};

const pad = (n: number) => String(n).padStart(2, '0');
const time = (t?: string | null) => {
  if (!t) return '—';
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString('ko-KR') : '—');
const dec = (v?: string) => (v === 'block' ? '차단' : v === 'allow' ? '허용' : '—');

export default function Sessions() {
  const [list, setList] = useState<Summary[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => setList((await (await fetch('/api/log')).json()).sessions ?? []);
  useEffect(() => {
    void load();
    const p = new URLSearchParams(window.location.search).get('p');
    if (p) setSel(p);
  }, []);

  const select = (pid: string) => {
    setSel(pid);
    const u = new URL(window.location.href);
    u.searchParams.set('p', pid);
    window.history.replaceState(null, '', u.toString());
  };

  useEffect(() => {
    if (!sel) return;
    setLoading(true);
    fetch(`/api/log?participantId=${encodeURIComponent(sel)}`)
      .then((r) => r.json())
      .then((d) => setEvents((d.events ?? []).sort((a: LogEvent, b: LogEvent) => a.seq - b.seq)))
      .finally(() => setLoading(false));
  }, [sel]);

  const summary = list.find((s) => s.participantId === sel);
  const demo = (events.find((e) => e.action === 'demographics_submit')?.detail?.answers ??
    {}) as Record<string, string>;
  const scenarioIds = [...new Set(events.map((e) => e.scenarioId).filter(Boolean))] as string[];

  const downloadCsv = () => {
    const rows = [
      ['participant_id', 'seq', 'timestamp', 'scenario_id', 'scenario_index', 'round', 'action', 'label', 'detail_json'],
      ...events.map((e) => [
        e.participantId, e.seq, e.ts, e.scenarioId ?? '', e.scenarioIndex ?? '',
        e.round, e.action, e.label, JSON.stringify(e.detail ?? {}),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${sel}_history.csv`;
    a.click();
  };

  return (
    <div className="adminwrap">
      <div className="split">
        <aside className="left">
          <div className="section" style={{ padding: '2px 2px 4px' }}>세션 ({list.length})</div>
          {list.length === 0 && <div className="note">아직 기록된 세션이 없습니다.</div>}
          {list.map((s) => (
            <button key={s.participantId}
              className={`sessionitem ${sel === s.participantId ? 'on' : ''}`}
              onClick={() => select(s.participantId)}>
              <div className="si-top">
                <span className="pid">{s.participantId}</span>
                <span className={`dot ${s.completed ? 'done' : ''}`} />
              </div>
              <div className="meta">{fmt(s.startedAt)}</div>
              <div className="si-nums">
                <span>시나리오 {s.scenarios.length}</span>
                <span>수정 {s.revisions}</span>
                <span>시뮬 {s.simulations}</span>
              </div>
            </button>
          ))}
          <button className="btn ghost sm" onClick={load} style={{ marginTop: 4 }}>새로고침</button>
        </aside>

        <main className="right">
          {!sel ? (
            <div className="block empty-block">왼쪽에서 참가자를 선택하세요.</div>
          ) : loading ? (
            <div className="block empty-block"><span className="spin" /></div>
          ) : (
            <>
              {/* ---------- participant header ---------- */}
              <div className="block">
                <div className="phead">
                  <div>
                    <div className="pid-lg">{sel}</div>
                    <div className="note">{fmt(summary?.startedAt)} 시작 · 마지막 {fmt(summary?.lastAt)}</div>
                  </div>
                  <div className="spacer" />
                  <button className="btn ghost sm" onClick={downloadCsv}>전체 기록 CSV</button>
                  <a className="btn ghost sm" href={`/api/log?participantId=${sel}`} target="_blank" rel="noreferrer">원본 JSON</a>
                </div>

                <div className="stats">
                  <Stat n={events.length} l="이벤트" />
                  <Stat n={scenarioIds.length} l="시나리오" />
                  <Stat n={summary?.revisions ?? 0} l="수정" />
                  <Stat n={summary?.simulations ?? 0} l="시뮬레이션" />
                  <Stat n={summary?.completed ? '완료' : '중단'} l="상태" />
                </div>

                <div className="section" style={{ margin: '20px 0 10px' }}>설문 응답</div>
                {Object.keys(demo).length === 0 ? (
                  <div className="note">설문을 완료하지 않은 참가자입니다.</div>
                ) : (
                  <div className="demogrid">
                    {DEMO_Q.map(([k, q]) => (
                      <div className="demo" key={k}>
                        <div className="dq">{q}</div>
                        <div className="da">{demo[k] ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---------- one block per scenario ---------- */}
              {scenarioIds.map((sid, si) => {
                const evs = events.filter((e) => e.scenarioId === sid);
                const start = evs.find((e) => e.action === 'scenario_start')?.detail as any;
                const refl = evs.find((e) => e.action === 'reflection_submit')?.detail as any;
                const rounds = Math.max(0, ...evs.map((e) => e.round));
                return (
                  <div className="block" key={sid}>
                    <div className="scenhead">
                      <span className="idx">{si + 1}</span>
                      <div>
                        <div className="scentitle">{start?.scenario_title ?? sid}</div>
                        <div className="note mono">{sid} · 라운드 {rounds}회 · 인터랙션 {evs.length}건</div>
                      </div>
                    </div>

                    <PolicyDiff initial={start?.initial_policy} final={refl?.final_policy} />

                    <div className="section" style={{ margin: '22px 0 12px' }}>인터랙션 기록</div>
                    <Timeline events={evs} />

                    {refl && (
                      <div className="reflbox">
                        <div className="section" style={{ marginBottom: 10 }}>회고</div>
                        <div className="qa">
                          <span className="q">왜 여기에서 멈췄나?</span>
                          <span className="a">{refl.stop_reason}</span>
                        </div>
                        {refl.explanation && <div className="quote">“{refl.explanation}”</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="stat">
      <div className="sn">{n}</div>
      <div className="sl">{l}</div>
    </div>
  );
}

function PolicyDiff({
  initial,
  final,
}: {
  initial?: Record<string, string>;
  final?: Record<string, string>;
}) {
  if (!initial && !final) return null;
  return (
    <div className="pdiff">
      <div className="pdiff-head">
        <span />
        <span className="section">초기</span>
        <span />
        <span className="section">최종</span>
      </div>
      {ATTRIBUTES.map((a) => {
        const i = initial?.[a.key];
        const f = final?.[a.key];
        const changed = i && f && i !== f;
        return (
          <div className={`pdiff-row ${changed ? 'changed' : ''}`} key={a.key}>
            <span className="pl">{a.label}</span>
            <span className={`pv ${i === 'block' ? 'blk' : ''}`}>{dec(i)}</span>
            <span className="parrow">{changed ? '→' : ''}</span>
            <span className={`pv ${f === 'block' ? 'blk' : ''}`}>{f ? dec(f) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ events }: { events: LogEvent[] }) {
  let lastRound = -1;
  return (
    <div className="tl">
      {events.map((e) => {
        const newRound = e.round !== lastRound;
        lastRound = e.round;
        const hasDetail = e.detail && Object.keys(e.detail).length > 0;
        return (
          <div key={e.seq}>
            {newRound && (
              <div className="tl-round">
                <span>라운드 {e.round}</span>
                <i />
              </div>
            )}
            <div className="tl-item">
              <div className="tl-when">
                <div className="tl-time">{time(e.ts)}</div>
                <div className="tl-seq">#{e.seq}</div>
              </div>
              <div className="tl-rail">
                <span className={`tl-dot ${TONE[e.action] ?? ''}`} />
              </div>
              <div className="tl-body">
                <div className="tl-head">
                  <span className={`actchip ${TONE[e.action] ?? ''}`}>
                    {ACTION_KO[e.action] ?? e.action}
                  </span>
                  <span className="tl-label">{e.label}</span>
                </div>
                {hasDetail && (
                  <details className="raw">
                    <summary>상세</summary>
                    <pre>{JSON.stringify(e.detail, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
