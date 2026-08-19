import type { Change, LogEvent, Policy, SimulationResult } from './types';

export type HistoryEntry = { round: string; text: string };

export type Step = 'demographics' | 'scenario' | 'workspace' | 'reflection' | 'done';

export type ResumeState = {
  found: boolean;
  completed: boolean;
  abandoned: boolean;
  step: Step;
  scenarioIndex: number;
  demographics: Record<string, string>;
  policy: Policy;
  appliedPolicy: Policy;
  /** The participant's own words. */
  baseDraft: string;
  /** What the composer shows: base after the applied policy. */
  appliedDraft: string;
  changes: Change[];
  round: number;
  result: SimulationResult | null;
  history: HistoryEntry[];
  lastSeq: number;
  lastAt: string | null;
};

const empty = (): ResumeState => ({
  found: false,
  completed: false,
  abandoned: false,
  step: 'demographics',
  scenarioIndex: 0,
  demographics: {},
  policy: {},
  appliedPolicy: {},
  baseDraft: '',
  appliedDraft: '',
  changes: [],
  round: 0,
  result: null,
  history: [],
  lastSeq: 0,
  lastAt: null,
});

/**
 * Rebuilds where a participant was from their own log. Nothing extra is stored
 * for resuming: if an action is not in the log it did not happen, so the replay
 * and the analysis always agree.
 */
export function replay(events: LogEvent[]): ResumeState {
  const s = empty();
  if (events.length === 0) return s;
  s.found = true;

  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (const e of ordered) {
    const d = (e.detail ?? {}) as Record<string, any>;
    s.lastSeq = Math.max(s.lastSeq, e.seq);
    s.lastAt = e.ts;

    switch (e.action) {
      case 'demographics_submit':
        s.demographics = (d.answers ?? {}) as Record<string, string>;
        s.step = 'scenario';
        break;

      case 'scenario_start':
        s.scenarioIndex = e.scenarioIndex ?? s.scenarioIndex;
        s.policy = { ...(d.initial_policy ?? {}) };
        s.appliedPolicy = { ...(d.initial_policy ?? {}) };
        s.baseDraft = d.initial_draft ?? '';
        s.appliedDraft = d.initial_draft ?? '';
        s.changes = [];
        s.round = 0;
        s.result = null;
        s.history = [{ round: 'INIT', text: '전체 허용' }];
        s.step = 'workspace';
        break;

      case 'policy_toggle':
        if (d.policy_after) s.policy = { ...d.policy_after };
        break;

      case 'rewrite_apply':
        if (typeof d.draft_after === 'string') s.appliedDraft = d.draft_after;
        s.changes = (d.changes ?? []) as Change[];
        if (d.policy_applied) s.appliedPolicy = { ...d.policy_applied };
        s.history.push({
          round: `R${e.round}`,
          text: s.changes.length ? `수정 적용 · 문구 ${s.changes.length}개` : '정책 적용 · 수정할 문구 없음',
        });
        break;

      case 'content_edit_save':
        if (typeof d.edited_text === 'string') {
          s.baseDraft = d.edited_text;
          s.appliedDraft = d.edited_text;
        }
        s.changes = [];
        s.history.push({ round: `R${e.round}`, text: '메시지 직접 수정' });
        break;

      case 'simulate_result':
        s.round = d.round ?? e.round;
        s.result = {
          inferences: d.inferences ?? [],
          output: d.task_output ?? '',
          ranAt: e.ts,
        } as SimulationResult;
        break;

      case 'finish_click':
        s.step = 'reflection';
        break;

      case 'reflection_submit':
        s.step = 'scenario';
        s.scenarioIndex = (e.scenarioIndex ?? s.scenarioIndex) + 1;
        break;

      case 'session_end':
        s.completed = true;
        s.step = 'done';
        break;

      case 'session_abandon':
        s.abandoned = true;
        break;

      default:
        break;
    }
  }
  return s;
}
