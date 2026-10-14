// Runs every code block in the chapters, so no answer in the lab shows code that does not work.
//   python  → executed with .venv/bin/python (asserts must pass, exit code 0)
//   ts/tsx  → type-checked together with strict TypeScript and React types
//   sql     → executed in order against one in-memory SQLite database per chapter;
//             a block ending in "-- expect: <python literal>" must return exactly those rows
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
const counts = { python: 0, ts: 0, sql: 0, skipped: 0 };
const fail = (file, line, lang, message) => failures.push({ where: `${basename(file)}:${line}`, lang, message: message.trim().split('\n').slice(-25).join('\n') });

rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'py'), { recursive: true });
mkdirSync(join(work, 'ts'), { recursive: true });

const pyJobs = [];
const tsFiles = new Map(); // snippet path → [md file, md line]
const sqlJobs = [];

for (const file of files) {
  const id = basename(file, '.md');
  const sql = [];
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
    } else if (b.lang === 'sql') {
      sql.push({ line: b.line, code: b.code });
    }
  });
  if (sql.length) sqlJobs.push({ file, sql });
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

if (tsFiles.size) {
  counts.ts = tsFiles.size;
  const config = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      isolatedModules: true,
      types: [],
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

console.log(`Checked ${files.length} chapter file(s): ${counts.python} Python, ${counts.ts} TypeScript, ${counts.sql} SQL blocks (${counts.skipped} marked norun).`);
if (failures.length) {
  for (const f of failures) console.log(`\n✗ ${f.where} [${f.lang}]\n${f.message.replace(/^/gm, '    ')}`);
  console.log(`\n${failures.length} failing block(s).`);
  process.exit(1);
}
console.log('All code blocks pass.');
