import { makeOrders } from './data.ts';
import { buildReport } from './report.ts';

// A workload to profile: build the same report ten times.
const orders = makeOrders(10_000);
const started = performance.now();
for (let i = 0; i < 10; i++) buildReport(orders);
console.log(`10 reports in ${Math.round(performance.now() - started)} ms`);
