import { NextResponse } from 'next/server';
import { listScenarios, upsertScenario } from '@/lib/store';
import type { Scenario } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await listScenarios());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Scenario>;
  const s: Scenario = {
    id: body.id || `s_${Date.now().toString(36)}`,
    title: body.title || 'Untitled scenario',
    recipient: body.recipient || '',
    purpose: body.purpose || '',
    aiTask: body.aiTask || '',
    exposed: body.exposed || [],
    preamble: body.preamble || [],
    draft: body.draft || '',
    spans: body.spans || [],
    annotatedAt: body.annotatedAt,
    createdAt: body.createdAt || new Date().toISOString(),
  };
  await upsertScenario(s);
  return NextResponse.json(s);
}
