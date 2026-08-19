'use client';
import { useEffect, useRef, useState } from 'react';
import Workspace from './Workspace';
import { ATTR_KEYS, attrLabel } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import type { Logger } from '@/lib/logger';
import type { ActionType } from '@/lib/types';
import type { Policy, Scenario, Turn } from '@/lib/types';

type Step = 'demographics' | 'scenario' | 'workspace' | 'reflection' | 'done';

const STEP_KO: Record<Step, string> = {
  demographics: '기본 정보 설문',
  scenario: '시나리오 소개',
  workspace: '워크스페이스',
  reflection: '회고',
  done: '완료 화면',
};
type HistoryEntry = { round: string; text: string };

const AGE = ['19–24세', '25–29세', '30–34세', '35–39세', '40세 이상', '응답하지 않음'];
const GENDER = ['여성', '남성', '논바이너리', '직접 기술', '응답하지 않음'];
const LLM_FREQ = ['매일', '주 몇 회', '월 몇 회', '거의 사용하지 않음'];
const YNU = ['예', '아니오', '잘 모르겠음'];
const STOP_REASONS = [
  '원하는 정보가 충분히 보호되었다',
  'AI 결과가 충분히 유용하다',
  '프라이버시와 유용성 사이에서 적절한 수준이라고 생각한다',
  '더 수정해도 크게 달라지지 않을 것 같다',
  '수정하는 것이 번거롭다',
  '기타',
];

