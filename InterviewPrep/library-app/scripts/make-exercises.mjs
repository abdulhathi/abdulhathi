// Drafts editor exercises (starter code + tests) from every coding problem's reference solution, and validates them.
//
//   node scripts/make-exercises.mjs            draft exercises that do not exist yet, then validate all
//   node scripts/make-exercises.mjs --force    redraft everything (overwrites curated exercises)
//   node scripts/make-exercises.mjs --check    only validate: reference passes its tests, starter does not
//   node scripts/make-exercises.mjs content/redis.md ...   limit to some chapters
//
// Exercises live in exercises/<chapterId>.json, keyed by problem id. See server/runner.ts for the shape.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import ts from 'ts5';
import { parseDoc, problemsOf } from '../src/lib/md.ts';
import { runCode } from '../server/runner.ts';

const root = resolve(import.meta.dirname, '..');
const python = join(root, '.venv', 'bin', 'python');
const args = process.argv.slice(2);
const force = args.includes('--force');
const checkOnly = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--'));
const chapters = (files.length ? files : readdirSync(join(root, 'content')).filter((f) => f.endsWith('.md')).map((f) => `content/${f}`)).map((f) => resolve(root, f));

const FENCE = /^```(\w+)([^\n]*)\n([\s\S]*?)^```\s*$/gm;
const blocksOf = (text) => [...text.matchAll(FENCE)].map((m) => ({ lang: m[1], flags: m[2].trim().split(/\s+/).filter(Boolean), code: m[3].replace(/\n$/, ''), index: m.index }));

function pyCall(items) {
  if (!items.length) return {};
  return JSON.parse(execFileSync(python, ['-I', join(root, 'scripts', 'split_python.py')], { input: JSON.stringify(items), maxBuffer: 64 * 1024 * 1024 }).toString());
}

// ---------- TypeScript drafts (TS 5 compiler API: TS 7 has no JS API) ----------
const isAssertImport = (s) => ts.isImportDeclaration(s) && /^['"]node:assert(\/strict)?['"]$/.test(s.moduleSpecifier.getText());

function containsAssert(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && /^assert\b/.test(n.expression.getText())) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function callsAny(node, names) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function splitTs(code, tsx) {
  const sf = ts.createSourceFile(tsx ? 'x.tsx' : 'x.ts', code, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const stmts = sf.statements.filter((s) => !isAssertImport(s));
  const testFns = new Set(stmts.filter((s) => ts.isFunctionDeclaration(s) && s.name && containsAssert(s)).map((s) => s.name.text));
  const isDecl = (s) => ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isImportDeclaration(s);
  let first = stmts.findIndex((s) => !isDecl(s) && (containsAssert(s) || callsAny(s, testFns)));
  if (first < 0) first = stmts.length;
  // Setup statements between the last declaration and the first assert belong to the tests. Top-level
  // const/let holding a function count as declarations (export const debounce = (...) => ...).
  const isFnConst = (s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)));
  const lastDecl = stmts.slice(0, first).reduce((acc, s, i) => ((isDecl(s) && !ts.isImportDeclaration(s) && !(ts.isFunctionDeclaration(s) && s.name && testFns.has(s.name.text))) || isFnConst(s) ? i : acc), -1);
  if (lastDecl >= 0 && first < stmts.length) first = Math.min(first, lastDecl + 1);
  const text = (s) => code.slice(s.getFullStart(), s.getEnd()).replace(/^\n+/, '');
  const replaceBodies = (s) => {
    // Collect function-like bodies inside this statement (not nested ones), replace from the end.
    const edits = [];
    const visit = (n, depth) => {
      const fnLike = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);
      if (fnLike && n.body) {
        // Indent the stub like the function it replaces.
        const lineStart = code.lastIndexOf('\n', n.getStart()) + 1;
        const indent = code.slice(lineStart, n.getStart()).match(/^\s*/)[0];
        if (ts.isConstructorDeclaration(n)) {
          const sup = n.body.statements.find((st) => ts.isExpressionStatement(st) && st.expression.getText().startsWith('super('));
          edits.push([n.body.getStart(), n.body.getEnd(), `{\n${sup ? `${indent}  ${sup.getText()}\n` : ''}${indent}  // TODO: set up state\n${indent}}`]);
        } else if (ts.isArrowFunction(n) && !ts.isBlock(n.body)) {
          edits.push([n.body.getStart(), n.body.getEnd(), `{\n${indent}  throw new Error('Not implemented');\n${indent}}`]);
        } else {
          edits.push([n.body.getStart(), n.body.getEnd(), `{\n${indent}  throw new Error('Not implemented');\n${indent}}`]);
        }
        return; // don't stub nested functions separately
      }
      ts.forEachChild(n, (c) => visit(c, depth + 1));
    };
    visit(s, 0);
    let out = code.slice(s.getStart(), s.getEnd());
    const base = s.getStart();
    for (const [a, b, rep] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a - base) + rep + out.slice(b - base);
    return out;
  };
  const starter = [];
  const solution = [];
  const tests = [];
  stmts.forEach((s, i) => {
    if (i >= first || (ts.isFunctionDeclaration(s) && s.name && testFns.has(s.name.text))) return void tests.push(text(s));
    solution.push(text(s));
    if (ts.isImportDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) starter.push(text(s));
    else starter.push(replaceBodies(s));
  });
  return {
    starter: `${starter.join('\n\n').trim()}\n`,
    solution: `${solution.join('\n').trim()}\n`,
    tests: tests.length ? `${tests.join('\n').trim()}\n` : '',
  };
}

