// The same three lines in a CommonJS file.
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise.then'));
console.log('sync');
