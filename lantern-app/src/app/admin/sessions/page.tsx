'use client';
import { useEffect, useState } from 'react';
import { attrLabel } from '@/lib/types';
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
  ['llmFreq', 'AI 챗 어시스턴트 사용 빈도'],
  ['everDisclosed', 'AI 챗에 개인정보를 입력해 본 경험'],
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
  rewrite_apply: 'act-accent',
  rewrite_preview: 'act-accent',
  rewrite_cancel: 'act-muted',
  content_edit_save: 'act-ink',
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
        <div className="left">
          <div className="section" style={{ padding: '4px 2px 6px' }}>세션 ({list.length})</div>
          {list.length === 0 && <div className="note">아직 기록된 세션이 없습니다.</div>}
          {list.map((s) => (
            <button key={s.participantId}
              className={`sessionitem ${sel === s.participantId ? 'on' : ''}`}
              onClick={() => select(s.participantId)}>
              <div className="pid">{s.participantId} {s.completed ? '✓' : '·'}</div>
              <div className="meta">
                {fmt(s.startedAt)}<br />
                시나리오 {s.scenarios.length} · 수정 {s.revisions} · 시뮬 {s.simulations}
              </div>
            </button>
          ))}
          <button className="btn ghost sm" onClick={load} style={{ marginTop: 6 }}>새로고침</button>
        </div>

        <div className="right">
          {!sel ? (
            <div className="block"><h3>세션 상세</h3><div className="note">왼쪽에서 참가자를 선택하세요.</div></div>
          ) : loading ? (
            <div className="block"><span className="spin" /></div>
          ) : (
            <>
              <div className="block">
                <h3>설문 응답 · {sel}</h3>
                {Object.keys(demo).length === 0 ? (
                  <div className="note">설문을 완료하지 않은 참가자입니다.</div>
                ) : (
                  DEMO_Q.map(([k, q]) => (
                    <div className="qa" key={k}>
                      <span className="q">{q}</span>
                      <span className="a">{demo[k] ?? '—'}</span>
                    </div>
                  ))
                )}
                <div className="note" style={{ marginTop: 12 }}>
                  시작 {fmt(summary?.startedAt)} · 마지막 {fmt(summary?.lastAt)} · 이벤트 {events.length}건
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn ghost sm" onClick={downloadCsv}>전체 기록 CSV</button>
                  <a className="btn ghost sm" href={`/api/log?participantId=${sel}`} target="_blank" rel="noreferrer">원본 JSON</a>
                </div>
              </div>

              {scenarioIds.map((sid) => {
                const evs = events.filter((e) => e.scenarioId === sid);
                const start = evs.find((e) => e.action === 'scenario_start')?.detail as any;
                const refl = evs.find((e) => e.action === 'reflection_submit')?.detail as any;
                const rounds = Math.max(0, ...evs.map((e) => e.round));
                return (
                  <div className="block" key={sid}>
                    <h3>시나리오 · {start?.scenario_title ?? sid}</h3>
                    <div className="note" style={{ marginBottom: 14 }}>
                      {sid} · 라운드 {rounds}회 · 인터랙션 {evs.length}건
                    </div>

                    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 18 }}>
                      <PolicyBox title="초기 정책" policy={start?.initial_policy} />
                      <PolicyBox title="최종 정책" policy={refl?.final_policy} />
                    </div>

                    <div className="section" style={{ marginBottom: 8 }}>인터랙션 기록</div>
                    <table className="admin">
                      <thead>
                        <tr><th>#</th><th>시각</th><th>R</th><th>액션</th><th>내용</th><th /></tr>
                      </thead>
                      <tbody>
                        {evs.map((e) => (
                          <tr key={e.seq}>
                            <td className="mono">{e.seq}</td>
                            <td className="mono" style={{ whiteSpace: 'nowrap' }}>{time(e.ts)}</td>
                            <td className="mono">{e.round}</td>
                            <td><span className={`actchip ${TONE[e.action] ?? ''}`}>{ACTION_KO[e.action] ?? e.action}</span></td>
                            <td>{e.label}</td>
                            <td style={{ width: 60 }}>
                              {e.detail && Object.keys(e.detail).length > 0 && (
                                <details className="raw">
                                  <summary className="mono" style={{ cursor: 'pointer' }}>상세</summary>
                                  <pre>{JSON.stringify(e.detail, null, 2)}</pre>
                                </details>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {refl && (
                      <>
                        <div className="section" style={{ margin: '18px 0 8px' }}>회고</div>
                        <div className="qa">
                          <span className="q">왜 여기에서 멈췄나?</span>
                          <span className="a">{refl.stop_reason}</span>
                        </div>
                        {refl.explanation && (
                          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
                            “{refl.explanation}”
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PolicyBox({ title, policy }: { title: string; policy?: Record<string, string> }) {
  if (!policy) return null;
  return (
    <div>
      <div className="section" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(policy).map(([k, v]) => (
          <span key={k} className="pill"
            style={v === 'block'
              ? { background: 'var(--ink)', color: '#fff' }
              : { background: 'var(--chip)', color: 'var(--ink2)' }}>
            {attrLabel(k)} {v === 'block' ? '차단' : '허용'}
          </span>
        ))}
      </div>
    </div>
  );
}
