// A "barrel" file re-exports a folder's modules so callers need one import.
export * from './math.ts';
export { default as formatPrice } from './format.ts';
export { count, increment } from './counter.ts';
