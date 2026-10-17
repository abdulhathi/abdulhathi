// Runs code from the in-browser editor, with the same tools that verified every reference solution:
// the lab's Python (.venv), Node 25 for TypeScript (type stripping, plus a tsc type-check), and SQLite or the local
// PostgreSQL for SQL. Each run gets its own folder under .runs/ and a time limit; the process group is killed after it.
// This module has no Vite dependencies, so scripts/make-exercises.mjs can use it too.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Language = 'python' | 'ts' | 'tsx' | 'sql' | 'sql-postgres';
export type Exercise = {
  language: Language;
  /** asserts: run tests statement by statement · script: run code + tests as one file · typecheck: compile only · rows: compare SQL rows */
  mode: 'asserts' | 'script' | 'typecheck' | 'rows';
  starter: string;
  /** Code given to the learner, placed before their code (helper classes, test utilities). */
  prelude?: string;
  tests?: string;
  setup?: string;
  check?: string;
  expect?: unknown[][];
  ordered?: boolean;
  /** The whole reference code block, tests included. */
  reference: string;
  /** The part of the reference a learner would write (no tests): shown as the solution and used for validation. */
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

// LIBRARY_RUN_TIMEOUT_MS lets the tests check the time limit without waiting ten seconds.
const TIMEOUT_MS = Number(process.env.LIBRARY_RUN_TIMEOUT_MS) || 10_000;
const MAX_OUTPUT = 200_000;
let counter = 0;

function exec(cmd: string, args: string[], cwd: string, timeoutMs = TIMEOUT_MS): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', NO_COLOR: '1', FORCE_COLOR: '0' } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = (s: string, add: string) => (s.length > MAX_OUTPUT ? s : s + add);
    child.stdout.on('data', (d: Buffer) => (stdout = cap(stdout, d.toString())));
    child.stderr.on('data', (d: Buffer) => (stderr = cap(stderr, d.toString())));
    const kill = () => {
      try {
        process.kill(-child.pid!, 'SIGKILL'); // the whole group: child processes too
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      kill();
      resolve({ stdout, stderr, code, timedOut });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: String(e), code: -1, timedOut });
    });
  });
}

function parseResult(stdout: string): { result: Record<string, unknown> | null; rest: string } {
  const i = stdout.lastIndexOf('@@RESULT@@');
  if (i < 0) return { result: null, rest: stdout };
  const line = stdout.slice(i + 10).split('\n')[0];
  try {
    return { result: JSON.parse(line) as Record<string, unknown>, rest: stdout.slice(0, i).replace(/\n+$/, '') };
  } catch {
    return { result: null, rest: stdout };
  }
}

const TIMEOUT_MESSAGE = `Your code ran for more than ${TIMEOUT_MS / 1000} seconds and was stopped. Look for an infinite loop, or an await that never resolves.`;

// ---------- Python ----------

async function runPython(root: string, dir: string, ex: Exercise, code: string, mode: 'run' | 'test'): Promise<Omit<RunResult, 'ms'>> {
  const job = { mode: mode === 'run' ? 'run' : ex.mode === 'script' ? 'script' : 'asserts', prelude: ex.prelude ?? '', code, tests: ex.tests ?? '' };
  writeFileSync(join(dir, 'job.json'), JSON.stringify(job));
  const python = join(root, '.venv', 'bin', 'python');
  const r = await exec(python, ['-I', join(root, 'server', 'harness', 'py_runner.py'), join(dir, 'job.json')], dir);
  if (r.timedOut) return { ok: false, stdout: r.stdout.slice(-20_000), stderr: '', error: TIMEOUT_MESSAGE };
  const { result } = parseResult(r.stdout);
  if (!result) return { ok: false, stdout: r.stdout.slice(-20_000), stderr: r.stderr.slice(-20_000), error: r.stderr.trim().split('\n').slice(-8).join('\n') || 'The run failed without output.' };
  const out = result as unknown as Omit<RunResult, 'ms'>;
  return { ...out, stdout: (out.stdout ?? '').replace(/\n+$/, '') };
}

// ---------- TypeScript ----------

