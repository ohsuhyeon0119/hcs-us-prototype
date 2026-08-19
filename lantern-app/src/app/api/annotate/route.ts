import { NextResponse } from 'next/server';
import { annotateSpans } from '@/lib/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { draft } = (await req.json()) as { draft: string };
    if (typeof draft !== 'string' || !draft.trim())
      return NextResponse.json({ error: 'draft required' }, { status: 400 });
    return NextResponse.json({ spans: await annotateSpans(draft), annotatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
