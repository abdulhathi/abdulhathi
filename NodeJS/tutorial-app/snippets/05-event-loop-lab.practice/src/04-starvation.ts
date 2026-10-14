// process.nextTick callbacks all run before the loop may continue, even ones added
// while the queue is being emptied. Recursive nextTick therefore starves timers and I/O.
function count(schedule: (fn: () => void) => void, label: string, total: number): Promise<void> {
  return new Promise((resolve) => {
    let calls = 0;
    let timerSawCalls = -1;
    setTimeout(() => (timerSawCalls = calls), 0);

    const step = () => {
      calls += 1;
      if (calls < total) schedule(step);
      else setTimeout(() => {
        console.log(`${label}: the 0 ms timer ran after ${timerSawCalls.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} calls`);
        resolve();
      }, 5);
    };
    schedule(step);
  });
}

await count((fn) => process.nextTick(fn), 'recursive nextTick  ', 100_000);
await count((fn) => setImmediate(fn), 'recursive setImmediate', 100_000);
