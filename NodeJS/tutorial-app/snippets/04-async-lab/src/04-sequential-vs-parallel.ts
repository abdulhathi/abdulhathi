import { since, slowSquare } from './lib/timing.ts';

// Sequential: each await waits for the previous call to finish.
let start = performance.now();
const one = await slowSquare(1);
const two = await slowSquare(2);
const three = await slowSquare(3);
console.log('sequential:', [one, two, three], since(start));

// Parallel: start all three, then wait for all of them together.
start = performance.now();
const all = await Promise.all([slowSquare(1), slowSquare(2), slowSquare(3)]);
console.log('parallel:  ', all, since(start));

// The same with map, for any number of inputs.
start = performance.now();
const squares = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) => slowSquare(n)));
console.log('eight at once:', squares.join(' '), since(start));

// Start early, await late: the work overlaps with whatever you do in between.
start = performance.now();
const userPromise = slowSquare(10); // already running
const settings = await slowSquare(20); // runs at the same time
console.log('overlapped:', await userPromise, settings, since(start));
