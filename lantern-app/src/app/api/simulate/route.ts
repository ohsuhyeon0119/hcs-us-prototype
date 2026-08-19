import { NextResponse } from 'next/server';
import { inferAttributes, runTask } from '@/lib/openai';
import type { Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { preamble, draft, recipient, purpose, aiTask } = (await req.json()) as {
      preamble: Turn[];
      draft: string;
      recipient: string;
      purpose: string;
      aiTask: string;
    };
    // `draft` is already the policy-enforced message: what the assistant receives.
    const [inferences, output] = await Promise.all([
      inferAttributes(preamble ?? [], draft),
      runTask(preamble ?? [], draft, { recipient, purpose, aiTask }),
    ]);
    return NextResponse.json({ inferences, output, ranAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
