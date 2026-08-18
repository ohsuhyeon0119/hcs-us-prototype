'use client';
import { useEffect, useState } from 'react';
import { attrLabel } from '@/lib/types';
import type { LogEvent } from '@/lib/types';

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

const fmt = (t?: string | null) => (t ? new Date(t).toLocaleString() : '—');

export default function Sessions() {
  const [list, setList] = useState<Summary[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const d = await (await fetch('/api/log')).json();
    setList(d.sessions ?? []);
  };
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
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false));
  }, [sel]);

  const summary = list.find((s) => s.participantId === sel);
  const demo = (events.find((e) => e.type === 'demographics')?.payload ?? {}) as Record<string, string>;
  const scenarioIds = [...new Set(events.map((e) => e.scenarioId).filter(Boolean))] as string[];

  const downloadCsv = () => {
    const rows = [
      ['participant_id', 'scenario_id', 'timestamp', 'round', 'target_attribute', 'direction', 'edit_type', 'before_state', 'after_state', 'inferred_before', 'conflicts_before'],
      ...events
        .filter((e) => e.type === 'policy_edit' || e.type === 'content_edit')
        .map((e) => {
          const p = e.payload as Record<string, unknown>;
          const sim = (p.preceding_simulation ?? {}) as Record<string, string[]>;
          return [
            e.participantId, e.scenarioId ?? '', e.ts, String(p.round ?? ''),
            String(p.target_attribute ?? ''), String(p.direction ?? ''), String(p.edit_type ?? ''),
            String(p.before_state ?? ''), String(p.after_state ?? ''),
            (sim.inferred_attributes ?? []).join('|'), (sim.policy_conflicts ?? []).join('|'),
          ];
        }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${sel}_revisions.csv`;
    a.click();
  };

  return (
    <div className="adminwrap">
      <div className="split">
        <div className="left">
          <div className="section" style={{ padding: '4px 2px 6px' }}>
            SESSIONS ({list.length})
          </div>
          {list.length === 0 && <div className="note">No sessions recorded yet.</div>}
          {list.map((s) => (
            <button
              key={s.participantId}
              className={`sessionitem ${sel === s.participantId ? 'on' : ''}`}
              onClick={() => select(s.participantId)}
            >
              <div className="pid">
                {s.participantId} {s.completed ? '✓' : '·'}
              </div>
              <div className="meta">
                {fmt(s.startedAt)}
                <br />
                {s.scenarios.length} scenario{s.scenarios.length === 1 ? '' : 's'} · {s.revisions} revisions ·{' '}
                {s.simulations} simulations
              </div>
            </button>
          ))}
          <button className="btn ghost sm" onClick={load} style={{ marginTop: 6 }}>
            Refresh
          </button>
        </div>

        <div className="right">
          {!sel ? (
            <div className="block">
              <h3>SESSION DETAIL</h3>
              <div className="note">Pick a participant on the left.</div>
            </div>
          ) : loading ? (
            <div className="block">
              <span className="spin" />
            </div>
          ) : (
            <>
              <div className="block">
                <h3>SURVEY RESPONSE · {sel}</h3>
                {Object.keys(demo).length === 0 ? (
                  <div className="note">This participant did not complete the survey.</div>
                ) : (
                  DEMO_Q.map(([k, q]) => (
                    <div className="qa" key={k}>
                      <span className="q">{q}</span>
                      <span className="a">{demo[k] ?? '—'}</span>
                    </div>
                  ))
                )}
                <div className="note" style={{ marginTop: 12 }}>
                  Started {fmt(summary?.startedAt)} · last event {fmt(summary?.lastAt)} ·{' '}
                  {summary?.eventCount ?? 0} events
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn ghost sm" onClick={downloadCsv}>
                    Download revision events (CSV)
                  </button>
                  <a className="btn ghost sm" href={`/api/log?participantId=${sel}`} target="_blank" rel="noreferrer">
                    Raw JSON
                  </a>
                </div>
              </div>

              {scenarioIds.map((sid) => {
                const evs = events.filter((e) => e.scenarioId === sid);
                const init = evs.find((e) => e.type === 'initial_policy')?.payload as
                  | { policy: Record<string, string> }
                  | undefined;
                const refl = evs.find((e) => e.type === 'reflection')?.payload as
                  | { stop_reason: string; explanation: string; final_policy: Record<string, string> }
                  | undefined;
                const revs = evs.filter((e) => e.type === 'policy_edit' || e.type === 'content_edit');
                const sims = evs.filter((e) => e.type === 'simulate');
                return (
                  <div className="block" key={sid}>
                    <h3>SCENARIO · {sid}</h3>
                    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 16 }}>
                      <PolicyBox title="Initial policy" policy={init?.policy} />
                      <PolicyBox title="Final policy" policy={refl?.final_policy} />
                    </div>

                    <div className="section" style={{ marginBottom: 8 }}>
                      REVISION EVENTS ({revs.length})
                    </div>
                    {revs.length === 0 ? (
                      <div className="note">No revisions.</div>
                    ) : (
                      <table className="admin">
                        <thead>
                          <tr>
                            <th>#</th><th>Round</th><th>Type</th><th>Attribute</th>
                            <th>Direction</th><th>Before → After</th><th>Conflicts at the time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revs.map((e, i) => {
                            const p = e.payload as Record<string, any>;
                            const sim = p.preceding_simulation as { policy_conflicts?: string[] } | null;
                            return (
                              <tr key={i}>
                                <td className="mono">{i + 1}</td>
                                <td className="mono">R{p.round ?? 0}</td>
                                <td>{p.edit_type}</td>
                                <td>{p.target_attribute ? attrLabel(p.target_attribute) : `turn ${(p.turn_index ?? 0) + 1}`}</td>
                                <td className={p.direction ? `dir-${p.direction}` : ''}>{p.direction ?? '—'}</td>
                                <td className="mono">
                                  {p.edit_type === 'policy'
                                    ? `${p.before_state} → ${p.after_state}`
                                    : 'text rewritten'}
                                </td>
                                <td className="mono">
                                  {sim?.policy_conflicts?.length ? sim.policy_conflicts.join(', ') : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    <div className="section" style={{ margin: '18px 0 8px' }}>
                      SIMULATIONS ({sims.length})
                    </div>
                    {sims.map((e, i) => {
                      const r = (e.payload as any).result ?? {};
                      return (
                        <details className="raw" key={i}>
                          <summary className="mono" style={{ cursor: 'pointer' }}>
                            R{(e.payload as any).round} — inferred: {(r.inferred_attributes ?? []).join(', ') || 'none'} · conflicts:{' '}
                            {(r.policy_conflicts ?? []).join(', ') || 'none'}
                          </summary>
                          <pre>{r.task_output ?? ''}</pre>
                        </details>
                      );
                    })}

                    {refl && (
                      <>
                        <div className="section" style={{ margin: '18px 0 8px' }}>REFLECTION</div>
                        <div className="qa">
                          <span className="q">Why did you stop?</span>
                          <span className="a">{refl.stop_reason}</span>
                        </div>
                        {refl.explanation && (
                          <div className="note" style={{ marginTop: 10, fontSize: 14, color: 'var(--ink)' }}>
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
      <div className="section" style={{ marginBottom: 8 }}>{title.toUpperCase()}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(policy).map(([k, v]) => (
          <span
            key={k}
            className="pill"
            style={
              v === 'block'
                ? { background: 'var(--ink)', color: '#fff' }
                : { background: 'var(--chip)', color: 'var(--ink2)' }
            }
          >
            {attrLabel(k)} {v}
          </span>
        ))}
      </div>
    </div>
  );
}
