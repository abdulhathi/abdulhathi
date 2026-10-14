function inner(): void {
  console.trace('the call stack right now'); // prints the stack, innermost first
}
function outer(): void {
  inner();
}
outer();

// A 0 ms timer is a minimum delay, not a promise to run at once.
const scheduled = performance.now();
setTimeout(() => {
  console.log(`timer asked for 0 ms, ran after ${Math.round(performance.now() - scheduled)} ms`);
}, 0);

// Synchronous code always runs to completion first. Nothing can interrupt it.
const until = performance.now() + 200;
while (performance.now() < until) {
  // busy for 200 ms
}
console.log('busy loop finished; only now can the timer run');
