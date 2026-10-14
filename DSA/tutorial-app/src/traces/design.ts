// Walkthrough frames for the design problems chapter, produced by running each data structure.
import type { Cell, Frame, Tone } from '../viz/types';

export type LruOp = ['get', number] | ['put', number, number];

/** LRU cache: a Map for lookup plus a doubly linked list ordered from most to least recently used. */
export function lruCache(capacity: number, ops: LruOp[]): { frames: Frame[]; results: (number | null)[]; order: number[] } {
  const values = new Map<number, number>();
  let order: number[] = []; // keys, most recent first (stands in for the linked list)
  const frames: Frame[] = [];
  const results: (number | null)[] = [];
  const view = (note: string, focus: number | null, tone: Tone, evicted?: number): Frame => {
    const at = focus === null ? -1 : order.indexOf(focus);
    const entries = [...values.entries()].sort((a, b) => a[0] - b[0]);
    return {
      note,
      parts: [
        { kind: 'list', label: 'recency list (most recent first)', items: order.map((k): Cell => `${k}:${values.get(k)}`), doubly: true, tones: at >= 0 ? { [at]: tone } : {} },
        { kind: 'map', label: 'map: key → list node', keyTitle: 'key', valueTitle: 'value', entries: entries.map(([k, v]): [Cell, Cell] => [k, v]), tones: Object.fromEntries(entries.flatMap(([k], i) => (k === focus ? [[i, tone]] : []))) },
        ...(evicted !== undefined ? [{ kind: 'vars' as const, items: [['evicted', evicted]] as [string, Cell][], tones: { 0: 'bad' as Tone } }] : []),
      ],
    };
  };
  frames.push(view(`Capacity ${capacity}. The map finds any key's node in O(1); the doubly linked list keeps recency, so moving or removing a node is O(1) too.`, null, 'active'));
  for (const op of ops) {
    if (op[0] === 'get') {
      const key = op[1];
      if (values.has(key)) {
        order = [key, ...order.filter((k) => k !== key)];
        results.push(values.get(key)!);
        frames.push(view(`get(${key}) = ${values.get(key)}. Using a key makes it the most recent: unlink its node and put it at the front.`, key, 'match'));
      } else {
        results.push(-1);
        frames.push(view(`get(${key}): not in the map, return −1. Nothing moves.`, null, 'bad'));
      }
    } else {
      const [, key, value] = op;
      results.push(null);
      if (values.has(key)) {
        values.set(key, value);
        order = [key, ...order.filter((k) => k !== key)];
        frames.push(view(`put(${key}, ${value}): the key exists. Update its value and move it to the front.`, key, 'warn'));
      } else {
        let evicted: number | undefined;
        if (values.size === capacity) {
          evicted = order[order.length - 1];
          order = order.slice(0, -1);
          values.delete(evicted);
        }
        values.set(key, value);
        order = [key, ...order];
        frames.push(
          view(
            evicted !== undefined
              ? `put(${key}, ${value}): the cache is full. Evict the tail of the list, key ${evicted}, the least recently used (delete it from the map too). Then add ${key} at the front.`
              : `put(${key}, ${value}): a new key. Add a node at the front and a map entry pointing to it.`,
            key,
            'match',
            evicted,
          ),
        );
      }
    }
  }
  return { frames, results, order };
}

export type RandomSetOp = ['insert' | 'remove', number];

/** Insert, delete and getRandom in O(1): an array of values plus a Map from value to its index. */
export function randomizedSet(ops: RandomSetOp[]): { frames: Frame[]; values: number[]; results: boolean[] } {
  const values: number[] = [];
  const index = new Map<number, number>();
  const frames: Frame[] = [];
  const results: boolean[] = [];
  const view = (note: string, tones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'values (getRandom picks a random index)', items: values.slice(), tones },
      { kind: 'map', label: 'value → index', entries: [...index.entries()].map(([v, i]): [Cell, Cell] => [v, i]) },
    ],
  });
  frames.push(view('An array gives a uniformly random element in O(1): pick a random index. A Map from value to index makes membership O(1). The hard part is deleting from the middle of the array.'));
  for (const [op, v] of ops) {
    if (op === 'insert') {
      if (index.has(v)) {
        results.push(false);
        frames.push(view(`insert(${v}): already present, return false.`, { [index.get(v)!]: 'warn' }));
      } else {
        index.set(v, values.length);
        values.push(v);
        results.push(true);
        frames.push(view(`insert(${v}): append it at index ${values.length - 1} and record that index in the map.`, { [values.length - 1]: 'match' }));
      }
    } else {
      const i = index.get(v);
      if (i === undefined) {
        results.push(false);
        frames.push(view(`remove(${v}): not present, return false.`));
        continue;
      }
      const last = values[values.length - 1];
      if (i === values.length - 1) {
        frames.push(view(`remove(${v}): it is already the last element, so there is no gap to fill. Just pop it and delete it from the map.`, { [i]: 'bad' }));
        values.pop();
        index.delete(v);
        results.push(true);
        frames.push(view(`Popped ${v}. The other indices are unchanged.`));
        continue;
      }
      frames.push(view(`remove(${v}): it sits at index ${i}. Removing from the middle would shift everything after it, O(n). Instead, copy the last value (${last}) into its slot.`, { [i]: 'bad', [values.length - 1]: 'info' }));
      values[i] = last;
      index.set(last, i);
      values.pop();
      index.delete(v);
      results.push(true);
      frames.push(view(`Pop the last slot, update ${last}'s index to ${i}, and delete ${v} from the map. Order does not matter for a set, so this is O(1).`, { [i]: 'match' }));
    }
  }
  return { frames, values, results };
}
