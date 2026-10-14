// Deliberately slow: it makes about 1.6^n calls. fib(40) takes around half a second.
export function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}
