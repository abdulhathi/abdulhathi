// POST /api/run { chapterId, problemId, code, mode: "run" | "test" } → RunResult (server/runner.ts).
// This executes code on your machine, so it only accepts requests from the library page itself (custom header and
// Origin check; the dev server listens on localhost only), and each run has a time limit.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { z } from 'zod';
import { loadExercises, runCode } from './runner';

const Body = z.object({
  chapterId: z.string().regex(/^[a-z0-9-]+$/).max(80),
  problemId: z.string().regex(/^p-[a-z0-9-]+$/).max(200),
  code: z.string().max(100_000),
  mode: z.enum(['run', 'test']),
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fromLibraryPage(req: IncomingMessage) {
  if (req.headers['x-interview-library'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage, limit = 200_000) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** `root` holds the harness, .venv and node_modules; `exercisesRoot` holds exercises/ (the same folder, except in tests). */
export function createRunHandler(root: string, exercisesRoot = root) {
  let running = 0;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next();
    if (!fromLibraryPage(req)) return send(res, 403, { error: 'Requests must come from the Interview Library page.' });
    try {
      const parsed = Body.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) return send(res, 400, { error: 'Invalid request.' });
      const { chapterId, problemId, code, mode } = parsed.data;
      const exercise = loadExercises(exercisesRoot, chapterId)[problemId];
      if (!exercise) return send(res, 404, { error: 'This problem has no runnable exercise yet.' });
      if (running >= 4) return send(res, 429, { error: 'A few runs are already in progress. Try again in a moment.' });
      running++;
      try {
        return send(res, 200, await runCode(root, exercise, code, mode));
      } finally {
        running--;
      }
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}

export function runPlugin(root: string): Plugin {
  return {
    name: 'interview-library-runner',
    configureServer(server) {
      server.middlewares.use('/api/run', createRunHandler(root));
    },
  };
}
