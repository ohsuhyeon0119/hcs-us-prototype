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

function transcript(turns: Turn[]) {
  return turns
    .map((t, i) => `[${i}] ${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${t.text}`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* 1. Span annotation — which literal phrases disclose which attribute  */
/* ------------------------------------------------------------------ */

export async function annotateSpans(turns: Turn[]): Promise<Span[]> {
  const sys = `You annotate personal-information disclosure in chat logs.

Attribute catalog:
${catalog}

For every USER turn, find the minimal literal phrases that explicitly state or directly reveal one of these attributes about the user. A phrase must be an EXACT substring of that turn, copied character for character. Prefer the shortest phrase that still carries the disclosure. Ignore assistant turns. If a turn discloses nothing, return nothing for it.

Return JSON: {"spans":[{"attr":"<key>","turnIndex":<int>,"text":"<exact substring>"}]}`;

  const out = await json<{ spans?: Span[] }>(sys, transcript(turns));
  const spans = (out.spans ?? []).filter(
    (s) =>
      ATTR_KEYS.includes(s.attr as AttrKey) &&
      typeof s.turnIndex === 'number' &&
      turns[s.turnIndex]?.role === 'user' &&
      typeof s.text === 'string' &&
      s.text.trim().length > 0 &&
      turns[s.turnIndex].text.includes(s.text),
  );
  // de-duplicate
  const seen = new Set<string>();
  return spans.filter((s) => {
    const k = `${s.attr}|${s.turnIndex}|${s.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* 2. Inference — what an adversary can work out from what it receives  */
/* ------------------------------------------------------------------ */

export async function inferAttributes(turns: Turn[]): Promise<Inference[]> {
  const sys = `You are a descriptive simulator that estimates what an AI system could infer about a user from a conversation it receives.

Attribute catalog:
${catalog}

For each attribute in the catalog decide whether it is inferable from this conversation with reasonable confidence. If it is, state the value you would guess, and quote the exact phrases from the conversation that enabled it (copy them verbatim; never quote asterisks). Keep reasoning to one sentence. Do not moralise and do not recommend anything.

Return JSON: {"inferences":[{"attr":"<key>","inferable":<bool>,"value":"<short guess or empty>","cues":["<verbatim quote>"],"reasoning":"<one sentence>"}]} with one entry per catalog attribute.`;

  const out = await json<{ inferences?: Inference[] }>(sys, transcript(turns));
  const byKey = new Map((out.inferences ?? []).map((i) => [i.attr, i]));
  return ATTR_KEYS.map((k) => {
    const i = byKey.get(k);
    return {
      attr: k,
      inferable: Boolean(i?.inferable),
      value: i?.value ?? '',
      cues: Array.isArray(i?.cues)
        ? i!.cues.filter((c) => typeof c === 'string' && c.trim())
        : [],
      reasoning: i?.reasoning ?? '',
    };
  });
}

/* ------------------------------------------------------------------ */
/* 3. Downstream task — the actual output the user asked the AI for     */
/* ------------------------------------------------------------------ */

export async function runTask(
  turns: Turn[],
  task: { recipient: string; purpose: string; aiTask: string },
): Promise<string> {
  const sys = `You are the user's AI assistant. Carry out the requested task using ONLY what the conversation gives you.

Recipient: ${task.recipient}
Purpose: ${task.purpose}
Task: ${task.aiTask}

Write only from what the conversation actually says. Never invent specifics it does not contain, and never remark that something seems missing — if the conversation is vague, let the output be vague.

Return JSON: {"output":"<the finished text>"}`;

  const out = await json<{ output?: string }>(sys, transcript(turns));
  return (out.output ?? '').trim();
}

/* ------------------------------------------------------------------ */
/* 4. Rewrite — enforce the policy by rewriting, not by blanking out    */
/* ------------------------------------------------------------------ */

/**
 * Always rewrites from the participant's own text (`base`), never from a
 * previously rewritten version. That is what makes un-blocking work: the
 * original wording is still there to draw on, but the result is re-derived
 * under the whole current policy rather than restored verbatim.
 */
export async function rewriteForPolicy(base: Turn[], policy: Policy): Promise<RewriteResult> {
  const blocked = ATTR_KEYS.filter((k) => policy[k] === 'block');
  const allowed = ATTR_KEYS.filter((k) => policy[k] !== 'block');

  if (blocked.length === 0) return { turns: base, changes: [] };

  const sys = `You rewrite a user's own chat messages so that a privacy policy holds, without damaging the conversation.

Attribute catalog:
${catalog}

BLOCKED (must not be inferable from anything explicitly stated): ${blocked.join(', ') || 'none'}
ALLOWED (leave exactly as the user wrote it): ${allowed.join(', ') || 'none'}

Rules:
1. Rewrite USER turns only. Copy ASSISTANT turns through unchanged.
2. For each blocked attribute, find the phrases that state or directly reveal it and either abstract them to something less specific, or drop them. Choose whichever keeps the message natural.
3. Preserve everything the user's request actually needs — constraints, dates, asks, tone, first person, casual register. A rewrite that makes the request unanswerable is a failure.
4. Never touch a phrase only because it reveals an ALLOWED attribute. The user chose to disclose those.
5. Change as little as possible. If a turn needs no change, return its text byte-for-byte.
6. Never insert placeholders, asterisks, brackets, or any note that something was removed. The result must read as if the user wrote it that way.

For every phrase you rewrite, report:
- "before": the exact substring of the ORIGINAL turn you replaced, copied character for character.
- "after": the exact substring of YOUR REWRITTEN turn that replaced it, copied character for character (empty string if you simply deleted it).
- "strategy": "generalised" if you made it less specific, "removed" if you deleted it, "ambiguity" if you made it vague.
- "reason": one or two sentences — what the original phrase gave away, and why this replacement still lets the task succeed.

Return JSON:
{"turns":[{"role":"user"|"assistant","text":"..."}],
 "changes":[{"turnIndex":<int>,"attr":"<key>","strategy":"...","before":"...","after":"...","reason":"..."}]}
The "turns" array must have exactly ${base.length} entries, in the original order.`;

  const out = await json<{ turns?: Turn[]; changes?: Change[] }>(sys, transcript(base));

  const turns: Turn[] = base.map((t, i) => {
    const r = out.turns?.[i];
    if (t.role === 'assistant' || !r || typeof r.text !== 'string' || !r.text.trim()) return t;
    return { role: 'user', text: r.text };
  });

  const changes = (out.changes ?? []).filter(
    (c) =>
      ATTR_KEYS.includes(c.attr as AttrKey) &&
      typeof c.turnIndex === 'number' &&
      base[c.turnIndex]?.role === 'user' &&
      typeof c.before === 'string' &&
      c.before.length > 0 &&
      base[c.turnIndex].text.includes(c.before) &&
      typeof c.after === 'string' &&
      (c.after === '' || turns[c.turnIndex].text.includes(c.after)),
  );

  return { turns, changes };
}
