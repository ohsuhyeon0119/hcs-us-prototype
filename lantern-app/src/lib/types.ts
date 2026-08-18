export const ATTRIBUTES = [
  { key: 'health', label: 'Health', hint: 'illness, treatment, physical condition' },
  { key: 'income', label: 'Income', hint: 'salary, assets, debt' },
  { key: 'occupation', label: 'Occupation', hint: 'job type, industry, employment' },
  { key: 'location', label: 'Location', hint: 'residence, daily radius' },
  { key: 'relationships', label: 'Relationships', hint: 'family, dating, friendships' },
  { key: 'beliefs', label: 'Beliefs', hint: 'religion, politics, values' },
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

export type LogEvent = {
  participantId: string;
  scenarioId?: string;
  ts: string;
  type:
    | 'session_start'
    | 'demographics'
    | 'baseline'
    | 'initial_policy'
    | 'policy_edit'
    | 'content_edit'
    | 'simulate'
    | 'reflection'
    | 'session_end';
  payload: Record<string, unknown>;
};
