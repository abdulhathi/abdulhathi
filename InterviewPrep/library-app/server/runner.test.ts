// @vitest-environment node
// The editor's runner end to end: real Python (.venv), Node and SQLite (and PostgreSQL when it is running).
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Exercise } from './runner';

// A short time limit so the infinite-loop test is quick; set before the runner module is loaded.
process.env.LIBRARY_RUN_TIMEOUT_MS = '1500';
const { runCode } = await import('./runner');
const { createRunHandler } = await import('./run-api');

const root = fileURLToPath(new URL('..', import.meta.url));
// Real processes (tsc, Python, PostgreSQL) can take several seconds on a busy machine.
vi.setConfig({ testTimeout: 60_000 });
const pgUp = spawnSync('pg_isready', { encoding: 'utf8' }).status === 0;

const py = (over: Partial<Exercise>): Exercise => ({ language: 'python', mode: 'asserts', starter: '', reference: '', ...over });
const ts = (over: Partial<Exercise>): Exercise => ({ language: 'ts', mode: 'asserts', starter: '', reference: '', ...over });

describe('Python exercises', () => {
  const ex = py({
    prelude: 'class Node:\n    def __init__(self, v):\n        self.v = v\n',
    tests: 'assert add(1, 2) == 3\nassert add(-1, 1) == 0\nassert Node(add(2, 2)).v == 4\n',
  });

  it('passes when every test statement passes', async () => {
    const r = await runCode(root, ex, 'def add(a, b):\n    return a + b\n', 'test');
    expect(r.ok).toBe(true);
    expect(r.tests).toMatchObject({ passed: 3, total: 3, failures: [] });
  });

  it('reports each failing test with the expected and actual values, and keeps going', async () => {
    const r = await runCode(root, ex, 'def add(a, b):\n    return a - b\n', 'test');
    expect(r.ok).toBe(false);
    expect(r.tests!.total).toBe(3);
    expect(r.tests!.failures[0]).toMatchObject({ code: 'assert add(1, 2) == 3', expected: '3', got: '-1' });
  });

  it('shows printed output on Run, without running the tests', async () => {
    const r = await runCode(root, ex, 'def add(a, b):\n    return a + b\nprint("hi", add(1, 1))\n', 'run');
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe('hi 2');
    expect(r.tests ?? null).toBeNull();
  });

  it('reports a syntax error as an error, not a crash', async () => {
    const r = await runCode(root, ex, 'def add(a, b)\n    return a + b\n', 'test');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SyntaxError/);
  });

  it('counts a test helper as a test when it is called, not when it is defined', async () => {
    const tests = 'def check(n):\n    assert add(n, 0) == n\n\ncheck(1)\ncheck(2)\n';
    const ok = await runCode(root, py({ tests }), 'def add(a, b):\n    return a + b\n', 'test');
    expect(ok.tests).toMatchObject({ passed: 2, total: 2 });
    const bad = await runCode(root, py({ tests }), 'def add(a, b):\n    return 0\n', 'test');
    expect(bad.tests).toMatchObject({ passed: 0, total: 2 });
  });

  it('runs script exercises as __main__', async () => {
    const r = await runCode(root, py({ mode: 'script', tests: 'assert __name__ == "__main__"\nassert double(4) == 8\n' }), 'def double(x):\n    return 2 * x\n', 'test');
    expect(r.ok).toBe(true);
  });

  it('stops an infinite loop at the time limit', async () => {
    const r = await runCode(root, ex, 'while True:\n    pass\n', 'test');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/more than 1.5 seconds/);
  });
});

