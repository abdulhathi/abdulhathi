// Client side of the editor: exercises (loaded per chapter), runs and reviews (dev-server endpoints), and the
// learner's drafts and solved problems (browser storage).
import { readJson, writeJson } from './storage';

export type Exercise = {
  language: 'python' | 'ts' | 'tsx' | 'sql' | 'sql-postgres';
  mode: 'asserts' | 'script' | 'typecheck' | 'rows';
  starter: string;
  prelude?: string;
  tests?: string;
  setup?: string;
  check?: string;
  expect?: unknown[][];
  ordered?: boolean;
  reference: string;
  solution?: string;
};
export type Failure = { line: number; code: string; message?: string; expected?: string; got?: string };
export type Table = { columns: string[]; rows: unknown[][]; count: number };
export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string | null;
  tests?: { passed: number; total: number; failures: Failure[] } | null;
  typeErrors?: string[];
  table?: Table;
  expected?: Table;
  ms: number;
};
export type Review = {
  verdict: 'strong' | 'acceptable' | 'needs work';
  score: number;
  summary: string;
  correctness: string[];
  complexity: { time: string; space: string; comment: string };
  readability: string[];
  edge_cases: string[];
  interviewer_questions: string[];
};

const files = import.meta.glob<Record<string, Exercise>>('../../exercises/*.json', { import: 'default' });
/** One chapter's exercises, loaded on demand (the editor is the only page that needs them). */
export async function loadExercise(chapterId: string, problemId: string): Promise<Exercise | undefined> {
  const load = files[`../../exercises/${chapterId}.json`];
  return load ? (await load())[problemId] : undefined;
}
export const hasExercises = (chapterId: string) => Boolean(files[`../../exercises/${chapterId}.json`]);

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Interview-Library': '1' }, body: JSON.stringify(body) });
    // A run result has its own `error` (your code raised); only a non-2xx answer means the request itself failed.
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok || !data) return { ok: false, error: (data as { error?: string } | null)?.error ?? `The library's server answered ${res.status}.` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Could not reach the library\'s dev server. Start the library with "npm run dev" or from Study Hub.' };
  }
}

export const runCode = (chapterId: string, problemId: string, code: string, mode: 'run' | 'test') =>
  post<RunResult>('/api/run', { chapterId, problemId, code, mode });

export const reviewCode = (input: { chapterId: string; problemId: string; code: string; language: string; tests?: string; model: string }) =>
  post<Review>('/api/evaluate/review', input);

// ---- drafts and solved problems ----
const DRAFTS = 'interview-library.code';
const SOLVED = 'interview-library.solved';
export type Solved = { at: number; ms?: number; runs: number };

export function readDraft(key: string): string | undefined {
  return readJson<Record<string, string>>(DRAFTS, {})[key];
}
export function writeDraft(key: string, code: string | undefined) {
  const all = readJson<Record<string, string>>(DRAFTS, {});
  if (code === undefined) delete all[key];
  else all[key] = code;
  writeJson(DRAFTS, all);
}
export function readSolved(): Record<string, Solved> {
  return readJson<Record<string, Solved>>(SOLVED, {});
}
export function markSolved(key: string, s: Solved) {
  writeJson(SOLVED, { ...readSolved(), [key]: s });
}

export const LANGUAGE_LABEL: Record<Exercise['language'], string> = {
  python: 'Python 3.14',
  ts: 'TypeScript (Node 25)',
  tsx: 'React + TypeScript',
  sql: 'SQL (SQLite)',
  'sql-postgres': 'SQL (PostgreSQL)',
};
