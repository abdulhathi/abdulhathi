// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEvaluator } from './evaluate';

const dir = mkdtempSync(join(tmpdir(), 'evaluator-'));
writeFileSync(
  join(dir, 'redis.md'),
  `---\ntitle: Redis\ngoal: g\nminutes: 5\n---\n\nIntro.\n\n## Interview questions\n\n### What is cache-aside? {core}\n\nThe app reads the cache first and loads from the database on a miss.\n`,
);

const feedback = (score: number) => ({
  score, verdict: 'pass', summary: 's', strengths: ['a'], missing: [], incorrect: [],
  grammar: [{ original: 'it go', corrected: 'it goes', note: 'agreement' }], speech_to_text: [], better_answer: 'b', follow_up: 'f',
});

function fakeClient(score: number | (() => never), opts: { authOk?: boolean; stop?: string } = {}) {
  const create = vi.fn(async () => {
    if (typeof score === 'function') score();
    return { model: 'claude-opus-5-5', stop_reason: opts.stop ?? 'end_turn', content: [{ type: 'text', text: JSON.stringify(feedback(score as number)) }] };
  });
  const retrieve = vi.fn(async () => {
    if (opts.authOk === false) throw new Error('Could not resolve authentication method');
    return { id: 'claude-opus-5-5' };
  });
  return { client: { beta: { messages: { create } }, models: { retrieve } } as unknown as Anthropic, create, retrieve };
}

let server: Server;
let base = '';
let current: ReturnType<typeof createEvaluator>;
beforeAll(async () => {
  server = createServer((req, res) => {
    req.url = req.url!.replace(/^\/api\/evaluate/, '') || '/';
    void current(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/evaluate`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ chapterId: 'redis', questionId: 'q-what-is-cache-aside', answer: 'You check the cache first.', attempt: 1, passMark: 80, model: 'claude-opus-5-5', ...over });
const post = (b: string, headers: Record<string, string> = { 'X-Interview-Library': '1' }) =>
  fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: b });

describe('the grader endpoint', () => {
  it('reports ready when the credentials work, and explains how to sign in when they do not', async () => {
    current = createEvaluator({ contentDir: dir, client: fakeClient(90).client });
    expect(await (await fetch(`${base}/status`)).json()).toMatchObject({ ready: true });
    current = createEvaluator({ contentDir: dir, client: fakeClient(90, { authOk: false }).client });
    const s = await (await fetch(`${base}/status`)).json();
    expect(s.ready).toBe(false);
    expect(s.reason).toMatch(/ant auth login/);
  });

  it('refuses requests that do not come from the library page', async () => {
    current = createEvaluator({ contentDir: dir, client: fakeClient(90).client });
    expect((await post(body(), {})).status).toBe(403);
    expect((await post(body(), { 'X-Interview-Library': '1', Origin: 'http://evil.example' })).status).toBe(403);
  });

  it('grades against the reference answer it reads from the chapter, and keeps the answer as untrusted data', async () => {
    const fake = fakeClient(91);
    current = createEvaluator({ contentDir: dir, client: fake.client });
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ score: 91, verdict: 'pass', grammar: [{ corrected: 'it goes' }] });
    const req = (fake.create.mock.calls[0] as unknown as [Record<string, unknown>])[0] as {
      model: string; fallbacks?: string; betas?: string[]; output_config: { format: { type: string } }; messages: { content: string }[];
    };
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.messages[0].content).toContain('loads from the database on a miss');
    expect(req.messages[0].content).toContain('<candidate_answer>\nYou check the cache first.\n</candidate_answer>');
  });

  it('sets the verdict from the pass mark and clamps the score, whatever the model wrote', async () => {
    current = createEvaluator({ contentDir: dir, client: fakeClient(72).client });
    expect(await (await post(body())).json()).toMatchObject({ score: 72, verdict: 'close' });
    current = createEvaluator({ contentDir: dir, client: fakeClient(130).client });
    expect(await (await post(body())).json()).toMatchObject({ score: 100, verdict: 'pass' });
    current = createEvaluator({ contentDir: dir, client: fakeClient(40).client });
    expect(await (await post(body())).json()).toMatchObject({ verdict: 'fail' });
  });

  it('sends no fallback for Haiku, which has none', async () => {
    const fake = fakeClient(90);
    current = createEvaluator({ contentDir: dir, client: fake.client });
    await post(body({ model: 'claude-haiku-5-5' }));
    const req = (fake.create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(req).not.toHaveProperty('fallbacks');
  });

  it('grades a follow-up with the original question as context', async () => {
    const fake = fakeClient(85);
    current = createEvaluator({ contentDir: dir, client: fake.client });
    await post(body({ followUp: 'How do you stop a cache stampede?' }));
    const content = ((fake.create.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0]).messages[0].content;
    expect(content).toContain('<original_question>\nWhat is cache-aside?');
    expect(content).toContain('<question>\nHow do you stop a cache stampede?\n</question>');
  });

  it('handles an unknown question, a refusal, and too many answers', async () => {
    current = createEvaluator({ contentDir: dir, client: fakeClient(90).client });
    expect((await post(body({ questionId: 'q-nope' }))).status).toBe(404);
    expect((await post(body({ chapterId: '../etc' }))).status).toBe(404);
    current = createEvaluator({ contentDir: dir, client: fakeClient(90, { stop: 'refusal' }).client });
    expect((await post(body())).status).toBe(502);
    let t = 0;
    current = createEvaluator({ contentDir: dir, client: fakeClient(90).client, now: () => t });
    for (let i = 0; i < 40; i++) expect((await post(body())).status).toBe(200);
    expect((await post(body())).status).toBe(429);
    t = 11 * 60_000; // ten minutes later the window has moved on
    expect((await post(body())).status).toBe(200);
  });

  it('rejects malformed requests', async () => {
    current = createEvaluator({ contentDir: dir, client: fakeClient(90).client });
    expect((await post(body({ answer: '' }))).status).toBe(400);
    expect((await post(body({ model: 'gpt-5' }))).status).toBe(400);
    expect((await post(body({ passMark: 20 }))).status).toBe(400);
  });
});
