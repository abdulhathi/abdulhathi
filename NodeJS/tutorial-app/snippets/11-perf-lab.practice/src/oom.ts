// Run with a small heap so it fails fast: node --max-old-space-size=64 src/oom.ts
const kept: number[][] = [];
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(0);

for (let i = 1; ; i++) {
  kept.push(new Array(100_000).fill(i)); // never released: kept is still reachable
  if (i % 25 === 0) console.log(`${i} arrays kept, heapUsed ${mb(process.memoryUsage().heapUsed)} MB`);
}
