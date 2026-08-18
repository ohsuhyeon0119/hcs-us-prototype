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
        ? `수정 적용 · 문구 ${preview.changes.length}개 (${byAttr.join(', ')})`
        : '정책 적용 · 수정할 문구 없음',
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
    pushHistory({ round: `R${round}`, text: `직접 수정 · 메시지 ${editing + 1}` });
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

  // Everything the simulator could work out, in catalogue order.
  const inferred: Inference[] = result?.inferences.filter((i) => i.inferable) ?? [];

  return (
    <>
      <div className="roundbar">
        <div className="roundblock">
          <span className="roundword">라운드</span>
          <span className="roundnum">{String(round).padStart(2, '0')}</span>
        </div>
        <div className="pips">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={`pip ${i < round ? 'past' : i === round ? 'on' : ''}`} />
          ))}
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={onFinish}>
          이 설정으로 마치기
        </button>
      </div>

      <div className="panels">
        {/* ---------------- Panel A ---------------- */}
        <div className="panel a">
          <div className="panelhead"><span className="t">A · 내 정책</span></div>
          <div className="panelbody">
            <div className="grid6">
              {ATTRIBUTES.map((a) => (
                <div className="policyrow" key={a.key}>
                  <div className="labels"><div className="attr">{a.label}</div></div>
                  <div className="seg">
                    {(['allow', 'block'] as Decision[]).map((d) => (
                      <button key={d} className={policy[a.key] === d ? 'on' : ''}
                        onClick={() => togglePolicy(a.key, d)}>
                        {d === 'allow' ? '허용' : '차단'}
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
                  적용되지 않은 정책 변경 {pending.length}건
                </div>
                <button className="execbtn" onClick={execute}>✦ 정책 적용하기</button>
              </div>
            )}

            <div className="spacer" />
            <div className="rule" />
            <div className="section">변경 기록</div>
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
            <span className="t">B · 대화 내용</span>
            <div className="spacer" />
            {changes.length > 0 && (
              <span className="r">정책에 따라 {changes.length}개 문구 수정됨</span>
            )}
          </div>
          <div className="panelbody">
            <Chat turns={applied} changes={changes} onEdit={(i) => { setEditing(i); setDraft(applied[i].text); }} />
          </div>
        </div>

        {/* ---------------- Panel C ---------------- */}
        <div className="panel c">
          <div className="panelhead">
            <span className="t">C · 시뮬레이션</span>
            <div className="spacer" />
            <span className="r">
              {result ? `추론 ${inferred.length}개` : ''}
            </span>
          </div>
          <div className="panelbody">
            {error && <div className="err">{error}</div>}
            {!result ? (
              <div className="empty">
                <div className="t">아직 시뮬레이션하지 않았습니다</div>
                <button className="btn primary" onClick={simulate} disabled={busy}>
                  {busy ? <span className="spin" /> : '시뮬레이션'}
                </button>
              </div>
            ) : (
              <>
                <div className="section">추론된 정보</div>
                {inferred.length === 0 ? (
                  <div className="outcard" style={{ alignItems: 'center', padding: 26 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>추론된 정보 없음</span>
                  </div>
                ) : (
                  inferred.map((c) => (
                    <div className="infcard" key={c.attr}>
                      <div className="top">
                        <span className="name">{attrLabel(c.attr)}</span>
                      </div>
                      {c.value && <div className="infval">{c.value}</div>}
                      <div className="cue">
                        <div className="k">
                          {c.cues.length ? '추론 근거가 된 표현' : '직접적인 표현 없음 — 맥락으로 추론됨'}
                        </div>
                        <div className="q">
                          {c.cues.length ? c.cues.map((q) => `“${q}”`).join(', ') : c.reasoning}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div className="rule" />
                <div className="section">AI 작업 결과</div>
                <div className="outcard">
                  <div className="head">
                    <span className="title">현재 입력 기준 결과</span>
                    <div className="spacer" />
                    <span className="tag">R{round}</span>
                  </div>
                  <div className="body">{result.output}</div>
                </div>
                <div className="spacer" />
                <button className="btn ghost" onClick={simulate} disabled={busy}>
                  {busy ? <span className="spin" /> : '다시 시뮬레이션'}
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
              <span className="mtitle">메시지 수정</span>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => setEditing(null)}>✕</button>
            </div>
            <textarea className="ta" style={{ minHeight: 160, borderColor: 'var(--accent)' }}
              value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="note">
              원하는 대로 고치세요 — 삭제하거나, 일반화하거나, 모호하게 만들 수 있습니다. 직접
              수정한 내용은 시스템 수정을 대체하고, 이후 수정의 기준이 됩니다.
            </div>
            <div className="footerbar" style={{ marginTop: 0 }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" onClick={saveEdit}>저장</button>
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
