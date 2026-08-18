import { NextResponse } from 'next/server';
import { deleteScenario, getScenario } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await getScenario(id);
  return s ? NextResponse.json(s) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteScenario(id);
  return NextResponse.json({ ok: true });
}