describe('TypeScript exercises', () => {
  const ex = ts({ tests: "import { strict as assert } from 'node:assert';\nassert.equal(add(1, 2), 3);\nassert.equal(add(2, 2), 4);\n" });

  it('passes and counts the asserts', async () => {
    const r = await runCode(root, ex, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n', 'test');
    expect(r.ok).toBe(true);
    expect(r.tests).toMatchObject({ passed: 2, total: 2 });
    expect(r.typeErrors).toEqual([]);
  });

  it('reports the first failing assert', async () => {
    const r = await runCode(root, ex, 'export function add(a: number, b: number): number {\n  return a * b;\n}\n', 'test');
    expect(r.ok).toBe(false);
    expect(r.tests!.failures[0]).toMatchObject({ expected: '3', got: '2' });
  });

  it('knows modern library methods (toSorted, Object.groupBy), with no false type errors', async () => {
    const r = await runCode(root, ts({ tests: 'assert.deepEqual(sortedCopy([3, 1, 2]), [1, 2, 3]);\n' }), 'export function sortedCopy(xs: number[]): number[] {\n  const groups = Object.groupBy(xs, (x) => (x % 2 ? "odd" : "even"));\n  void groups;\n  return xs.toSorted((a, b) => a - b);\n}\n', 'test');
    expect(r.typeErrors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('accepts an import in your code that the given code already has', async () => {
    const ex2 = ts({ prelude: "import { createHash } from 'node:crypto';\nexport const given = 1;", tests: "assert.equal(digest('a').length, 64);\n" });
    const r = await runCode(root, ex2, "import { createHash } from 'node:crypto';\nexport function digest(s: string): string {\n  return createHash('sha256').update(s).digest('hex');\n}\n", 'test');
    expect(r.error ?? null).toBeNull();
    expect(r.ok).toBe(true);
  });

  it('reports type errors against your own line numbers', async () => {
    const r = await runCode(root, ex, 'export function add(a: number, b: number): number {\n  const s: string = a + b;\n  return a + b;\n}\n', 'test');
    expect(r.typeErrors!.join('\n')).toMatch(/your code, line 2/);
  });
});

describe('SQL exercises', () => {
  const ex: Exercise = {
    language: 'sql',
    mode: 'rows',
    starter: '',
    reference: '',
    setup: "CREATE TABLE t (id INTEGER, name TEXT);\nINSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c');",
    expect: [[3, 'c'], [2, 'b']],
    ordered: true,
  };

  it('compares your rows with the expected rows', async () => {
    const r = await runCode(root, ex, 'SELECT id, name FROM t WHERE id > 1 ORDER BY id DESC;', 'test');
    expect(r.ok).toBe(true);
    expect(r.table).toMatchObject({ columns: ['id', 'name'], count: 2 });
  });

  it('says when the rows are right but the order is wrong', async () => {
    const r = await runCode(root, ex, 'SELECT id, name FROM t WHERE id > 1 ORDER BY id;', 'test');
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toMatch(/order/i);
    expect(r.expected?.rows).toEqual([[3, 'c'], [2, 'b']]);
  });

  it('treats 100.0 and 100 as the same value when order does not matter', async () => {
    const r = await runCode(root, { ...ex, ordered: false, expect: [[100]] }, 'SELECT AVG(v) FROM (SELECT 100 AS v UNION ALL SELECT 100);', 'test');
    expect(r.ok).toBe(true);
  });

  it('reports an SQL error', async () => {
    const r = await runCode(root, ex, 'SELECT nope FROM t;', 'test');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/nope/);
  });

  it.skipIf(!pgUp)('runs PostgreSQL exercises in a throwaway database', async () => {
    const r = await runCode(root, { ...ex, language: 'sql-postgres' }, 'SELECT id, name FROM t WHERE id > 1 ORDER BY id DESC;', 'test');
    expect(r.ok).toBe(true);
    // Its database is dropped afterwards (other runs may be using theirs, so look only for this process's).
    const left = spawnSync('psql', ['-d', 'postgres', '-Atc', `SELECT count(*) FROM pg_database WHERE datname LIKE 'library_run_${process.pid}_%'`], { encoding: 'utf8' });
    if (left.status === 0) expect(left.stdout.trim()).toBe('0');
  });
});

it('cleans up its run folders', () => {
  const runs = join(root, '.runs');
  const mine = existsSync(runs) ? readdirSync(runs).filter((d) => d.startsWith(`${process.pid}-`)) : [];
  expect(mine).toEqual([]);
});

describe('POST /api/run', () => {
  const dir = join(tmpdir(), `run-api-${process.pid}`);
  let server: Server;
  let base = '';
  beforeAll(async () => {
    // Exercises come from a temporary folder; the code runs with the real harness, .venv and node_modules.
    mkdirSync(join(dir, 'exercises'), { recursive: true });
    writeFileSync(join(dir, 'exercises', 'demo.json'), JSON.stringify({ 'p-add': py({ tests: 'assert add(1, 2) == 3\n' }) }));
    const handler = createRunHandler(root, dir);
    server = createServer((req, res) =>
      void handler(req, res, () => {
        res.statusCode = 404;
        res.end();
      }),
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const a = server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
  });
  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (body: unknown, headers: Record<string, string> = { 'X-Interview-Library': '1' }) =>
    fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const good = { chapterId: 'demo', problemId: 'p-add', code: 'def add(a, b):\n    return a + b\n', mode: 'test' };

  it('runs the code and returns the result', async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, tests: { passed: 1, total: 1 } });
  });

  it('refuses requests from other pages', async () => {
    expect((await post(good, {})).status).toBe(403);
    expect((await post(good, { 'X-Interview-Library': '1', Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('rejects bad input and unknown problems', async () => {
    expect((await post({ ...good, chapterId: '../etc' })).status).toBe(400);
    expect((await post({ ...good, mode: 'shell' })).status).toBe(400);
    expect((await post({ ...good, problemId: 'p-nope' })).status).toBe(404);
  });
});
