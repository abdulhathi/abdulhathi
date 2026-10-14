import { setTimeout as sleep } from 'node:timers/promises';

async function save(id: number): Promise<number> {
  await sleep(id * 50);
  return id;
}

// Pitfall 1: forEach ignores the promises its callback returns.
const saved: number[] = [];
[3, 1, 2].forEach(async (id) => {
  saved.push(await save(id));
});
console.log('after forEach:', saved); // nothing has finished yet

// Fix A, one at a time, in order:
const inOrder: number[] = [];
for (const id of [3, 1, 2]) inOrder.push(await save(id));
console.log('for...of:     ', inOrder);

// Fix B, all at once (results keep the input order):
console.log('Promise.all:  ', await Promise.all([3, 1, 2].map(save)));

// Pitfall 2: `return promise` inside try leaves the try before the promise settles.
async function failSoon(): Promise<string> {
  await sleep(10);
  throw new Error('failed later');
}

async function withoutAwait(): Promise<string> {
  try {
    return failSoon(); // the rejection happens after this function has returned
  } catch {
    return 'caught';
  }
}

async function withAwait(): Promise<string> {
  try {
    return await failSoon(); // waits here, so a rejection lands in catch
  } catch {
    return 'caught';
  }
}

console.log('return await:  ', await withAwait());
console.log('return promise:', await withoutAwait().catch((err: Error) => `escaped: ${err.message}`));
