import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

console.log('1. start');

const text = readFileSync(import.meta.filename, 'utf8');
console.log(`2. readFileSync returned ${text.length} characters. Nothing else could run while it waited.`);

readFile(import.meta.filename, 'utf8').then((again) => {
  console.log(`4. readFile finished with ${again.length} characters, after the rest of the script.`);
});

console.log('3. readFile has started. This line runs while the disk does the work.');
