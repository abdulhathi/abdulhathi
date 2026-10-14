import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { mapLimit } from './lib/map-limit.ts';
import { retry } from './lib/retry.ts';
import { FIXTURES } from './lib/shop.ts';
import { withTimeout } from './lib/with-timeout.ts';

// 1. retry with exponential backoff: this call fails twice, then works.
let calls = 0;
const flaky = async () => {
  calls += 1;
  if (calls < 3) throw new Error(`503 on call ${calls}`);
  return 'payment accepted';
};
console.log('retry ->', await retry(flaky, 4));

// 2. a deadline that actually cancels the work
const slowQuery = (signal: AbortSignal) => sleep(500, 'rows', { signal });
console.log('fast enough ->', await withTimeout((signal) => sleep(50, 'rows', { signal }), 200));
try {
  await withTimeout(slowQuery, 200);
} catch (err) {
  console.log('too slow ->', (err as Error).name, '-', ((err as Error).cause as Error).name);
}

// 3. stat every fixture, at most two at a time
const names = (await readdir(FIXTURES)).filter((name) => name.endsWith('.json')).sort();
const sizes = await mapLimit(names, 2, async (name) => `${name}: ${(await stat(path.join(FIXTURES, name))).size} bytes`);
console.log(sizes.join('\n'));