const ASSERT_IMPORT = /^\s*import\s+(?:\*\s+as\s+assert|assert|\{\s*strict\s+as\s+assert\s*\})\s+from\s+['"]node:assert(?:\/strict)?['"];?\s*$/gm;
const IMPORT_LINE = /^\s*import\s[^;]*?from\s+['"][^'"]+['"];?\s*$|^\s*import\s+['"][^'"]+['"];?\s*$/gm;

const HEADER = `import __assertModule from 'node:assert/strict';
const __r: { passed: number; failure: null | Record<string, unknown> } = { passed: 0, failure: null };
const __count = (v: unknown) => {
  if (v && typeof (v as Promise<unknown>).then === 'function') return (v as Promise<unknown>).then((x) => { __r.passed++; return x; });
  __r.passed++;
  return v;
};
const assert: typeof __assertModule = new Proxy(__assertModule, {
  apply: (t, self, args) => __count(Reflect.apply(t as (...a: unknown[]) => unknown, self, args)),
  get: (t, k) => {
    const v = Reflect.get(t, k);
    return typeof v === 'function' ? (...a: unknown[]) => __count((v as (...a: unknown[]) => unknown).apply(t, a)) : v;
  },
}) as typeof __assertModule;
const __describe = (e: unknown) => {
  const err = e as { name?: string; message?: string; actual?: unknown; expected?: unknown; operator?: string; stack?: string };
  const show = (v: unknown) => { try { const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() + 'n' : x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x)); return (s ?? String(v)).slice(0, 300); } catch { return String(v).slice(0, 300); } };
  return { name: err?.name ?? 'Error', message: String(err?.message ?? e).split('\\n').slice(0, 12).join('\\n'), actual: 'actual' in (err ?? {}) ? show(err.actual) : undefined, expected: 'expected' in (err ?? {}) ? show(err.expected) : undefined, stack: err?.stack ?? '' };
};
const __done = () => process.stdout.write('\\n@@RESULT@@' + JSON.stringify(__r) + '\\n');
process.on('uncaughtException', (e) => { __r.failure ??= __describe(e); __done(); process.exit(1); });
process.on('unhandledRejection', (e) => { __r.failure ??= __describe(e); __done(); process.exit(1); });
`;

type Section = { name: 'given code' | 'your code' | 'tests'; start: number; lines: number };

// Removed lines become blank lines, so line numbers in errors still match what the learner sees.
const blank = (line: string) => '\n'.repeat((line.match(/\n/g) ?? []).length);

function composeTs(ex: Exercise, code: string, withTests: boolean) {
  const strip = (s: string) => s.replace(ASSERT_IMPORT, blank);
  const prelude = strip(ex.prelude ?? '');
  const given = new Set((prelude.match(IMPORT_LINE) ?? []).map((l) => l.trim()));
  // The same import in the given code and in your code would be declared twice: keep the given one.
  const user = strip(code).replace(IMPORT_LINE, (l) => (given.has(l.trim()) ? blank(l) : l));
  let tests = withTests ? strip(ex.tests ?? '') : '';
  // Imports must stay at the top level: lift them out of the tests, and drop exact duplicates.
  const seen = new Set<string>([...given, ...(user.match(IMPORT_LINE) ?? []).map((l) => l.trim())]);
  const lifted: string[] = [];
  tests = tests.replace(IMPORT_LINE, (l) => {
    if (!seen.has(l.trim())) lifted.push(l.trim());
    seen.add(l.trim());
    return blank(l);
  });
  const parts: string[] = [HEADER, ...lifted];
  const sections: Section[] = [];
  let line = parts.join('\n').split('\n').length + 1;
  const add = (name: Section['name'], text: string, wrap?: [string, string]) => {
    if (!text.trim()) return;
    if (wrap) {
      parts.push(wrap[0]);
      line += wrap[0].split('\n').length;
    }
    sections.push({ name, start: line, lines: text.split('\n').length });
    parts.push(text);
    line += text.split('\n').length;
    if (wrap) {
      parts.push(wrap[1]);
      line += wrap[1].split('\n').length;
    }
  };
  add('given code', prelude);
  add('your code', user);
  add('tests', tests, ['try {', '} catch (__e) {\n  __r.failure = __describe(__e);\n}']);
  parts.push('__done();');
  return { source: parts.join('\n'), sections };
}

/** "main.ts:57:9" → "your code, line 3". */
function mapLines(text: string, sections: Section[]): string {
  return text.replace(/(?:file:\/\/)?[^\s()]*main\.tsx?:(\d+)(?::(\d+))?/g, (_m, l: string) => {
    const n = Number(l);
    const s = sections.find((x) => n >= x.start && n < x.start + x.lines);
    return s ? `${s.name}, line ${n - s.start + 1}` : `line ${n}`;
  });
}

const TSCONFIG = (lib: string) => ({
  compilerOptions: {
    target: 'ES2022', lib: ['ES2025', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx',
    strict: true, noEmit: true, skipLibCheck: true, isolatedModules: true, erasableSyntaxOnly: true, verbatimModuleSyntax: true,
    types: ['node'], typeRoots: [join(lib, 'node_modules', '@types')],
  },
  include: ['main.ts', 'main.tsx'],
});

async function typeCheck(root: string, dir: string, sections: Section[]): Promise<string[]> {
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG(root)));
  // TypeScript 7 by path: node_modules/.bin/tsc may point at the ts5 alias (TypeScript 5, used only to split exercises).
  const r = await exec(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(dir, 'tsconfig.json')], dir, 30_000);
  if (r.code === 0) return [];
  const errors: string[] = [];
  for (const l of `${r.stdout}${r.stderr}`.split('\n')) {
    const m = l.match(/main\.tsx?\((\d+),(\d+)\):\s*error\s*(TS\d+):\s*(.*)$/);
    if (!m) continue;
    const n = Number(m[1]);
    const s = sections.find((x) => n >= x.start && n < x.start + x.lines);
    if (!s) continue; // the harness itself
    errors.push(`${s.name}, line ${n - s.start + 1}: ${m[4]} (${m[3]})`);
  }
  return [...new Set(errors)].slice(0, 15);
}

