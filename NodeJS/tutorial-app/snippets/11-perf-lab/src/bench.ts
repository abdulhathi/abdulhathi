import { createHistogram, performance } from 'node:perf_hooks';
import { makeOrders } from './data.ts';
import { revenueByProduct, uniqueCustomers } from './report.ts';

const orders = makeOrders(5_000);
const ms = (ns: number) => (ns / 1e6).toFixed(2); // histograms record nanoseconds

// 1. performance.now(): milliseconds since the process started, with microsecond fractions.
const start = performance.now();
uniqueCustomers(orders);
console.log(`1. performance.now: first call took ${(performance.now() - start).toFixed(2)} ms`);

// 2. mark and measure: named points on a timeline that you can read back, or watch with a PerformanceObserver.
performance.mark('revenue:start');
revenueByProduct(orders);
performance.mark('revenue:end');
const measure = performance.measure('revenue', 'revenue:start', 'revenue:end');
console.log(`2. measure "${measure.name}": ${measure.duration.toFixed(2)} ms`);

// 3. Cold versus warm: early calls run before V8 has optimised the function.
function totalRevenue(list: typeof orders): number {
  let sum = 0;
  for (const order of list) sum += order.quantity * order.price;
  return sum;
}
const calls = Array.from({ length: 8 }, () => {
  const t = performance.now();
  totalRevenue(orders);
  return (performance.now() - t).toFixed(3);
});
console.log(`3. eight calls in a row: ${calls.join(', ')} ms`);

// 4. timerify + histogram: time every call, then look at the spread, not one number.
const histogram = createHistogram();
const timed = performance.timerify(uniqueCustomers, { histogram });
for (let i = 0; i < 50; i++) timed(orders);
console.log(
  `4. 50 timed calls: min ${ms(histogram.min)} · mean ${ms(histogram.mean)} · ` +
    `p99 ${ms(histogram.percentile(99))} · max ${ms(histogram.max)} ms`,
);
