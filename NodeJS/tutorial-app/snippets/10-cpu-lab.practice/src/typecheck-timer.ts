import { spawn } from 'node:child_process';
import { once } from 'node:events';

const started = performance.now();
// stdio 'inherit' lets tsc print straight to this terminal, colours included.
// On Windows, npx is a .cmd script, which needs a shell to run.
const child = spawn('npx', ['tsc'], { stdio: 'inherit', shell: process.platform === 'win32' });
const [code] = (await once(child, 'close')) as [number | null];

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(code === 0 ? `PASS: no type errors (${seconds}s)` : `FAIL: tsc exited with code ${code} (${seconds}s)`);
process.exitCode = code ?? 1;
