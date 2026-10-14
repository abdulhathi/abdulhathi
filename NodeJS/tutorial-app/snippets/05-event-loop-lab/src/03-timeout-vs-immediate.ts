import { readFile } from 'node:fs';

function race(where: string): void {
  setTimeout(() => console.log(`${where}: timeout first`), 0);
  setImmediate(() => console.log(`${where}: immediate first`));

  if (process.argv.includes('--busy')) {
    // Burn 2 ms after scheduling, so the timer is already due when the loop starts.
    const until = performance.now() + 2;
    while (performance.now() < until);
  }
}

if (process.argv.includes('--io')) {
  readFile(import.meta.filename, () => race('in an I/O callback')); // always immediate first
} else {
  race('main module'); // depends on timing
}
