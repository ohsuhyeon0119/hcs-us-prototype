import { NextResponse } from 'next/server';
import { rewriteForPolicy } from '@/lib/openai';
import type { Policy, Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { turns, policy } = (await req.json()) as { turns: Turn[]; policy: Policy };
    if (!Array.isArray(turns) || turns.length === 0)
      return NextResponse.json({ error: 'turns required' }, { status: 400 });
    const r = await rewriteForPolicy(turns, policy ?? {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
