export const ATTRIBUTES = [
  { key: 'health', label: '건강', hint: '질병 · 치료 · 신체 상태' },
  { key: 'income', label: '소득', hint: '연봉 · 자산 · 부채' },
  { key: 'occupation', label: '직업', hint: '직종 · 업종 · 고용 형태' },
  { key: 'location', label: '위치', hint: '거주지 · 생활 반경' },
  { key: 'relationships', label: '관계', hint: '가족 · 연애 · 교우 관계' },
  { key: 'beliefs', label: '신념', hint: '종교 · 정치 성향 · 가치관' },
] as const;

export type AttrKey = (typeof ATTRIBUTES)[number]['key'];
export const ATTR_KEYS = ATTRIBUTES.map((a) => a.key) as AttrKey[];
export const attrLabel = (k: string) => ATTRIBUTES.find((a) => a.key === k)?.label ?? k;

export type Decision = 'allow' | 'block';
export type Policy = Record<string, Decision>;

export type Turn = { role: 'user' | 'assistant'; text: string };

/** A verbatim substring of turns[turnIndex].text that discloses `attr`. */
export type Span = { attr: AttrKey; turnIndex: number; text: string };

export type Scenario = {
  id: string;
  title: string;
  recipient: string;
  purpose: string;
  aiTask: string;
  /** Attributes the researchers expect this scenario to expose (matrix column). */
  exposed: AttrKey[];
  turns: Turn[];
  spans: Span[];
  annotatedAt?: string;
  createdAt: string;
};

export type RewriteStrategy = 'generalised' | 'removed' | 'ambiguity' | 'other';

/** One phrase the system rewrote because an attribute is blocked. */
export type Change = {
  turnIndex: number;
  attr: AttrKey;
  strategy: RewriteStrategy;
  /** Exact substring of the base turn that was rewritten. */
  before: string;
  /** Exact substring of the rewritten turn that replaced it ('' when deleted). */
  after: string;
  reason: string;
};

export type RewriteResult = { turns: Turn[]; changes: Change[] };

export type Inference = {
  attr: AttrKey;
  inferable: boolean;
  value: string;
  cues: string[];
  reasoning: string;
};

export type SimulationResult = {
  inferences: Inference[];
  output: string;
  maskedText: string[];
  ranAt: string;
};

export type ActionType =
  | 'session_start'
  | 'session_resume'
  | 'session_abandon'
  | 'demographics_submit'
  | 'scenario_start'
  | 'policy_toggle'
  | 'execute_click'
  | 'rewrite_preview'
  | 'rewrite_apply'
  | 'rewrite_cancel'
  | 'content_edit_open'
  | 'content_edit_save'
  | 'content_edit_cancel'
  | 'simulate_click'
  | 'simulate_result'
  | 'simulate_error'
  | 'finish_click'
  | 'reflection_submit'
  | 'scenario_end'
  | 'session_end';

/** One interaction. `label` reads as a sentence; `detail` carries what changed. */
export type LogEvent = {
  participantId: string;
  /** Monotonic within a session, so ordering survives clock skew. */
  seq: number;
  ts: string;
  scenarioId?: string;
  scenarioIndex?: number;
  round: number;
  action: ActionType;
  label: string;
  detail: Record<string, unknown>;
};
