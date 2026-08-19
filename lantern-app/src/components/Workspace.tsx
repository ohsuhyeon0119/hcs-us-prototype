'use client';
import { useRef, useState } from 'react';
import Transcript from './Transcript';
import RewriteModal from './RewriteModal';
import { ATTRIBUTES, ATTR_KEYS, attrLabel } from '@/lib/types';
import type {
  AttrKey, Change, Decision, Inference, Policy, RewriteResult, Scenario, SimulationResult,
} from '@/lib/types';
import type { Logger } from '@/lib/logger';

const same = (a: Policy, b: Policy) => ATTR_KEYS.every((k) => a[k] === b[k]);
const clip = (t: string, n = 34) => (t.length > n ? `${t.slice(0, n)}…` : t);

export default function Workspace({
  scenario, policy, setPolicy, draft, setDraft, logger, onFinish, restore,
}: {
  scenario: Scenario;
  policy: Policy;
  setPolicy: (p: Policy) => void;
  /** The participant's own words. Rewrites are always derived from these. */
  draft: string;
  setDraft: (d: string) => void;
  logger: Logger;
  onFinish: () => void;
  /** State rebuilt from the log when a session is resumed. */
  restore?: {
    appliedDraft: string;
    changes: Change[];
    appliedPolicy: Policy;
    round: number;
    result: SimulationResult | null;
  };
}) {
  const [applied, setApplied] = useState(restore?.appliedDraft ?? draft);
  const [changes, setChanges] = useState<Change[]>(restore?.changes ?? []);
  const [appliedPolicy, setAppliedPolicy] = useState<Policy>(restore?.appliedPolicy ?? policy);

  const [round, setRound] = useState(restore?.round ?? 0);
  const [result, setResult] = useState<SimulationResult | null>(restore?.result ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [preview, setPreview] = useState<RewriteResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const focusText = useRef(applied);

  const dec = (d?: string) => (d === 'block' ? '차단' : '허용');
  const readable = (p: Policy) => ATTR_KEYS.map((k) => `${attrLabel(k)} ${dec(p[k])}`).join(' · ');

  const dirty = !same(policy, appliedPolicy);
  const pending = ATTR_KEYS.filter((k) => policy[k] !== appliedPolicy[k]);
  const blocked = ATTR_KEYS.filter((k) => policy[k] === 'block');

  /* ---------------- policy ---------------- */
  const togglePolicy = (attr: AttrKey, next: Decision) => {
    if (policy[attr] === next) return;
    const before = policy[attr];
    const nextPolicy = { ...policy, [attr]: next } as Policy;
    setPolicy(nextPolicy);
    logger.log('policy_toggle', `A 패널 · ${attrLabel(attr)} ${dec(before)} → ${dec(next)}`, {
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
    });
  };

  /* ---------------- execute → rewrite ---------------- */
  const execute = async () => {
    logger.log('execute_click', `정책 적용하기 클릭 · 변경 ${pending.length}건`, {
      policy,
      policy_readable: readable(policy),
      pending: pending.map((k) => ({
        attribute: k, attribute_label: attrLabel(k), from: appliedPolicy[k], to: policy[k],
      })),
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
        body: JSON.stringify({ draft, policy }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'rewrite failed');
      setPreview(d as RewriteResult);
      logger.log('rewrite_preview', `수정 결과 생성 · 문구 ${d.changes.length}개`, {
        policy,
        blocked_attributes: blocked,
        changes: d.changes,
        draft_before: draft,
        draft_after: d.draft,
        latency_ms: Date.now() - t0,
      });
    } catch (e) {
      setPreviewError((e as Error).message);
      logger.log('rewrite_preview', '수정 결과 생성 실패', {
        error: (e as Error).message, latency_ms: Date.now() - t0,
      });
    } finally {
      setPreviewing(false);
    }
  };

  const applyRewrite = () => {
    if (!preview) return;
    const before = applied;
    setApplied(preview.draft);
    focusText.current = preview.draft;
    setChanges(preview.changes);
    setAppliedPolicy(policy);
    setModal(false);
    const byAttr = [...new Set(preview.changes.map((c) => attrLabel(c.attr)))];
    logger.log('rewrite_apply',
      preview.changes.length
        ? `수정 적용 · 문구 ${preview.changes.length}개 (${byAttr.join(', ')})`
        : '수정 적용 · 변경된 문구 없음',
      {
        policy_applied: policy,
        policy_applied_readable: readable(policy),
        policy_before_apply: appliedPolicy,
        changes: preview.changes,
        draft_before: before,
        draft_after: preview.draft,
      });
  };

  /* ---------------- the participant types in the box ---------------- */
  const commitEdit = () => {
    const before = focusText.current;
    if (applied.trim() === before.trim()) return;
    focusText.current = applied;
    // Their own words override both what is shown and what rewrites start from.
    setDraft(applied);
    const overrode = changes.length > 0;
    setChanges([]);
    logger.log('content_edit_save', `메시지 직접 수정 · “${clip(before)}” → “${clip(applied)}”`, {
      original_text: before,
      edited_text: applied,
      char_delta: applied.length - before.length,
      overrode_system_rewrite: overrode,
      dropped_changes: overrode ? changes : [],
    });
  };

  /* ---------------- simulate ---------------- */
  const simulate = async () => {
    logger.log('simulate_click', `시뮬레이션 실행 (라운드 ${round + 1})`, {
      draft: applied,
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
          preamble: scenario.preamble,
          draft: applied,
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
      logger.log('simulate_result',
        `라운드 ${next} 결과 · 추론 ${sum.inferred_attributes.length}개, 충돌 ${sum.policy_conflicts.length}건`,
        { round: next, draft: applied, inferences: d.inferences, ...sum, latency_ms: Date.now() - t0 });
    } catch (e) {
      setError((e as Error).message);
      logger.log('simulate_error', '시뮬레이션 실패', {
        error: (e as Error).message, latency_ms: Date.now() - t0,
      });
    } finally {
      setBusy(false);
    }
  };

  const inferred: Inference[] = result?.inferences.filter((i) => i.inferable) ?? [];

  return (
    <>
      <div className="roundbar">
        <div className="roundblock">
          <span className="roundword">라운드</span>
          <span className="roundnum">{String(round).padStart(2, '0')}</span>
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={onFinish}>이 설정으로 마치기</button>
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
                <div className="pending"><i />적용되지 않은 정책 변경 {pending.length}건</div>
                <button className="execbtn" onClick={execute}>✦ 정책 적용하기</button>
              </div>
            )}

          </div>
        </div>

        {/* ---------------- Panel B ---------------- */}
        <div className="panel b">
          <div className="panelhead"><span className="t">B · 보낼 메시지</span></div>
          <div className="panelbody nopad">
            <Transcript turns={scenario.preamble} />
            <div className="composer">
              <div className="composer-head">
                <span className="section">아직 보내지 않은 메시지</span>
              </div>
              <textarea
                className="draftbox"
                value={applied}
                onChange={(e) => setApplied(e.target.value)}
                onFocus={() => { focusText.current = applied; }}
                onBlur={commitEdit}
                spellCheck={false}
              />
              <div className="composer-foot">
                <div className="spacer" />
                <span className="note mono">{applied.length}자</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- Panel C ---------------- */}
        <div className="panel c">
          <div className="panelhead">
            <span className="t">C · 시뮬레이션</span>
            <div className="spacer" />

          </div>
          <div className="panelbody">
            {error && <div className="err">{error}</div>}
            {!result ? (
              <div className="empty">
                <div className="t">아직 시뮬레이션하지 않았습니다</div>
                <button className="btn primary" onClick={simulate} disabled={busy}>
                  {busy ? <span className="spin" /> : '추론 & 작업 simulate'}
                </button>
              </div>
            ) : (
              <>
                <div className="simblock">
                  <div className="simtitle">추론 시뮬레이션</div>
                {inferred.length === 0 ? (
                  <div className="outcard" style={{ alignItems: 'center', padding: 26 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>추론된 정보 없음</span>
                  </div>
                ) : (
                  inferred.map((c) => (
                    <div className="infcard" key={c.attr}>
                      <div className="top"><span className="name">{attrLabel(c.attr)}</span></div>
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
                </div>

                <div className="simblock">
                  <div className="simtitle">작업 시뮬레이션</div>
                  <div className="outcard">
                    <div className="head">
                      <span className="title">현재 메시지 기준 결과</span>
                      <div className="spacer" />
                      <span className="tag">R{round}</span>
                    </div>
                    <div className="body">{result.output}</div>
                  </div>
                </div>

                <div className="spacer" />
                <button className="btn ghost" onClick={simulate} disabled={busy}>
                  {busy ? <span className="spin" /> : '추론 & 작업 simulate'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <RewriteModal
          base={draft}
          result={preview}
          loading={previewing}
          error={previewError}
          blocked={blocked}
          onApply={applyRewrite}
          onCancel={() => {
            logger.log('rewrite_cancel', `수정 취소 · 문구 ${preview?.changes.length ?? 0}개 폐기`, {
              policy,
              discarded_changes: preview?.changes ?? [],
              policy_still_pending: pending,
            });
            setModal(false);
          }}
        />
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
