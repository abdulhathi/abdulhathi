// Runs every code block in the chapters, so no answer in the lab shows code that does not work.
//   python       → executed with .venv/bin/python (asserts must pass, exit code 0)
//   ts / tsx     → type-checked together with strict TypeScript, React and Node types;
//                  ts blocks are then executed with Node (type stripping), unless flagged "typecheck"
//   sql          → executed in order against one in-memory SQLite database per chapter;
//   sql postgres → executed in order against a throwaway database on the local PostgreSQL server;
//                  a block ending in "-- expect: <python literal>" must return exactly those rows
// Add "norun" after the language (```python norun) for a deliberate fragment or a broken example.
// Usage: node scripts/check-code.mjs [content/<id>.md ...]
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
// One folder per run, so two checks running at the same time never delete each other's files.
const work = join(root, 'scripts', '.snippets', String(process.pid));
const python = join(root, '.venv', 'bin', 'python');

const args = process.argv.slice(2);
const files = (args.length ? args : readdirSync(join(root, 'content')).filter((f) => f.endsWith('.md')).map((f) => `content/${f}`)).map((f) =>
  resolve(root, f),
);

/** Fenced blocks with their language, flags and starting line. */
function blocks(file) {
  const out = [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let open = null;
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)(```+|~~~+)\s*(.*)$/);
    if (!open && m) {
      const [lang = '', ...flags] = m[3].trim().split(/\s+/);
      open = { fence: m[2], indent: m[1].length, lang: lang.toLowerCase(), flags, line: i + 1, body: [] };
    } else if (open && m && m[2].startsWith(open.fence) && !m[3].trim()) {
      out.push({ ...open, code: open.body.join('\n') });
      open = null;
    } else if (open) {
      open.body.push(open.indent ? line.slice(Math.min(open.indent, line.length - line.trimStart().length)) : line);
    }
  });
  if (open) out.push({ ...open, code: open.body.join('\n'), unclosed: true });
  return out;
}

const failures = [];
const counts = { python: 0, ts: 0, tsRun: 0, sql: 0, postgres: 0, skipped: 0 };
const fail = (file, line, lang, message) => failures.push({ where: `${basename(file)}:${line}`, lang, message: message.trim().split('\n').slice(-25).join('\n') });

rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'py'), { recursive: true });
mkdirSync(join(work, 'ts'), { recursive: true });

const pyJobs = [];
const tsFiles = new Map(); // snippet path → [md file, md line]
const sqlJobs = [];
const pgJobs = [];
const nodeJobs = [];

for (const file of files) {
  const id = basename(file, '.md');
  const sql = [];
  const pg = [];
  blocks(file).forEach((b, i) => {
    if (b.unclosed) return fail(file, b.line, b.lang, 'Code fence is never closed.');
    if (b.flags.includes('norun')) return void (counts.skipped += ['python', 'py', 'ts', 'tsx', 'sql'].includes(b.lang) ? 1 : 0);
    if (b.lang === 'python' || b.lang === 'py') {
      const path = join(work, 'py', `${id}-${String(i).padStart(3, '0')}.py`);
      writeFileSync(path, b.code + '\n');
      pyJobs.push({ file, line: b.line, path });
    } else if (b.lang === 'ts' || b.lang === 'tsx') {
      const path = join(work, 'ts', `${id}-${String(i).padStart(3, '0')}.${b.lang}`);
      // Force module scope so snippets never collide with each other's names.
      writeFileSync(path, `${b.code}\nexport {};\n`);
      tsFiles.set(path, [file, b.line]);
      if (b.lang === 'ts' && !b.flags.includes('typecheck')) nodeJobs.push({ file, line: b.line, path });
    } else if (b.lang === 'sql') {
      (b.flags.includes('postgres') ? pg : sql).push({ line: b.line, code: b.code });
    }
  });
  if (sql.length) sqlJobs.push({ file, sql });
  if (pg.length) pgJobs.push({ file, sql: pg });
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

const cwd = join(tmpdir(), `interview-lab-run-${process.pid}`);
mkdirSync(cwd, { recursive: true });

await pool(pyJobs, 8, async (job) => {
  counts.python++;
  try {
    await run(python, [job.path], { cwd, timeout: 60_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONHASHSEED: '0' } });
  } catch (e) {
    fail(job.file, job.line, 'python', `${e.stderr || ''}${e.stdout || ''}${e.killed ? '\nTimed out after 60 s.' : ''}` || e.message);
  }
});

await pool(nodeJobs, 8, async (job) => {
  counts.tsRun++;
  try {
    await run(process.execPath, ['--disable-warning=ExperimentalWarning', job.path], { cwd, timeout: 30_000 });
  } catch (e) {
    fail(job.file, job.line, 'ts (node)', `${e.stderr || ''}${e.stdout || ''}${e.killed ? '\nTimed out after 30 s (a server that never closes? flag the block "typecheck").' : ''}` || e.message);
  }
});

// One SQLite database per chapter; blocks run in the order they appear.
const sqlRunner = `
import ast, json, sqlite3, sys
jobs = json.load(open(sys.argv[1]))
bad = []
for job in jobs:
    db = sqlite3.connect(':memory:')
    for b in job['sql']:
        code = b['code']
        lines = code.rstrip().split('\\n')
        expect = None
        if lines and lines[-1].strip().lower().startswith('-- expect:'):
            expect = ast.literal_eval(lines[-1].split(':', 1)[1].strip())
            code = '\\n'.join(lines[:-1])
        try:
            if expect is None:
                db.executescript(code)
            else:
                rows = [tuple(r) for r in db.execute(code.strip().rstrip(';')).fetchall()]
                want = [tuple(r) for r in expect]
                if rows != want:
                    bad.append([job['file'], b['line'], f'Expected {want}\\n     got {rows}'])
        except Exception as e:
            bad.append([job['file'], b['line'], f'{type(e).__name__}: {e}'])
print(json.dumps(bad))
`;
if (sqlJobs.length) {
  counts.sql = sqlJobs.reduce((s, j) => s + j.sql.length, 0);
  writeFileSync(join(work, 'sql-jobs.json'), JSON.stringify(sqlJobs));
  writeFileSync(join(work, 'sql-runner.py'), sqlRunner);
  try {
    const { stdout } = await run(python, [join(work, 'sql-runner.py'), join(work, 'sql-jobs.json')], { timeout: 60_000 });
    for (const [file, line, message] of JSON.parse(stdout)) fail(file, line, 'sql', message);
  } catch (e) {
    fail('sql-runner', 0, 'sql', e.stderr || e.message);
  }
}


// One throwaway PostgreSQL database per chapter, on the local server. If no server is reachable the blocks are
// reported as skipped, so the check still works on a machine without PostgreSQL.
const pgRunner = `
import ast, datetime, decimal, json, sys
import psycopg
jobs = json.load(open(sys.argv[1]))
tag = sys.argv[2]
try:
    admin = psycopg.connect('dbname=postgres', autocommit=True, connect_timeout=3)
except Exception as e:
    print(json.dumps({'unavailable': str(e).strip()}))
    sys.exit(0)
def norm(v):
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, (datetime.date, datetime.datetime, datetime.time)):
        return v.isoformat()
    if isinstance(v, datetime.timedelta):
        return str(v)
    return v
bad = []
for i, job in enumerate(jobs):
    name = f'capgemini_lab_check_{tag}_{i}'
    admin.execute(f'DROP DATABASE IF EXISTS {name}')
    admin.execute(f'CREATE DATABASE {name}')
    try:
        with psycopg.connect(f'dbname={name}', autocommit=True) as db:
            for b in job['sql']:
                code = b['code']
                lines = code.rstrip().split('\\n')
                expect = None
                if lines and lines[-1].strip().lower().startswith('-- expect:'):
                    expect = ast.literal_eval(lines[-1].split(':', 1)[1].strip())
                    code = '\\n'.join(lines[:-1])
                try:
                    if expect is None:
                        db.execute(code)
                    else:
                        rows = [tuple(norm(v) for v in r) for r in db.execute(code.strip().rstrip(';')).fetchall()]
                        want = [tuple(r) for r in expect]
                        if rows != want:
                            bad.append([job['file'], b['line'], f'Expected {want}\\n     got {rows}'])
                except Exception as e:
                    bad.append([job['file'], b['line'], f'{type(e).__name__}: {e}'])
    finally:
        admin.execute(f'DROP DATABASE IF EXISTS {name} WITH (FORCE)')
print(json.dumps(bad))
`;
let pgUnavailable = '';
if (pgJobs.length) {
  counts.postgres = pgJobs.reduce((s, j) => s + j.sql.length, 0);
  writeFileSync(join(work, 'pg-jobs.json'), JSON.stringify(pgJobs));
  writeFileSync(join(work, 'pg-runner.py'), pgRunner);
  try {
    const { stdout } = await run(python, [join(work, 'pg-runner.py'), join(work, 'pg-jobs.json'), String(process.pid)], { timeout: 120_000 });
    const result = JSON.parse(stdout);
    if (!Array.isArray(result)) pgUnavailable = result.unavailable;
    else for (const [file, line, message] of result) fail(file, line, 'sql postgres', message);
  } catch (e) {
    fail('pg-runner', 0, 'sql postgres', e.stderr || e.message);
  }
}

if (tsFiles.size) {
  counts.ts = tsFiles.size;
  const config = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2025', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
      // Node runs ts blocks by stripping types, so only erasable syntax is allowed and type imports must say so.
      erasableSyntaxOnly: true,
      verbatimModuleSyntax: true,
      types: ['node'],
      typeRoots: [join(root, 'node_modules', '@types')],
    },
    include: ['ts/*.ts', 'ts/*.tsx'],
  };
  writeFileSync(join(work, 'tsconfig.json'), JSON.stringify(config, null, 2));
  try {
    await run(join(root, 'node_modules', '.bin', 'tsc'), ['-p', join(work, 'tsconfig.json')], { cwd: root, timeout: 120_000 });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const byFile = new Map();
    for (const line of out.split('\n')) {
      const m = line.match(/\/ts\/([^/(:\s]+)[(:](\d+)/);
      if (!m) continue;
      const path = join(work, 'ts', m[1]);
      const where = tsFiles.get(path);
      if (!where) continue;
      const key = `${where[0]}|${where[1] + Number(m[2])}`;
      byFile.set(key, [...(byFile.get(key) ?? []), line.trim()]);
    }
    if (!byFile.size && out.trim()) fail('tsc', 0, 'ts', out);
    for (const [key, lines] of byFile) {
      const [file, line] = key.split('|');
      fail(file, line, 'ts', lines.join('\n'));
    }
  }
}

rmSync(cwd, { recursive: true, force: true });
rmSync(work, { recursive: true, force: true });

console.log(
  `Checked ${files.length} chapter file(s): ${counts.python} Python, ${counts.ts} TypeScript (${counts.tsRun} run with Node), ` +
    `${counts.sql} SQLite and ${counts.postgres} PostgreSQL blocks (${counts.skipped} marked norun).`,
);
if (pgUnavailable) console.log(`⚠ PostgreSQL is not reachable, so ${counts.postgres} postgres block(s) were skipped: ${pgUnavailable}`);
if (failures.length) {
  for (const f of failures) console.log(`\n✗ ${f.where} [${f.lang}]\n${f.message.replace(/^/gm, '    ')}`);
  console.log(`\n${failures.length} failing block(s).`);
  process.exit(1);
}
console.log('All code blocks pass.');
