import { fib } from './fib.ts';

// Started with fork(): process.send exists and 'message' events arrive from the parent.
process.on('message', (message: { n: number }) => {
  process.send?.({ pid: process.pid, n: message.n, value: fib(message.n) });
});