// ---------- drafting ----------
function draftChapter(file) {
  const id = basename(file, '.md');
  const raw = readFileSync(file, 'utf8');
  const doc = parseDoc(raw);
  const problems = problemsOf(doc);
  if (!problems.length) return { id, drafts: {} };
  const allBlocks = blocksOf(raw);
  const drafts = {};
  const pyItems = [];
  const literals = [];
  for (const p of problems) {
    const blocks = blocksOf(p.solution).filter((b) => ['python', 'ts', 'tsx', 'sql'].includes(b.lang));
    const runnable = blocks.filter((b) => !b.flags.includes('norun'));
    const chosen = runnable.at(-1) ?? blocks.at(-1);
    if (!chosen) continue;
    const ref = chosen.code;
    if (chosen.lang === 'python') {
      drafts[p.id] = { language: 'python', mode: chosen.flags.includes('norun') ? 'script' : 'asserts', reference: ref };
      pyItems.push({ key: p.id, code: ref });
    } else if (chosen.lang === 'ts' || chosen.lang === 'tsx') {
      const tsx = chosen.lang === 'tsx';
      const typecheck = tsx || chosen.flags.includes('typecheck');
      const { starter, solution, tests } = splitTs(ref, tsx);
      drafts[p.id] = { language: tsx ? 'tsx' : 'ts', mode: typecheck ? 'typecheck' : 'asserts', starter, solution: typecheck ? ref : solution, tests, reference: ref };
    } else {
      const flavor = chosen.flags.includes('postgres') ? 'postgres' : 'sqlite';
      const lines = ref.trimEnd().split('\n');
      const last = lines.at(-1) ?? '';
      const hasExpect = /^\s*--\s*expect:/i.test(last);
      const query = hasExpect ? lines.slice(0, -1).join('\n') : ref;
      // Setup: every earlier SQL block of the same flavour without an expectation, in document order.
      const pos = allBlocks.findIndex((b) => b.code === chosen.code);
      const setup = allBlocks
        .slice(0, pos < 0 ? 0 : pos)
        .filter((b) => b.lang === 'sql' && (b.flags.includes('postgres') ? 'postgres' : 'sqlite') === flavor && !b.flags.includes('norun'))
        // Earlier query blocks may change data before their final SELECT (a DELETE, then a check), so keep them all,
        // without their expectation lines, exactly as the chapter check runs them.
        .map((b) => b.code.split('\n').filter((l) => !/^\s*--\s*expect:/i.test(l)).join('\n').trimEnd())
        .filter(Boolean)
        .map((c) => (c.endsWith(';') ? c : `${c};`))
        .join('\n\n')
        // A setup runs as one transaction, where CONCURRENTLY is not allowed; a plain index gives the same schema.
        .replace(/\bINDEX\s+CONCURRENTLY\b/gi, 'INDEX');
      drafts[p.id] = {
        language: flavor === 'postgres' ? 'sql-postgres' : 'sql',
        mode: 'rows',
        starter: '-- Write your query here.\n',
        setup,
        ordered: /\border\s+by\b/i.test(query.split(/\bselect\b/i).at(-1) ?? query),
        reference: query.trim(),
        solution: query.trim(),
      };
      if (hasExpect) literals.push({ key: p.id, literal: last.split(':').slice(1).join(':').trim() });
    }
  }
  const split = pyCall(pyItems);
  for (const [key, v] of Object.entries(split)) {
    if (v.error) drafts[key].draftError = v.error;
    else Object.assign(drafts[key], { starter: v.starter, solution: v.solution, tests: v.tests });
    if (!drafts[key].tests) drafts[key].mode = 'script';
  }
  for (const [key, v] of Object.entries(pyCall(literals))) drafts[key].expect = v;
  return { id, drafts };
}

