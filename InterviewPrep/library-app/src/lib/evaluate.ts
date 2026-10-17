// Client for the dev server's grader (server/evaluate.ts).
export type Feedback = {
  score: number;
  verdict: 'pass' | 'close' | 'fail';
  summary: string;
  strengths: string[];
  missing: string[];
  incorrect: string[];
  grammar: { original: string; corrected: string; note: string }[];
  speech_to_text: string[];
  better_answer: string;
  follow_up: string;
  model: string;
};
export type GraderStatus = { ready: boolean; reason?: string; models?: string[] };

export const MODEL_LABEL: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (best feedback)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (faster)',
  'claude-haiku-5-5': 'Claude Haiku 5.5 (cheapest)',
};

export async function graderStatus(): Promise<GraderStatus> {
  try {
    const res = await fetch('/api/evaluate/status');
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
      return { ready: false, reason: 'The grader runs inside the library\'s dev server. Start the library with "npm run dev" (or from Study Hub).' };
    }
    return (await res.json()) as GraderStatus;
  } catch {
    return { ready: false, reason: 'Could not reach the library\'s dev server.' };
  }
}

export async function gradeAnswer(input: {
  chapterId: string;
  questionId: string;
  answer: string;
  attempt: number;
  passMark: number;
  model: string;
  followUp?: string;
}): Promise<{ ok: true; feedback: Feedback } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Interview-Library': '1' },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => null)) as (Feedback & { error?: string }) | null;
    if (!res.ok || !body || body.error) return { ok: false, error: body?.error ?? `The grader answered ${res.status}.` };
    return { ok: true, feedback: body };
  } catch {
    return { ok: false, error: 'Could not reach the grader. Is the library running with "npm run dev"?' };
  }
}
