import { NextResponse } from 'next/server';
import { inferAttributes, runTask } from '@/lib/openai';
import { maskedTurns } from '@/lib/mask';
import type { Policy, Span, Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { turns, spans, policy, recipient, purpose, aiTask } = (await req.json()) as {
      turns: Turn[];
      spans: Span[];
      policy: Policy;
      recipient: string;
      purpose: string;
      aiTask: string;
    };
    // What the AI actually receives: the conversation after policy enforcement.
    const seen = maskedTurns(turns, spans ?? [], policy ?? {});
    const [inferences, output] = await Promise.all([
      inferAttributes(seen),
      runTask(seen, { recipient, purpose, aiTask }),
    ]);
    return NextResponse.json({
      inferences,
      output,
      maskedText: seen.map((t) => t.text),
      ranAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
