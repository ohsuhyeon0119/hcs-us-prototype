import { NextResponse } from 'next/server';
import { appendLog, listSessions, readLog } from '@/lib/store';
import type { LogEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const e = (await req.json()) as LogEvent;
  if (!e?.participantId || !e?.type)
    return NextResponse.json({ error: 'participantId and type required' }, { status: 400 });
  await appendLog({ ...e, ts: e.ts || new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('participantId');
  if (id) return NextResponse.json({ events: await readLog(id) });

  const ids = await listSessions();
  const sessions = await Promise.all(
    ids.map(async (participantId) => {
      const events = await readLog(participantId);
      const demo = events.find((e) => e.type === 'demographics')?.payload ?? {};
      return {
        participantId,
        startedAt: events[0]?.ts ?? null,
        lastAt: events[events.length - 1]?.ts ?? null,
        eventCount: events.length,
        scenarios: [...new Set(events.map((e) => e.scenarioId).filter(Boolean))] as string[],
        revisions: events.filter((e) => e.type === 'policy_edit' || e.type === 'content_edit').length,
        simulations: events.filter((e) => e.type === 'simulate').length,
        completed: events.some((e) => e.type === 'session_end'),
        demographics: demo as Record<string, string>,
      };
    }),
  );
  sessions.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  return NextResponse.json({ sessions });
}
