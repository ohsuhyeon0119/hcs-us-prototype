'use client';
import { useCallback, useState } from 'react';
import Workspace from './Workspace';
import { ATTR_KEYS } from '@/lib/types';
import type { Policy, Scenario, Turn } from '@/lib/types';

type Step = 'demographics' | 'scenario' | 'workspace' | 'reflection' | 'done';
type HistoryEntry = { round: string; text: string };

const AGE = ['19–24', '25–29', '30–34', '35–39', '40+', 'Prefer not to say'];
const GENDER = ['Woman', 'Man', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'];
const LLM_FREQ = ['Daily', 'A few times a week', 'A few times a month', 'Rarely or never'];
const YNU = ['Yes', 'No', 'Not sure'];
const STOP_REASONS = [
  'The information I wanted protected is protected enough',
  'The AI output is useful enough',
  'This feels like the right balance between privacy and usefulness',
  'Revising further would not change much',
  'Revising is too much trouble',
  'Other',
];

export default function Study({ scenarios }: { scenarios: Scenario[] }) {
  const [pid] = useState(() => `P${Date.now().toString(36).slice(-6).toUpperCase()}`);
  const [step, setStep] = useState<Step>('demographics');
  const [si, setSi] = useState(0);

  const [demo, setDemo] = useState<Record<string, string>>({});

  const [policy, setPolicy] = useState<Policy>({});
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stopReason, setStopReason] = useState('');
  const [stopText, setStopText] = useState('');

  const scenario = scenarios[si];

  const log = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      return fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: pid,
          scenarioId: scenarios[si]?.id,
          ts: new Date().toISOString(),
          type,
          payload,
        }),
      });
    },
    [pid, si, scenarios],
  );

  const startScenario = (index: number) => {
    const s = scenarios[index];
    setPolicy(Object.fromEntries(ATTR_KEYS.map((k) => [k, 'allow'])) as Policy);
    setTurns(s.turns);
    setHistory([]);
    setStopReason('');
    setStopText('');
    setSi(index);
    setStep('scenario');
  };

  /* ------------------------------------------------------------------ */

  if (scenarios.length === 0)
    return (
      <Shell>
        <div className="card">
          <h1 className="title">No scenarios registered yet</h1>
          <p className="note">
            Add at least one scenario in the <a className="link" href="/admin">admin page</a> before
            running a session.
          </p>
        </div>
      </Shell>
    );

  if (step === 'demographics')
    return (
      <Shell>
        <div className="card">
          <div className="eyebrow">PARTICIPANT {pid}</div>
          <h1 className="title">About you</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Choice label="Age" options={AGE} value={demo.age} onChange={(v) => setDemo({ ...demo, age: v })} />
            <Choice label="Gender" options={GENDER} value={demo.gender} onChange={(v) => setDemo({ ...demo, gender: v })} />
            <Choice
              label="How often do you use AI chat assistants?"
              options={LLM_FREQ}
              value={demo.llmFreq}
              onChange={(v) => setDemo({ ...demo, llmFreq: v })}
            />
            <Choice
              label="Have you ever typed personal information about yourself into an AI chat assistant?"
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
                log('demographics', demo);
                startScenario(0);
              }}
            >
              Continue
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
            SCENARIO {si + 1} / {scenarios.length}
          </div>
          <h1 className="title">{scenario.title}</h1>
          <div className="rule" />
          <div className="dl">
            <div className="row">
              <div className="k">Recipient</div>
              <div className="v">{scenario.recipient}</div>
            </div>
            <div className="row">
              <div className="k">Purpose</div>
              <div className="v">{scenario.purpose}</div>
            </div>
            <div className="row">
              <div className="k">AI Task</div>
              <div className="v">{scenario.aiTask}</div>
            </div>
          </div>
          <div className="footerbar">
            <button
              className="btn primary"
              onClick={() => {
                const init = Object.fromEntries(ATTR_KEYS.map((k) => [k, 'allow'])) as Policy;
                setPolicy(init);
                setHistory([{ round: 'INIT', text: 'All attributes allow' }]);
                log('initial_policy', { policy: init, source: 'default' });
                setStep('workspace');
              }}
            >
              Continue
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
          log={log}
          onFinish={() => setStep('reflection')}
        />
      </>
    );

  if (step === 'reflection')
    return (
      <Shell pid={pid}>
        <div className="card">
          <div className="eyebrow">
            REFLECTION · SCENARIO {si + 1} / {scenarios.length}
          </div>
          <h2 className="title">Why did you decide to stop revising here?</h2>
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
            Briefly explain why you chose your current setting.
          </div>
          <textarea
            className="ta"
            value={stopText}
            onChange={(e) => setStopText(e.target.value)}
            placeholder="Type your answer here."
          />
          <div className="footerbar">
            <button
              className="btn primary"
              disabled={!stopReason}
              onClick={async () => {
                await log('reflection', {
                  stop_reason: stopReason,
                  explanation: stopText,
                  final_policy: policy,
                });
                if (si + 1 < scenarios.length) startScenario(si + 1);
                else {
                  await log('session_end', {});
                  setStep('done');
                }
              }}
            >
              {si + 1 < scenarios.length ? 'Next scenario' : 'Finish'}
            </button>
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell pid={pid}>
      <div className="card">
        <h1 className="title">Thank you — the session is complete.</h1>
        <p className="note">
          Participant ID <b>{pid}</b>. Every revision event was written to{' '}
          <code>data/sessions/{pid}.jsonl</code>.
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
