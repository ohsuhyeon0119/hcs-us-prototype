import { NextResponse } from 'next/server';
import { rewriteForPolicy } from '@/lib/openai';
import type { Policy } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { draft, policy } = (await req.json()) as { draft: string; policy: Policy };
    if (typeof draft !== 'string' || !draft.trim())
      return NextResponse.json({ error: 'draft required' }, { status: 400 });
    return NextResponse.json(await rewriteForPolicy(draft, policy ?? {}));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
