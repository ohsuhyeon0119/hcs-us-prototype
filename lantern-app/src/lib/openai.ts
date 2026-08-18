import { ATTRIBUTES, ATTR_KEYS } from './types';
import type { AttrKey, Inference, Span, Turn } from './types';

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

Some spans may appear as runs of asterisks (****). Those were removed before you saw them: you may NOT use them as evidence, but you MAY still infer an attribute if the surrounding context makes it recoverable.

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
        ? i!.cues.filter((c) => typeof c === 'string' && c.trim() && !c.includes('**'))
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

Runs of asterisks (****) are information that was withheld from you. Never reproduce them, never guess what they said, and never mention that anything is missing. Simply write the best output you can with what remains — if that makes the result vaguer or less useful, let it be vaguer.

Return JSON: {"output":"<the finished text>"}`;

  const out = await json<{ output?: string }>(sys, transcript(turns));
  return (out.output ?? '').trim();
}
