import { NextResponse } from 'next/server';
import { inferAttributes, runTask } from '@/lib/openai';
import type { Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { turns, recipient, purpose, aiTask } = (await req.json()) as {
      turns: Turn[];
      recipient: string;
      purpose: string;
      aiTask: string;
    };
    // `turns` is already the policy-enforced conversation: what the AI receives.
    const [inferences, output] = await Promise.all([
      inferAttributes(turns),
      runTask(turns, { recipient, purpose, aiTask }),
    ]);
    return NextResponse.json({ inferences, output, ranAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
