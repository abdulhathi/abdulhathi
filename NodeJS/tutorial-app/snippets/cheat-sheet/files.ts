import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), 'cheat-sheet-demo'); // build paths with path, never with '/'
await mkdir(dir, { recursive: true }); // no error if it exists

const file = path.join(dir, 'notes.json');
const tmp = `${file}.tmp`;
await writeFile(tmp, JSON.stringify({ notes: ['one'] }, null, 2)); // write to a temp file …
await rename(tmp, file); // … then rename: readers never see a half-written file

const data = JSON.parse(await readFile(file, 'utf8')) as { notes: string[] };
console.log(data.notes, (await stat(file)).size, await readdir(dir));

try {
  await readFile(path.join(dir, 'missing.txt'), 'utf8');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') console.log('missing file: ENOENT');
  else throw error;
}

console.log(path.basename(file), path.extname(file), path.parse(file).name);
console.log(path.resolve('a', '../b'), path.relative(dir, file));
console.log(process.argv.length >= 2, process.env.HOME !== undefined, process.platform, os.EOL === '\n');
await rm(dir, { recursive: true, force: true });
process.exitCode = 0; // set the code and let Node finish, rather than process.exit()
