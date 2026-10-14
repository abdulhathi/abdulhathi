console.log('  (counter.ts is being evaluated)');

// `let` exports are live: importers always see the current value.
export let count = 0;

export function increment(): void {
  count += 1;
}
