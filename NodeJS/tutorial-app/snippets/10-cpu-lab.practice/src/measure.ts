import { setTimeout as sleep } from 'node:timers/promises';

// Usage: node src/measure.ts <port> [n]
const port = Number(process.argv[2] ?? 3150);
const n = Number(process.argv[3] ?? 42);
const base = `http://localhost:${port}`;

async function timed(path: string): Promise<number> {
  const started = performance.now();
  const res = await fetch(base + path);
  await res.text();
  return Math.round(performance.now() - started);
}

console.log(`1) One /fib?n=${n} request, with a /ping every 100 ms while it runs`);
let fibDone = false;
const fib = timed(`/fib?n=${n}`).then((ms) => {
  fibDone = true;
  console.log(`   /fib answered after ${ms} ms`);
});
for (let i = 1; !fibDone; i++) {
  await sleep(100);
  console.log(`   ping ${i}: ${await timed('/ping')} ms`);
}
await fib;

console.log(`2) Four /fib?n=${n} requests at the same time`);
const started = performance.now();
const each = await Promise.all([1, 2, 3, 4].map(() => timed(`/fib?n=${n}`)));
console.log(`   each took ${each.join(', ')} ms; all four done after ${Math.round(performance.now() - started)} ms`);