async function runTs(root: string, dir: string, ex: Exercise, code: string, mode: 'run' | 'test'): Promise<Omit<RunResult, 'ms'>> {
  if (ex.language === 'tsx' || ex.mode === 'typecheck') {
    const user = code.replace(ASSERT_IMPORT, blank);
    const source = [ex.prelude ?? '', user].filter(Boolean).join('\n');
    const file = ex.language === 'tsx' ? 'main.tsx' : 'main.ts';
    const preludeLines = ex.prelude ? ex.prelude.split('\n').length : 0;
    writeFileSync(join(dir, file), `${source}\nexport {};\n`);
    const sections: Section[] = [
      ...(preludeLines ? [{ name: 'given code' as const, start: 1, lines: preludeLines }] : []),
      { name: 'your code', start: preludeLines + 1, lines: user.split('\n').length },
    ];
    const typeErrors = await typeCheck(root, dir, sections);
    return {
      ok: typeErrors.length === 0,
      stdout: '',
      stderr: '',
      typeErrors,
      tests: mode === 'test' ? { passed: typeErrors.length ? 0 : 1, total: 1, failures: typeErrors.length ? [{ line: 0, code: 'type-check', message: 'Fix the type errors below.' }] : [] } : null,
    };
  }
  const { source, sections } = composeTs(ex, code, mode === 'test');
  writeFileSync(join(dir, 'main.ts'), source);
  const [r, typeErrors] = await Promise.all([
    exec(process.execPath, ['--disable-warning=ExperimentalWarning', join(dir, 'main.ts')], dir),
    mode === 'test' ? typeCheck(root, dir, sections) : Promise.resolve([]),
  ]);
  if (r.timedOut) return { ok: false, stdout: r.stdout.slice(-20_000), stderr: '', error: TIMEOUT_MESSAGE, typeErrors };
  const { result, rest } = parseResult(r.stdout);
  const stdout = rest.slice(-20_000);
  if (!result) {
    // A syntax error or unsupported syntax stops the file before any test runs.
    const msg = mapLines(r.stderr, sections)
      .split('\n')
      .filter((l) => l.trim() && !l.includes('node:internal') && !/^\s+at /.test(l))
      .slice(0, 10)
      .join('\n');
    return { ok: false, stdout, stderr: '', error: msg || 'The run failed without output.', typeErrors };
  }
  const failure = result.failure as null | { name: string; message: string; actual?: string; expected?: string; stack: string };
  const passed = result.passed as number;
  const total = Math.max(passed + (failure ? 1 : 0), ((ex.tests ?? '').match(/\bassert(?:\.[a-zA-Z]+)?\s*\(/g) ?? []).length);
  // Where did it fail? The first stack frame inside the composed file.
  const frame = failure
    ? (failure.stack
        .split('\n')
        .filter((l) => /main\.ts:\d+/.test(l))
        .map((l) => mapLines(l, sections).trim().replace(/^at\s+/, ''))
        .find((l) => /(your code|tests|given code), line/.test(l)) ?? '')
    : '';
  const inUserCode = failure && frame.includes('your code');
  const isAssertion = failure?.name === 'AssertionError';
  if (mode === 'run') {
    return { ok: !failure, stdout, stderr: r.stderr.slice(-20_000), error: failure ? `${failure.name}: ${failure.message}${frame ? `\n  at ${frame}` : ''}` : null, typeErrors };
  }
  return {
    ok: !failure && passed >= total && total > 0,
    stdout,
    stderr: '',
    error: failure && !isAssertion && inUserCode ? `${failure.name}: ${failure.message}\n  at ${frame}` : null,
    typeErrors,
    tests: {
      passed,
      total,
      failures: failure
        ? [{ line: 0, code: frame || 'tests', message: isAssertion ? failure.message.split('\n')[0] : `${failure.name}: ${failure.message}`, expected: failure.expected, got: failure.actual }]
        : [],
    },
  };
}

// ---------- SQL ----------

async function runSql(root: string, dir: string, ex: Exercise, code: string, mode: 'run' | 'test'): Promise<Omit<RunResult, 'ms'>> {
  const job = {
    flavor: ex.language === 'sql-postgres' ? 'postgres' : 'sqlite',
    mode: mode === 'test' ? 'test' : 'run',
    setup: ex.setup ?? '',
    code,
    check: ex.check ?? null,
    expect: ex.expect ?? [],
    ordered: ex.ordered ?? false,
    tag: `${process.pid}_${counter}`,
  };
  writeFileSync(join(dir, 'job.json'), JSON.stringify(job));
  const r = await exec(join(root, '.venv', 'bin', 'python'), ['-I', join(root, 'server', 'harness', 'sql_runner.py'), join(dir, 'job.json')], dir);
  if (r.timedOut) return { ok: false, stdout: '', stderr: '', error: `Your query ran for more than ${TIMEOUT_MS / 1000} seconds and was stopped.` };
  const { result } = parseResult(r.stdout);
  if (!result) return { ok: false, stdout: '', stderr: '', error: r.stderr.trim().split('\n').slice(-6).join('\n') || 'The query failed without output.' };
  return { stdout: '', stderr: '', ...(result as object) } as Omit<RunResult, 'ms'>;
}

/** Run the learner's code: "run" just executes it; "test" runs it against the exercise's tests. */
export async function runCode(root: string, ex: Exercise, code: string, mode: 'run' | 'test'): Promise<RunResult> {
  const started = Date.now();
  const dir = join(root, '.runs', `${process.pid}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  try {
    const result =
      ex.language === 'python' ? await runPython(root, dir, ex, code, mode)
      : ex.language === 'sql' || ex.language === 'sql-postgres' ? await runSql(root, dir, ex, code, mode)
      : await runTs(root, dir, ex, code, mode);
    return { ...result, ms: Date.now() - started };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Exercises for one chapter, from exercises/<chapterId>.json. */
export function loadExercises(root: string, chapterId: string): Record<string, Exercise> {
  if (!/^[a-z0-9-]+$/.test(chapterId)) return {};
  try {
    return JSON.parse(readFileSync(join(root, 'exercises', `${chapterId}.json`), 'utf8')) as Record<string, Exercise>;
  } catch {
    return {};
  }
}
