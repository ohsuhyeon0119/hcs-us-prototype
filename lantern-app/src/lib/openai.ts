import { ATTRIBUTES, ATTR_KEYS } from './types';
import type { AttrKey, Change, Inference, Policy, RewriteResult, Span, Turn } from './types';

const API = 'https://api.openai.com/v1/chat/completions';

function cfg() {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1';
  if (!key) throw new Error('OPENAI_API_KEY is not set (expected in .env.local)');
  return { key, model };
}

async function json<T>(system: string, user: string): Promise<T> {
  const { key, model } = cfg();
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Model did not return JSON: ${String(content).slice(0, 300)}`);
  }
}

const catalog = ATTRIBUTES.map((a) => `- ${a.key} (${a.label}): ${a.hint}`).join('\n');

/** The conversation as the assistant receives it: the exchange so far, then the message. */
function conversation(preamble: Turn[], draft: string) {
  const head = preamble
    .map((t) => `${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${t.text}`)
    .join('\n');
  return `${head}\nUSER (the message being sent now):\n${draft}`;
}

/* ------------------------------------------------------------------ */
/* 1. Span annotation — which phrases in the draft disclose what        */
/* ------------------------------------------------------------------ */

export async function annotateSpans(draft: string): Promise<Span[]> {
  const sys = `You annotate personal-information disclosure in a message someone is about to send.

Attribute catalog:
${catalog}

Find the minimal literal phrases that explicitly state or directly reveal one of these attributes about the sender. Every phrase must be an EXACT substring of the message, copied character for character. Prefer the shortest phrase that still carries the disclosure.

Return JSON: {"spans":[{"attr":"<key>","text":"<exact substring>"}]}`;

  const out = await json<{ spans?: Span[] }>(sys, draft);
  const seen = new Set<string>();
  return (out.spans ?? []).filter((s) => {
    if (!ATTR_KEYS.includes(s.attr as AttrKey)) return false;
    if (typeof s.text !== 'string' || !s.text.trim()) return false;
    if (!draft.includes(s.text)) return false;
    const k = `${s.attr}|${s.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* 2. Inference — what the assistant could work out from what it gets   */
/* ------------------------------------------------------------------ */

export async function inferAttributes(preamble: Turn[], draft: string): Promise<Inference[]> {
  const sys = `You are a descriptive simulator that estimates what an AI assistant could infer about a user from the conversation it receives.

Attribute catalog:
${catalog}

Write "value" and "reasoning" in the same language the user writes in.

For each attribute in the catalog decide whether it is inferable from this conversation with reasonable confidence. If it is, state the value you would guess, and quote the exact phrases from the conversation that enabled it. Keep reasoning to one sentence. Do not moralise and do not recommend anything.

Return JSON: {"inferences":[{"attr":"<key>","inferable":<bool>,"value":"<short guess or empty>","cues":["<verbatim quote>"],"reasoning":"<one sentence>"}]} with one entry per catalog attribute.`;

  const out = await json<{ inferences?: Inference[] }>(sys, conversation(preamble, draft));
  const byKey = new Map((out.inferences ?? []).map((i) => [i.attr, i]));
  return ATTR_KEYS.map((k) => {
    const i = byKey.get(k);
    return {
      attr: k,
      inferable: Boolean(i?.inferable),
      value: i?.value ?? '',
      cues: Array.isArray(i?.cues) ? i!.cues.filter((c) => typeof c === 'string' && c.trim()) : [],
      reasoning: i?.reasoning ?? '',
    };
  });
}

/* ------------------------------------------------------------------ */
/* 3. Downstream task — what the assistant produces from the message    */
/* ------------------------------------------------------------------ */

export async function runTask(
  preamble: Turn[],
  draft: string,
  task: { recipient: string; purpose: string; aiTask: string },
): Promise<string> {
  const sys = `You are the user's AI assistant. Carry out the requested task using ONLY what the conversation gives you.

Recipient: ${task.recipient}
Purpose: ${task.purpose}
Task: ${task.aiTask}

Write the output in the same language the user writes in. Write only from what the conversation actually says. Never invent specifics it does not contain, and never remark that something seems missing — if the message is vague, let the output be vague.

Return JSON: {"output":"<the finished text>"}`;

  const out = await json<{ output?: string }>(sys, conversation(preamble, draft));
  return (out.output ?? '').trim();
}

/* ------------------------------------------------------------------ */
/* 4. Rewrite — enforce the policy by rewriting, not by blanking out    */
/* ------------------------------------------------------------------ */

/**
 * Always rewrites from the participant's own draft, never from a previously
 * rewritten version. That is what makes un-blocking work: the original wording
 * is still there to draw on, but the result is re-derived under the whole
 * current policy rather than restored verbatim.
 */
export async function rewriteForPolicy(base: string, policy: Policy): Promise<RewriteResult> {
  const blocked = ATTR_KEYS.filter((k) => policy[k] === 'block');
  const allowed = ATTR_KEYS.filter((k) => policy[k] !== 'block');
  if (blocked.length === 0) return { draft: base, changes: [] };

  const sys = `You rewrite a message someone is about to send so that a privacy policy holds, without damaging what they are asking for.

Attribute catalog:
${catalog}

BLOCKED (must not be inferable from anything explicitly stated): ${blocked.join(', ')}
ALLOWED (leave exactly as the sender wrote it): ${allowed.join(', ') || 'none'}

Rules:
1. For each blocked attribute, find the phrases that state or directly reveal it and either abstract them to something less specific, or drop them. Choose whichever keeps the message natural.
2. Preserve everything the request actually needs — constraints, dates, asks, tone, first person, casual register, paragraph breaks, and above all the language and speech level the sender writes in. A rewrite that makes the request unanswerable, or that switches language, is a failure.
3. Never touch a phrase only because it reveals an ALLOWED attribute. The sender chose to disclose those.
4. Change as little as possible. Leave untouched sentences byte-for-byte.
5. Never insert placeholders, asterisks, brackets, or any note that something was removed. The result must read as if the sender wrote it that way.

For every phrase you rewrite, report:
- "before": the exact substring of the ORIGINAL message you replaced, copied character for character.
- "after": the exact substring of YOUR REWRITTEN message that replaced it (empty string if you simply deleted it).
- "strategy": "generalised" if you made it less specific, "removed" if you deleted it, "ambiguity" if you made it vague.
- "reason": one or two sentences, in the same language the sender writes in — what the original phrase gave away, and why this replacement still lets the task succeed.

Return JSON: {"draft":"<the full rewritten message>","changes":[{"attr":"<key>","strategy":"...","before":"...","after":"...","reason":"..."}]}`;

  const out = await json<{ draft?: string; changes?: Change[] }>(sys, base);
  const draft = typeof out.draft === 'string' && out.draft.trim() ? out.draft : base;

  const changes = (out.changes ?? []).filter(
    (c) =>
      ATTR_KEYS.includes(c.attr as AttrKey) &&
      typeof c.before === 'string' &&
      c.before.length > 0 &&
      base.includes(c.before) &&
      typeof c.after === 'string' &&
      (c.after === '' || draft.includes(c.after)),
  );

  return { draft, changes };
}
