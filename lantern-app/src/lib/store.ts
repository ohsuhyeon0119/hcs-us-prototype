import { promises as fs } from 'fs';
import path from 'path';
import type { Scenario, LogEvent } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SCENARIOS = path.join(DATA_DIR, 'scenarios.json');
const SESSIONS = path.join(DATA_DIR, 'sessions');

async function ensure() {
  await fs.mkdir(SESSIONS, { recursive: true });
  try {
    await fs.access(SCENARIOS);
  } catch {
    await fs.writeFile(SCENARIOS, '[]', 'utf8');
  }
}

export async function listScenarios(): Promise<Scenario[]> {
  await ensure();
  const raw = await fs.readFile(SCENARIOS, 'utf8');
  try {
    return JSON.parse(raw) as Scenario[];
  } catch {
    return [];
  }
}

export async function getScenario(id: string): Promise<Scenario | undefined> {
  return (await listScenarios()).find((s) => s.id === id);
}

export async function saveScenarios(all: Scenario[]) {
  await ensure();
  await fs.writeFile(SCENARIOS, JSON.stringify(all, null, 2), 'utf8');
}

export async function upsertScenario(s: Scenario) {
  const all = await listScenarios();
  const i = all.findIndex((x) => x.id === s.id);
  if (i >= 0) all[i] = s;
  else all.push(s);
  await saveScenarios(all);
  return s;
}

export async function deleteScenario(id: string) {
  await saveScenarios((await listScenarios()).filter((s) => s.id !== id));
}

export async function appendLog(e: LogEvent) {
  await ensure();
  const f = path.join(SESSIONS, `${e.participantId}.jsonl`);
  await fs.appendFile(f, JSON.stringify(e) + '\n', 'utf8');
}

export async function readLog(participantId: string): Promise<LogEvent[]> {
  await ensure();
  try {
    const raw = await fs.readFile(path.join(SESSIONS, `${participantId}.jsonl`), 'utf8');
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as LogEvent);
  } catch {
    return [];
  }
}

export async function listSessions(): Promise<string[]> {
  await ensure();
  const files = await fs.readdir(SESSIONS);
  return files.filter((f) => f.endsWith('.jsonl')).map((f) => f.replace(/\.jsonl$/, ''));
}
