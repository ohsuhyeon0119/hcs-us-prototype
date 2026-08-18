'use client';
import { useState } from 'react';
import Chat from './Chat';
import RewriteModal from './RewriteModal';
import { ATTRIBUTES, ATTR_KEYS, attrLabel } from '@/lib/types';
import type {
  AttrKey, Change, Decision, Inference, Policy, RewriteResult, Scenario, SimulationResult, Turn,
} from '@/lib/types';

type HistoryEntry = { round: string; text: string };
const same = (a: Policy, b: Policy) => ATTR_KEYS.every((k) => a[k] === b[k]);

export default function Workspace({
  scenario, policy, setPolicy, turns, setTurns, history, pushHistory, log, onFinish,
}: {
  scenario: Scenario;
  policy: Policy;
  setPolicy: (p: Policy) => void;
  /** The participant's own words. Rewrites are always derived from these. */
  turns: Turn[];
  setTurns: (t: Turn[]) => void;
  history: HistoryEntry[];
  pushHistory: (e: HistoryEntry) => void;
  log: (type: string, payload: Record<string, unknown>) => void;
  onFinish: () => void;
}) {
  const [applied, setApplied] = useState<Turn[]>(turns);
  const [changes, setChanges] = useState<Change[]>([]);
  const [appliedPolicy, setAppliedPolicy] = useState<Policy>(policy);

  const [round, setRound] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [preview, setPreview] = useState<RewriteResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const dirty = !same(policy, appliedPolicy);
  const pending = ATTR_KEYS.filter((k) => policy[k] !== appliedPolicy[k]);
  const blocked = ATTR_KEYS.filter((k) => policy[k] === 'block');

  /* ---------------- policy ---------------- */
  const togglePolicy = (attr: AttrKey, next: Decision) => {
    if (policy[attr] === next) return;
    const before = policy[attr];
    setPolicy({ ...policy, [attr]: next });
    log('policy_edit', {
      target_attribute: attr,
      direction: next === 'block' ? 'tighten' : 'loosen',
      edit_type: 'policy',
      before_state: before,
      after_state: next,
      round,
      applied: false,
      preceding_simulation: result ? summarize(result, appliedPolicy) : null,
    });
  };

  /* ---------------- execute → rewrite ---------------- */
  const execute = async () => {
    setModal(true);
    setPreview(null);
    setPreviewError(null);
    setPreviewing(true);
    try {
      const r = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns, policy }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'rewrite failed');
      setPreview(d as RewriteResult);
      log('rewrite_preview', { policy, changes: d.changes });
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const applyRewrite = () => {
    if (!preview) return;
    setApplied(preview.turns);
    setChanges(preview.changes);
    setAppliedPolicy(policy);
    setModal(false);
    const byAttr = [...new Set(preview.changes.map((c) => attrLabel(c.attr)))];
    pushHistory({
      round: `R${round}`,
      text: preview.changes.length
        ? `Rewrite applied · ${preview.changes.length} phrase${preview.changes.length > 1 ? 's' : ''} (${byAttr.join(', ')})`
        : 'Policy applied · nothing to rewrite',
    });
    log('rewrite_apply', { policy, changes: preview.changes, round });
  };

  /* ---------------- manual edit ---------------- */
  const saveEdit = () => {
    if (editing === null) return;
    const original = applied[editing].text;
    if (draft.trim() === original.trim()) return setEditing(null);
    // An edit overrides both what is shown and the wording future rewrites start from.
    setApplied(applied.map((t, i) => (i === editing ? { ...t, text: draft } : t)));
    setTurns(turns.map((t, i) => (i === editing ? { ...t, text: draft } : t)));
    setChanges(changes.filter((c) => c.turnIndex !== editing));
    log('content_edit', {
      turn_index: editing, edit_type: 'content', original_text: original, edited_text: draft, round,
    });
    pushHistory({ round: `R${round}`, text: `Content edit · message ${editing + 1}` });
    setEditing(null);
  };

  /* ---------------- simulate ---------------- */
  const simulate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: applied,
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
      log('simulate', { round: next, result: summarize(d as SimulationResult, appliedPolicy) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const conflicts: Inference[] =
    result?.inferences.filter((i) => i.inferable && appliedPolicy[i.attr] === 'block') ?? [];
  const alsoInferable =
    result?.inferences.filter((i) => i.inferable && appliedPolicy[i.attr] !== 'block') ?? [];

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
          <div className="panelhead"><span className="t">A · MY POLICY</span></div>
          <div className="panelbody">
            <div className="grid6">
              {ATTRIBUTES.map((a) => (
                <div className="policyrow" key={a.key}>
                  <div className="labels"><div className="attr">{a.label}</div></div>
                  <div className="seg">
                    {(['allow', 'block'] as Decision[]).map((d) => (
                      <button key={d} className={policy[a.key] === d ? 'on' : ''}
                        onClick={() => togglePolicy(a.key, d)}>
                        {d === 'allow' ? 'Allow' : 'Block'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {dirty && (
              <div className="execblock">
                <div className="pending">
                  <i />
                  {pending.length} policy change{pending.length > 1 ? 's' : ''} not applied yet
                </div>
                <button className="execbtn" onClick={execute}>✦ Execute</button>
              </div>
            )}

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
            {changes.length > 0 && (
              <span className="r">{changes.length} phrases rewritten by your policy</span>
            )}
          </div>
          <div className="panelbody">
            <Chat turns={applied} changes={changes} onEdit={(i) => { setEditing(i); setDraft(applied[i].text); }} />
          </div>
        </div>

        {/* ---------------- Panel C ---------------- */}
        <div className="panel c">
          <div className="panelhead">
            <span className="t">C · SIMULATION</span>
            <div className="spacer" />
            <span className="r">
              {!result ? '' : conflicts.length
                ? `${conflicts.length} policy conflict${conflicts.length > 1 ? 's' : ''}`
                : 'no conflicts'}
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
                        <div><div className="k">My policy</div><div className="v">Block</div></div>
                        <div>
                          <div className="k">Simulation result</div>
                          <div className="v">Inferable{c.value ? ` — ${c.value}` : ''}</div>
                        </div>
                      </div>
                      <div className="cue">
                        <div className="k">
                          {c.cues.length ? 'Cue that enabled the inference' : 'No literal cue — inferred from context'}
                        </div>
                        <div className="q">
                          {c.cues.length ? c.cues.map((q) => `“${q}”`).join(', ') : c.reasoning}
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

      {modal && (
        <RewriteModal
          base={turns}
          result={preview}
          loading={previewing}
          error={previewError}
          blocked={blocked}
          onApply={applyRewrite}
          onCancel={() => { setModal(false); log('rewrite_cancel', { policy }); }}
        />
      )}

      {editing !== null && (
        <div className="modalwrap" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <span className="mtitle">Edit message</span>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => setEditing(null)}>✕</button>
            </div>
            <textarea className="ta" style={{ minHeight: 160, borderColor: 'var(--accent)' }}
              value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="note">
              Rewrite it however you like — delete, generalise, or make it ambiguous. Your edit
              replaces the system&apos;s wording and becomes what future rewrites start from.
            </div>
            <div className="footerbar" style={{ marginTop: 0 }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit}>Save</button>
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
