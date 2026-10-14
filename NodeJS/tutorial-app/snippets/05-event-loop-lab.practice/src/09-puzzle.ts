import { readFile } from 'node:fs';
// Predict the order of the letters, then run it.
readFile(import.meta.filename, () => {
  setTimeout(() => console.log('A'), 0);
  setImmediate(() => {
    console.log('B');
    Promise.resolve().then(() => console.log('C'));
  });
  process.nextTick(() => console.log('D'));
  Promise.resolve()
    .then(() => {
      console.log('E');
      process.nextTick(() => console.log('F'));
    })
    .then(() => console.log('G'));
  console.log('H');
});