async function validate(ex) {
  if (ex.draftError) return `draft failed: ${ex.draftError}`;
  // A learner writes the solution part only; the reference file also contains the tests.
  const ref = await runCode(root, ex, ex.solution ?? ex.reference, 'test');
  if (!ref.ok) {
    const why = ref.error ?? ref.tests?.failures?.[0]?.message ?? ref.typeErrors?.[0] ?? 'failed';
    return `reference fails: ${String(why).split('\n')[0].slice(0, 160)}`;
  }
  // The editor shows type errors next to the results, so a correct answer must not produce any.
  if (ref.typeErrors?.length) return `reference has type errors: ${ref.typeErrors[0].slice(0, 160)}`;
  if (ex.mode === 'typecheck' || ex.language === 'sql' || ex.language === 'sql-postgres') return null;
  const starter = await runCode(root, ex, ex.starter, 'test');
  if (starter.ok) return 'starter already passes the tests';
  return null;
}

let drafted = 0;
const problemsByChapter = [];
for (const file of chapters) {
  const id = basename(file, '.md');
  const path = join(root, 'exercises', `${id}.json`);
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    /* none yet */
  }
  let exercises = existing;
  if (!checkOnly) {
    const { drafts } = draftChapter(file);
    if (!Object.keys(drafts).length) continue;
    exercises = force ? drafts : { ...drafts, ...existing };
    drafted += Object.keys(drafts).filter((k) => force || !existing[k]).length;
    writeFileSync(path, `${JSON.stringify(exercises, null, 2)}\n`);
  }
  if (Object.keys(exercises).length) problemsByChapter.push([id, exercises]);
}

// Validate with a small pool.
const jobs = problemsByChapter.flatMap(([id, ex]) => Object.entries(ex).map(([pid, e]) => ({ id, pid, e })));
const bad = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const problem = await validate(j.e);
      if (problem) bad.push(`${j.id}/${j.pid}: ${problem}`);
    }
  }),
);
console.log(`${checkOnly ? 'Checked' : `Drafted ${drafted}, checked`} ${jobs.length} exercise(s) in ${problemsByChapter.length} chapter(s).`);
if (bad.length) {
  console.log(`\n${bad.length} need attention:`);
  for (const b of bad.sort()) console.log(`  ✗ ${b}`);
  process.exitCode = 1;
} else console.log('Every reference passes its tests and every starter fails them.');
