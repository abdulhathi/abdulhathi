import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

// Node checks the loop every 10 ms and records each gap in nanoseconds. A gap
// includes the 10 ms interval itself, so subtract it to get the delay.
const RESOLUTION = 10;
const histogram = monitorEventLoopDelay({ resolution: RESOLUTION });
const delay = (ns: number) => `${Math.max(0, ns / 1e6 - RESOLUTION).toFixed(1)} ms`;

function report(label: string): void {
  const p50 = delay(histogram.percentile(50));
  const p99 = delay(histogram.percentile(99));
  console.log(`${label.padEnd(22)} delay p50 ${p50}  p99 ${p99}  max ${delay(histogram.max)}`);
  histogram.reset();
}

histogram.enable();
await sleep(1000); // idle: the loop is free
report('idle for 1 s:');

for (let i = 0; i < 5; i++) {
  const until = performance.now() + 150;
  while (performance.now() < until); // 150 ms of blocking work
  await sleep(50);
}
report('5 x 150 ms blocking:');
histogram.disable();

// Event-loop utilisation: the share of time the loop was busy rather than idle.
const elu = performance.eventLoopUtilization();
console.log(`event loop busy ${(elu.utilization * 100).toFixed(0)}% of the time since start`);
