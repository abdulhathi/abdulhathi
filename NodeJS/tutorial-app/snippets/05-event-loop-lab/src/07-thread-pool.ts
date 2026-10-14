import { pbkdf2 } from 'node:crypto';

// pbkdf2 is deliberately slow password hashing. The async version runs on libuv's
// thread pool, which has 4 threads unless UV_THREADPOOL_SIZE says otherwise.
const start = performance.now();
console.log(`UV_THREADPOOL_SIZE = ${process.env.UV_THREADPOOL_SIZE ?? '4 (default)'}`);

for (let i = 1; i <= 8; i++) {
  pbkdf2('secret', 'salt', 300_000, 64, 'sha512', () => {
    console.log(`hash ${i} done after ${Math.round(performance.now() - start)} ms`);
  });
}
