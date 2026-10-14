import { setTimeout as sleep } from 'node:timers/promises';

async function timed(path: string): Promise<string> {
  const start = performance.now();
  const response = await fetch(`http://localhost:3050${path}`);
  await response.text();
  return `${path.padEnd(6)} answered after ${Math.round(performance.now() - start)} ms`;
}

for (const slow of ['/wait', '/block']) {
  const slowRequest = timed(slow);
  await sleep(50); // make sure the slow request reaches the server first
  console.log(`while ${slow} is running: ${await timed('/fast')}`);
  console.log(`                         ${await slowRequest}`);
}
