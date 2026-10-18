#!/usr/bin/env node
// Runs every snippet project's own tests, so the code shown in the lab is code that works.
//
//   node scripts/verify.mjs                       # every topic, every stack
//   node scripts/verify.mjs 04-passwords 08-jwt   # some topics
//   node scripts/verify.mjs --stack python        # one stack
//
// node:    snippets/<topic>/node      node --test (type stripping) + tsc type-check
// python:  snippets/<topic>/python    pytest, in snippets/.venv
// dotnet:  snippets/<topic>/dotnet    dotnet test
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const snippets = join(root, 'snippets');
const args = process.argv.slice(2);
const stackArg = args.includes('--stack') ? args[args.indexOf('--stack') + 1] : null;
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--stack');
const STACKS = stackArg ? [stackArg] : ['node', 'python', 'dotnet'];

const topics = readdirSync(snippets)
  .filter((d) => /^\d\d-/.test(d) && statSync(join(snippets, d)).isDirectory())
  .filter((d) => wanted.length === 0 || wanted.some((w) => d === w || d.startsWith(`${w}-`) || d.endsWith(`-${w}`)))
  .sort();

function run(cmd, argv, cwd, timeoutMs = 300_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, env: { ...process.env, NODE_NO_WARNINGS: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out });
    });
  });
}

const tsc = join(snippets, 'node_modules', 'typescript', 'bin', 'tsc');
const python = join(snippets, '.venv', 'bin', 'python');

async function checkNode(dir) {
  const tests = run(process.execPath, ['--test', '--test-reporter=dot', '--test-concurrency=1', 'test/**/*.test.ts'], dir);
  const types = existsSync(join(dir, 'tsconfig.json')) ? run(process.execPath, [tsc, '-p', 'tsconfig.json'], dir) : Promise.resolve({ ok: true, out: '' });
  const [t, c] = await Promise.all([tests, types]);
  return { ok: t.ok && c.ok, out: [t.ok ? '' : t.out, c.ok ? '' : `type errors:\n${c.out}`].filter(Boolean).join('\n') };
}
const checkPython = (dir) => run(python, ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'], dir);
const checkDotnet = (dir) => run('dotnet', ['test', '--nologo', '-v', 'q'], dir, 600_000);
const CHECK = { node: checkNode, python: checkPython, dotnet: checkDotnet };

let failed = 0;
let passed = 0;
for (const topic of topics) {
  for (const stack of STACKS) {
    const dir = join(snippets, topic, stack);
    if (!existsSync(dir)) continue;
    const started = Date.now();
    const r = await CHECK[stack](dir);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${r.ok ? '✓' : '✗'} ${relative(snippets, dir).padEnd(32)} ${secs}s`);
    if (r.ok) passed++;
    else {
      failed++;
      console.log(r.out.split('\n').slice(-40).map((l) => `    ${l}`).join('\n'));
    }
  }
}
console.log(`\n${passed} passed, ${failed} failed (${topics.length} topic${topics.length === 1 ? '' : 's'}).`);
process.exit(failed ? 1 : 0);
