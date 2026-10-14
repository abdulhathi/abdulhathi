// At the top level of an ES module. Compare with 08-esm-top-level.cts.
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise.then'));
console.log('sync');