export default function Study({ scenarios }: { scenarios: Scenario[] }) {
  const [pid, setPid] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('demographics');
  const [si, setSi] = useState(0);

  const [demo, setDemo] = useState<Record<string, string>>({});

  const [policy, setPolicy] = useState<Policy>({});
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stopReason, setStopReason] = useState('');
  const [stopText, setStopText] = useState('');

  const scenario = scenarios[si];

  const loggerRef = useRef<Logger | null>(null);
  const finished = useRef(false);
  const where = useRef<{ step: Step; si: number; policy: Policy }>({
    step: 'demographics',
    si: 0,
    policy: {},
  });

  // The session id lives in sessionStorage, so a reload continues the same log
  // instead of forking a new participant. Started here rather than during
  // render: a render also runs on the server, which was creating a throwaway
  // session on every page load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const KEY = 'lantern.participant';
      let id = sessionStorage.getItem(KEY);
      const resumed = Boolean(id);
      if (!id) {
        id = `P${Date.now().toString(36).slice(-6).toUpperCase()}`;
        sessionStorage.setItem(KEY, id);
      }
      let startSeq = 0;
      if (resumed) {
        try {
          const d = await (await fetch(`/api/log?participantId=${id}`)).json();
          startSeq = Math.max(0, ...(d.events ?? []).map((e: { seq: number }) => e.seq));
        } catch {
          /* start from zero */
        }
      }
      if (cancelled) return;
      const lg = createLogger(id, startSeq);
      loggerRef.current = lg;
      setPid(id);
      void lg.log(
        resumed ? 'session_resume' : 'session_start',
        resumed ? '세션 재진입 · 페이지 새로고침' : '세션 시작',
        { scenario_count: scenarios.length, resumed_from_seq: startSeq || undefined },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarios.length]);

  // Leaving mid-session is recorded, so an abandoned run is distinguishable
  // from one that merely stopped being logged.
  useEffect(() => {
    const onHide = () => {
      if (finished.current) return;
      const w = where.current;
      void loggerRef.current?.log('session_abandon', `중간 이탈 · ${STEP_KO[w.step]}`, {
        step: w.step,
        scenario_index: w.si,
        policy_at_exit: w.policy,
      });
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  where.current = { step, si, policy };

  const log = (action: ActionType, label: string, detail: Record<string, unknown> = {}) =>
    loggerRef.current?.log(action, label, detail) ?? Promise.resolve();

  const startScenario = (index: number) => {
    const s = scenarios[index];
    loggerRef.current?.setContext({ scenarioId: s.id, scenarioIndex: index, round: 0 });
    setPolicy(Object.fromEntries(ATTR_KEYS.map((k) => [k, 'allow'])) as Policy);
    setTurns(s.turns);
    setHistory([]);
    setStopReason('');
    setStopText('');
    setSi(index);
    setStep('scenario');
  };

  /* ------------------------------------------------------------------ */

  if (!pid)
    return (
      <Shell>
        <div className="card" style={{ textAlign: 'center' }}>
          <span className="spin" />
        </div>
      </Shell>
    );

  if (scenarios.length === 0)
    return (
      <Shell>
        <div className="card">
          <h1 className="title">등록된 시나리오가 없습니다</h1>
          <p className="note">
            세션을 시작하려면 <a className="link" href="/admin">어드민 페이지</a>에서 시나리오를 먼저
            등록해 주세요.
          </p>
        </div>
      </Shell>
    );

  if (step === 'demographics')
    return (
      <Shell>
        <div className="card">
          <div className="eyebrow">참가자 {pid}</div>
          <h1 className="title">기본 정보</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Choice label="연령" options={AGE} value={demo.age} onChange={(v) => setDemo({ ...demo, age: v })} />
            <Choice label="성별" options={GENDER} value={demo.gender} onChange={(v) => setDemo({ ...demo, gender: v })} />
            <Choice
              label="AI 챗 어시스턴트를 얼마나 자주 사용하시나요?"
              options={LLM_FREQ}
              value={demo.llmFreq}
              onChange={(v) => setDemo({ ...demo, llmFreq: v })}
            />
            <Choice
              label="AI 챗 어시스턴트에 본인의 개인정보를 입력해 본 적이 있나요?"
              options={YNU}
              value={demo.everDisclosed}
              onChange={(v) => setDemo({ ...demo, everDisclosed: v })}
            />
          </div>
          <div className="footerbar">
            <button
              className="btn primary"
              disabled={Object.keys(demo).length < 4}
              onClick={() => {
                log('demographics_submit', '기본 정보 설문 제출', { answers: demo });
                startScenario(0);
              }}
            >
              계속하기
            </button>
          </div>
        </div>
      </Shell>
    );

  if (step === 'scenario')
    return (
      <Shell>
        <div className="card">
          <div className="eyebrow">
            시나리오 {si + 1} / {scenarios.length}
          </div>
          <h1 className="title">{scenario.title}</h1>
          <div className="rule" />
          <div className="dl">
            <div className="row">
              <div className="k">받는 사람</div>
              <div className="v">{scenario.recipient}</div>
            </div>
            <div className="row">
              <div className="k">목적</div>
              <div className="v">{scenario.purpose}</div>
            </div>
            <div className="row">
              <div className="k">AI가 할 일</div>
              <div className="v">{scenario.aiTask}</div>
            </div>
          </div>
          <div className="footerbar">
            <button
              className="btn primary"
              onClick={() => {
                const init = Object.fromEntries(ATTR_KEYS.map((k) => [k, 'allow'])) as Policy;
                setPolicy(init);
                setHistory([{ round: 'INIT', text: '전체 허용' }]);
                log('scenario_start', `시나리오 ${si + 1} 시작 · 초기 정책 전체 허용`, {
                  scenario_title: scenario.title,
                  recipient: scenario.recipient,
                  purpose: scenario.purpose,
                  ai_task: scenario.aiTask,
                  initial_policy: init,
                  initial_turns: scenario.turns,
                });
                setStep('workspace');
              }}
            >
              계속하기
            </button>
          </div>
        </div>
      </Shell>
    );

  if (step === 'workspace')
    return (
      <>
        <TopBar pid={pid} right={`Scenario ${si + 1} / ${scenarios.length}`} />
        <Workspace
          scenario={scenario}
          policy={policy}
          setPolicy={setPolicy}
          turns={turns}
          setTurns={setTurns}
          history={history}
          pushHistory={(e) => setHistory((h) => [...h, e])}
          logger={loggerRef.current!}
          onFinish={() => {
            log('finish_click', '이 설정으로 마치기 클릭', { policy });
            setStep('reflection');
          }}
        />
      </>
    );

  if (step === 'reflection')
    return (
      <Shell pid={pid}>
        <div className="card">
          <div className="eyebrow">
            회고 · 시나리오 {si + 1} / {scenarios.length}
          </div>
          <h2 className="title">왜 여기에서 더 이상 수정하지 않기로 했나요?</h2>
          <div className="grid6">
            {STOP_REASONS.map((r) => (
              <label className={`opt ${stopReason === r ? 'on' : ''}`} key={r}>
                <input
                  type="radio"
                  name="stop"
                  checked={stopReason === r}
                  onChange={() => setStopReason(r)}
                />
                {r}
              </label>
            ))}
          </div>
          <div className="rule" />
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            현재 기준을 선택한 이유를 간단하게 설명해 주세요.
          </div>
          <textarea
            className="ta"
            value={stopText}
            onChange={(e) => setStopText(e.target.value)}
            placeholder="자유롭게 적어 주세요."
          />
          <div className="footerbar">
            <button
              className="btn primary"
              disabled={!stopReason}
              onClick={async () => {
                await log('reflection_submit', `회고 제출 · ${stopReason}`, {
                  stop_reason: stopReason,
                  explanation: stopText,
                  final_policy: policy,
                  final_policy_readable: ATTR_KEYS.map(
                    (k) => `${attrLabel(k)} ${policy[k] === 'block' ? '차단' : '허용'}`,
                  ).join(' · '),
                  final_turns: turns,
                });
                await log('scenario_end', `시나리오 ${si + 1} 종료`, {});
                if (si + 1 < scenarios.length) startScenario(si + 1);
                else {
                  finished.current = true;
                  await log('session_end', '세션 종료', {});
                  sessionStorage.removeItem('lantern.participant');
                  setStep('done');
                }
              }}
            >
              {si + 1 < scenarios.length ? '다음 시나리오로' : '마치기'}
            </button>
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell pid={pid}>
      <div className="card">
        <h1 className="title">감사합니다 — 세션이 끝났습니다.</h1>
        <p className="note">
          참가자 ID <b>{pid}</b>. 모든 수정 이벤트가{' '}
          <code>data/sessions/{pid}.jsonl</code> 에 기록되었습니다.
        </p>
      </div>
    </Shell>
  );
}

/* ---------------- small pieces ---------------- */

function TopBar({ pid, right }: { pid?: string; right?: string }) {
  return (
    <div className="topbar">
      <a className="wordmark" href="/">
        LANTERN
      </a>
      <div className="spacer" />
      {right && <span className="note">{right}</span>}
      {pid && <span className="pill" style={{ marginLeft: 12 }}>{pid}</span>}
    </div>
  );
}

function Shell({ children, pid }: { children: React.ReactNode; pid?: string }) {
  return (
    <>
      <TopBar pid={pid} />
      <div className="centerwrap">{children}</div>
    </>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <button
            key={o}
            className={`btn ghost sm ${value === o ? '' : ''}`}
            style={
              value === o
                ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' }
                : undefined
            }
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
