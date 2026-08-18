import { NextResponse } from 'next/server';
import { annotateSpans } from '@/lib/openai';
import type { Turn } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { turns } = (await req.json()) as { turns: Turn[] };
    if (!Array.isArray(turns) || turns.length === 0)
      return NextResponse.json({ error: 'turns required' }, { status: 400 });
    const spans = await annotateSpans(turns);
    return NextResponse.json({ spans, annotatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
