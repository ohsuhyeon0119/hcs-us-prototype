import { NextResponse } from 'next/server';
import { readLog } from '@/lib/store';
import { replay } from '@/lib/replay';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('participantId')?.trim();
  if (!id) return NextResponse.json({ error: 'participantId required' }, { status: 400 });
  return NextResponse.json(replay(await readLog(id)));
}
