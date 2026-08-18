'use client';
import { useState } from 'react';
import Chat from './Chat';
import { ATTRIBUTES, attrLabel } from '@/lib/types';
import type { AttrKey, Decision, Inference, Policy, Scenario, SimulationResult, Span, Turn } from '@/lib/types';

type HistoryEntry = { round: string; text: string };

export default function Workspace({
  scenario,
  policy,
  setPolicy,
  turns,
  setTurns,
  spans,
  setSpans,
  history,
  pushHistory,
  log,
  onFinish,
}: {
  scenario: Scenario;
  policy: Policy;
  setPolicy: (p: Policy) => void;
  turns: Turn[];
  setTurns: (t: Turn[]) => void;
  spans: Span[];
  setSpans: (s: Span[]) => void;
  history: HistoryEntry[];
  pushHistory: (e: HistoryEntry) => void;
  log: (type: string, payload: Record<string, unknown>) => void;
  onFinish: () => void;
}) {
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const togglePolicy = (attr: AttrKey, next: Decision) => {
    if (policy[attr] === next) return;
    const before = policy[attr];
    setPolicy({ ...policy, [attr]: next });
    pushHistory({
      round: round === 0 ? 'R0' : `R${round}`,
      text: `${attrLabel(attr)} · ${before} → ${next}`,
    });
    log('policy_edit', {
      target_attribute: attr,
      direction: next === 'block' ? 'tighten' : 'loosen',
      edit_type: 'policy',
      before_state: before,
      after_state: next,
      round,
      preceding_simulation: result ? summarize(result, policy) : null,
    });
  };

  const openEdit = (i: number) => {
    setEditing(i);
    setDraft(turns[i].text);
  };

  const saveEdit = async () => {
    if (editing === null) return;
    const original = turns[editing].text;
    if (draft.trim() === original.trim()) {
      setEditing(null);
      return;
    }
    const next = turns.map((t, i) => (i === editing ? { ...t, text: draft } : t));
    setTurns(next);
    log('content_edit', {
      turn_index: editing,
      edit_type: 'content',
      original_text: original,
      edited_text: draft,
      round,
    });
    pushHistory({ round: `R${round}`, text: `Content edit · turn ${editing + 1}` });
    setEditing(null);
    // Re-annotate so masking stays correct after the edit.
    setBusy(true);
    try {
      const r = await fetch('/api/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: next }),
      });
      const d = await r.json();
      if (d.spans) setSpans(d.spans as Span[]);
    } catch {
      /* keep old spans */
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns,
          spans,
          policy,
          recipient: scenario.recipient,
          purpose: scenario.purpose,
          aiTask: scenario.aiTask,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'simulation failed');
      const next = round + 1;
      setResult(d as SimulationResult);
      setRound(next);
      log('simulate', { round: next, result: summarize(d as SimulationResult, policy) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const conflicts: Inference[] =
    result?.inferences.filter((i) => i.inferable && policy[i.attr] === 'block') ?? [];
  const alsoInferable =
    result?.inferences.filter((i) => i.inferable && policy[i.attr] !== 'block') ?? [];

  return (
    <>
      <div className="roundbar">
        <div className="roundblock">
          <span className="roundword">ROUND</span>
          <span className="roundnum">{String(round).padStart(2, '0')}</span>
        </div>
        <div className="pips">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={`pip ${i < round ? 'past' : i === round ? 'on' : ''}`} />
          ))}
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={onFinish}>
          I&apos;m satisfied with this setting
        </button>
      </div>

      <div className="panels">
        {/* ---------------- Panel A ---------------- */}
        <div className="panel a">
          <div className="panelhead">
            <span className="t">A · MY POLICY</span>
          </div>
          <div className="panelbody">
            <div className="grid6">
              {ATTRIBUTES.map((a) => (
                <div className="policyrow" key={a.key}>
                  <div className="labels">
                    <div className="attr">{a.label}</div>
                  </div>
                  <div className="seg">
                    {(['allow', 'block'] as Decision[]).map((d) => (
                      <button
                        key={d}
                        className={policy[a.key] === d ? 'on' : ''}
                        onClick={() => togglePolicy(a.key, d)}
                      >
                        {d === 'allow' ? 'Allow' : 'Block'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="spacer" />
            <div className="rule" />
            <div className="section">CHANGE HISTORY</div>
            <div className="history">
              {history.map((h, i) => (
                <div className="hrow" key={i}>
                  <span className="tag2">{h.round}</span>
                  <span className="e">{h.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------- Panel B ---------------- */}
        <div className="panel b">
          <div className="panelhead">
            <span className="t">B · CONTENT</span>
            <div className="spacer" />
            <span className="r">hover a masked phrase to see the original</span>
          </div>
          <div className="panelbody">
            <Chat turns={turns} spans={spans} policy={policy} onEdit={openEdit} />
          </div>
        </div>

        {/* ---------------- Panel C ---------------- */}
        <div className="panel c">
          <div className="panelhead">
            <span className="t">C · SIMULATION</span>
            <div className="spacer" />
            <span className="r">
              {!result ? '' : conflicts.length ? `${conflicts.length} policy conflict${conflicts.length > 1 ? 's' : ''}` : 'no conflicts'}
            </span>
          </div>
          <div className="panelbody">
            {error && <div className="err">{error}</div>}
            {!result ? (
              <div className="empty">
                <div className="t">Not simulated yet</div>
                <button className="btn primary" onClick={simulate} disabled={busy}>
                  {busy ? <span className="spin" /> : 'Simulate'}
                </button>
              </div>
            ) : (
              <>
                <div className="section">INFERRED INFORMATION</div>
                {conflicts.length === 0 ? (
                  <div className="outcard" style={{ alignItems: 'center', padding: 26 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>No conflicts</span>
                  </div>
                ) : (
                  conflicts.map((c) => (
                    <div className="infcard conflict" key={c.attr}>
                      <div className="top">
                        <span className="name">{attrLabel(c.attr)}</span>
                        <div className="spacer" />
                        <span className="badge conflict">Conflicts with my policy</span>
                      </div>
                      <div className="kv">
                        <div>
                          <div className="k">My policy</div>
                          <div className="v">Block</div>
                        </div>
                        <div>
                          <div className="k">Simulation result</div>
                          <div className="v">Inferable{c.value ? ` — ${c.value}` : ''}</div>
                        </div>
                      </div>
                      <div className="cue">
                        <div className="k">
                          {c.cues.length > 0 ? 'Cue that enabled the inference' : 'No literal cue — inferred from context'}
                        </div>
                        <div className="q">
                          {c.cues.length > 0 ? c.cues.map((q) => `“${q}”`).join(', ') : c.reasoning}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {alsoInferable.length > 0 && (
                  <div className="note">
                    Also inferable under your current policy:{' '}
                    {alsoInferable.map((i) => attrLabel(i.attr)).join(', ')}
                  </div>
                )}
                <div className="rule" />
                <div className="section">AI TASK OUTPUT</div>
                <div className="outcard">
                  <div className="head">
                    <span className="title">Output from current input</span>
                    <div className="spacer" />
                    <span className="tag">R{round}</span>
                  </div>
                  <div className="body">{result.output}</div>
                </div>
                <div className="spacer" />
                <button className="btn ghost" onClick={simulate} disabled={busy}>
                  {busy ? <span className="spin" /> : 'Run simulation again'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {editing !== null && (
        <div className="modalwrap" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <span className="mtitle">Edit message</span>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            <textarea
              className="ta"
              style={{ minHeight: 160, borderColor: 'var(--accent)' }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="note">
              Rewrite it however you like — delete, generalise, or make it ambiguous. Nothing is
              rewritten for you.
            </div>
            <div className="footerbar" style={{ marginTop: 0 }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function summarize(r: SimulationResult, policy: Policy) {
  return {
    inferred_attributes: r.inferences.filter((i) => i.inferable).map((i) => i.attr),
    policy_conflicts: r.inferences
      .filter((i) => i.inferable && policy[i.attr] === 'block')
      .map((i) => i.attr),
    task_output: r.output,
  };
}
