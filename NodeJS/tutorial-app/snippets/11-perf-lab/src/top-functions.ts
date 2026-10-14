import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// The parts of a .cpuprofile file (Chrome DevTools format) this script reads.
type ProfileNode = {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
};
type Profile = { nodes: ProfileNode[]; startTime: number; endTime: number; samples: number[] };

async function newestIn(dir: string): Promise<string> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.cpuprofile')).map((f) => path.join(dir, f));
  const times = await Promise.all(files.map(async (f) => ({ f, mtime: (await stat(f)).mtimeMs })));
  const newest = times.sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) throw new Error(`No .cpuprofile files in ${dir}/. Run npm run profile first.`);
  return newest.f;
}

// Usage: node src/top-functions.ts [file.cpuprofile]   (default: the newest file in profiles/)
const file = process.argv[2] ?? (await newestIn('profiles'));
const profile = JSON.parse(await readFile(file, 'utf8')) as Profile;

// V8 sampled the call stack at a fixed interval. A function's "self time" is the number of
// samples where it was the function actually running, times the interval (times are in µs).
const msPerSample = (profile.endTime - profile.startTime) / 1000 / profile.samples.length;
const selfMs = new Map<string, number>();
for (const node of profile.nodes) {
  const { functionName, url, lineNumber } = node.callFrame;
  const where = url ? ` ${path.basename(url)}:${lineNumber + 1}` : '';
  const key = (functionName || '(anonymous)') + where;
  selfMs.set(key, (selfMs.get(key) ?? 0) + (node.hitCount ?? 0) * msPerSample);
}

const total = [...selfMs.values()].reduce((sum, ms) => sum + ms, 0);
console.log(`${path.basename(file)}: ${Math.round(total)} ms sampled\n`);
console.log('  self ms      %  function');
for (const [name, ms] of [...selfMs].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`${ms.toFixed(0).padStart(8)} ${((ms / total) * 100).toFixed(1).padStart(6)}  ${name}`);
}
