'use client';
import { useState } from 'react';
import Chat from './Chat';
import RewriteModal from './RewriteModal';
import { ATTRIBUTES, ATTR_KEYS, attrLabel } from '@/lib/types';
import type { Logger } from '@/lib/logger';
import type {
  AttrKey, Change, Decision, Inference, Policy, RewriteResult, Scenario, SimulationResult, Turn,
} from '@/lib/types';

type HistoryEntry = { round: string; text: string };
const same = (a: Policy, b: Policy) => ATTR_KEYS.every((k) => a[k] === b[k]);

export default function Workspace({
  scenario, policy, setPolicy, turns, setTurns, history, pushHistory, logger, onFinish,
}: {
  scenario: Scenario;
  policy: Policy;
  setPolicy: (p: Policy) => void;
  /** The participant's own words. Rewrites are always derived from these. */
  turns: Turn[];
  setTurns: (t: Turn[]) => void;
  history: HistoryEntry[];
  pushHistory: (e: HistoryEntry) => void;
  logger: Logger;
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

  const dec = (d?: string) => (d === 'block' ? '차단' : '허용');
  const readable = (p: Policy) =>
    ATTR_KEYS.map((k) => `${attrLabel(k)} ${dec(p[k])}`).join(' · ');
  const changedTurns = (a: Turn[], b: Turn[]) =>
    a.map((t, i) => ({ index: i, before: t.text, after: b[i]?.text ?? t.text }))
      .filter((x) => x.before !== x.after);

  const dirty = !same(policy, appliedPolicy);
  const pending = ATTR_KEYS.filter((k) => policy[k] !== appliedPolicy[k]);
  const blocked = ATTR_KEYS.filter((k) => policy[k] === 'block');

  /* ---------------- policy ---------------- */
  const togglePolicy = (attr: AttrKey, next: Decision) => {
    if (policy[attr] === next) return;
    const before = policy[attr];
    const nextPolicy = { ...policy, [attr]: next } as Policy;
    setPolicy(nextPolicy);
    logger.log(
      'policy_toggle',
      `A 패널 · ${attrLabel(attr)} ${dec(before)} → ${dec(next)}`,
      {
        target_attribute: attr,
        target_attribute_label: attrLabel(attr),
        direction: next === 'block' ? 'tighten' : 'loosen',
        before_state: before,
        after_state: next,
        policy_before: policy,
        policy_after: nextPolicy,
        policy_after_readable: readable(nextPolicy),
        applied_policy: appliedPolicy,
        pending_after: ATTR_KEYS.filter((k) => nextPolicy[k] !== appliedPolicy[k]),
        preceding_simulation: result ? summarize(result, appliedPolicy) : null,
      },
    );
  };

  /* ---------------- execute → rewrite ---------------- */
  const execute = async () => {
    const pendingDiff = pending.map((k) => ({
      attribute: k,
      attribute_label: attrLabel(k),
      from: appliedPolicy[k],
      to: policy[k],
    }));
    logger.log('execute_click', `정책 적용하기 클릭 · 변경 ${pending.length}건`, {
      policy,
      policy_readable: readable(policy),
      pending: pendingDiff,
    });
    setModal(true);
    setPreview(null);
    setPreviewError(null);
    setPreviewing(true);
    const t0 = Date.now();
    try {
      const r = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns, policy }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'rewrite failed');
      setPreview(d as RewriteResult);
      logger.log(
        'rewrite_preview',
        `수정 결과 생성 · 문구 ${d.changes.length}개`,
        {
          policy,
          blocked_attributes: blocked,
          changes: d.changes,
          changed_turns: changedTurns(turns, d.turns),
          latency_ms: Date.now() - t0,
        },
      );
    } catch (e) {
      setPreviewError((e as Error).message);
      logger.log('rewrite_preview', '수정 결과 생성 실패', {
        error: (e as Error).message,
        latency_ms: Date.now() - t0,
      });
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
    const diff = changedTurns(applied, preview.turns);
    pushHistory({
      round: `R${round}`,
      text: preview.changes.length
        ? `수정 적용 · 문구 ${preview.changes.length}개 (${byAttr.join(', ')})`
        : '정책 적용 · 수정할 문구 없음',
    });
    logger.log(
      'rewrite_apply',
      preview.changes.length
        ? `수정 적용 · 문구 ${preview.changes.length}개 (${byAttr.join(', ')})`
        : '수정 적용 · 변경된 문구 없음',
      {
        policy_applied: policy,
        policy_applied_readable: readable(policy),
        policy_before_apply: appliedPolicy,
        changes: preview.changes,
        changed_turns: diff,
      },
    );
  };

  /* ---------------- manual edit ---------------- */
  const saveEdit = () => {
    if (editing === null) return;
    const original = applied[editing].text;
    if (draft.trim() === original.trim()) {
      logger.log('content_edit_cancel', `메시지 ${editing + 1} 수정 취소 · 변경 없음`, {
        turn_index: editing,
      });
      return setEditing(null);
    }
    // An edit overrides both what is shown and the wording future rewrites start from.
    setApplied(applied.map((t, i) => (i === editing ? { ...t, text: draft } : t)));
    setTurns(turns.map((t, i) => (i === editing ? { ...t, text: draft } : t)));
    setChanges(changes.filter((c) => c.turnIndex !== editing));
    logger.log(
      'content_edit_save',
      `메시지 ${editing + 1} 직접 수정 · “${clip(original)}” → “${clip(draft)}”`,
      {
        turn_index: editing,
        original_text: original,
        edited_text: draft,
        char_delta: draft.length - original.length,
        overrode_system_rewrite: changes.some((c) => c.turnIndex === editing),
        dropped_changes: changes.filter((c) => c.turnIndex === editing),
      },
    );
    pushHistory({ round: `R${round}`, text: `직접 수정 · 메시지 ${editing + 1}` });
    setEditing(null);
  };

  /* ---------------- simulate ---------------- */
  const simulate = async () => {
    logger.log('simulate_click', `시뮬레이션 실행 (라운드 ${round + 1})`, {
      input_turns: applied,
      applied_policy: appliedPolicy,
      applied_policy_readable: readable(appliedPolicy),
      unapplied_policy_changes: pending,
    });
    setBusy(true);
    setError(null);
    const t0 = Date.now();
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
      logger.setContext({ round: next });
      const sum = summarize(d as SimulationResult, appliedPolicy);
      logger.log(
        'simulate_result',
        `라운드 ${next} 결과 · 추론 ${sum.inferred_attributes.length}개, 충돌 ${sum.policy_conflicts.length}건`,
        {
          round: next,
          input_turns: applied,
          inferences: d.inferences,
          ...sum,
          latency_ms: Date.now() - t0,
        },
      );
    } catch (e) {
      setError((e as Error).message);
      logger.log('simulate_error', '시뮬레이션 실패', {
        error: (e as Error).message,
        latency_ms: Date.now() - t0,
      });
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
            <Chat
              turns={applied}
              changes={changes}
              onEdit={(i) => {
                setEditing(i);
                setDraft(applied[i].text);
                logger.log('content_edit_open', `메시지 ${i + 1} 수정 시작`, {
                  turn_index: i,
                  current_text: applied[i].text,
                });
              }}
            />
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
          onCancel={() => {
            setModal(false);
            logger.log(
              'rewrite_cancel',
              `수정 취소 · 문구 ${preview?.changes.length ?? 0}개 폐기`,
              {
                policy,
                discarded_changes: preview?.changes ?? [],
                policy_still_pending: pending,
              },
            );
          }}
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

const clip = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n)}…` : t);

function summarize(r: SimulationResult, policy: Policy) {
  return {
    inferred_attributes: r.inferences.filter((i) => i.inferable).map((i) => i.attr),
    policy_conflicts: r.inferences
      .filter((i) => i.inferable && policy[i.attr] === 'block')
      .map((i) => i.attr),
    task_output: r.output,
  };
}
