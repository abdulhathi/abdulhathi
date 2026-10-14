import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

// Keeps the thread busy, the way a heavy synchronous function would.
function block(ms: number) {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

const ms = (ns: number) => (ns / 1e6).toFixed(1);
const delay = monitorEventLoopDelay({ resolution: 10 });

async function phase(label: string, work: () => void) {
  delay.reset();
  delay.enable();
  const timer = setInterval(work, 100);
  await sleep(2000);
  clearInterval(timer);
  delay.disable();
  console.log(
    `${label.padEnd(28)} p50 ${ms(delay.percentile(50)).padStart(5)} · ` +
      `p99 ${ms(delay.percentile(99)).padStart(5)} · max ${ms(delay.max).padStart(5)} ms`,
  );
}

await phase('idle', () => {});
await phase('5 ms of work every 100 ms', () => block(5));
await phase('80 ms of work every 100 ms', () => block(80));
