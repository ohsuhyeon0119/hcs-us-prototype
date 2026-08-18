'use client';
import type { ActionType, LogEvent } from './types';

export type Logger = ReturnType<typeof createLogger>;

/**
 * Every participant interaction goes through here, so each record carries the
 * same context (who, which scenario, which round) and a running sequence
 * number — the log can then be replayed in order without trusting timestamps.
 */
export function createLogger(participantId: string) {
  let seq = 0;
  let ctx: { scenarioId?: string; scenarioIndex?: number; round: number } = { round: 0 };

  const setContext = (c: Partial<typeof ctx>) => {
    ctx = { ...ctx, ...c };
  };

  const log = (action: ActionType, label: string, detail: Record<string, unknown> = {}) => {
    const e: LogEvent = {
      participantId,
      seq: ++seq,
      ts: new Date().toISOString(),
      scenarioId: ctx.scenarioId,
      scenarioIndex: ctx.scenarioIndex,
      round: ctx.round,
      action,
      label,
      detail,
    };
    return fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(e),
      keepalive: true,
    }).catch(() => {});
  };

  return { log, setContext };
}
