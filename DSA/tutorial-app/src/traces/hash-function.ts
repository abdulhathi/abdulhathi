// Walkthrough frames for the hash functions chapter, produced by running each algorithm.
import type { Cell, Frame, Tone } from '../viz/types';

export type SetOp = ['add' | 'contains' | 'remove', number];

/** A hash set with separate chaining: bucket = key mod size, each bucket a small list. */
export function chainingSet(size: number, ops: SetOp[]): { frames: Frame[]; results: (boolean | null)[]; buckets: number[][] } {
  const buckets: number[][] = Array.from({ length: size }, () => []);
  const frames: Frame[] = [];
  const results: (boolean | null)[] = [];
  const grid = (bucket = -1, slot = -1, tone: Tone = 'active') => {
    const width = Math.max(1, ...buckets.map((b) => b.length));
    const cells: Cell[][] = buckets.map((b) => Array.from({ length: width }, (_, i) => (i < b.length ? b[i] : null)));
    const tones: Partial<Record<string, Tone>> = {};
    if (bucket >= 0) for (let i = 0; i < width; i++) tones[`${bucket},${i}`] = 'info';
    if (bucket >= 0 && slot >= 0) tones[`${bucket},${slot}`] = tone;
    return { kind: 'grid' as const, label: `${size} buckets, chains grow to the right`, cells, rowHeaders: buckets.map((_, i) => `[${i}]`), tones };
  };
  frames.push({ note: `An array of ${size} buckets. A key goes to bucket key mod ${size}. Keys that land in the same bucket share it as a short list.`, parts: [grid()] });
  for (const [op, key] of ops) {
    const b = key % size;
    const chain = buckets[b];
    const at = chain.indexOf(key);
    const hash = { kind: 'vars' as const, items: [['key', key], [`key mod ${size}`, b]] as [string, Cell][] };
    if (op === 'add') {
      results.push(null);
      if (at >= 0) {
        frames.push({ note: `add ${key}: bucket ${b} already holds ${key}. A set keeps one copy, so nothing changes.`, parts: [grid(b, at, 'warn'), hash] });
      } else {
        chain.push(key);
        frames.push({
          note:
            chain.length > 1
              ? `add ${key}: bucket ${b} already holds ${chain.slice(0, -1).join(', ')}. That is a collision: append ${key} to the bucket's chain.`
              : `add ${key}: ${key} mod ${size} = ${b}, so it goes into bucket ${b}.`,
          parts: [grid(b, chain.length - 1, 'match'), hash],
        });
      }
    } else if (op === 'contains') {
      results.push(at >= 0);
      frames.push({
        note: at >= 0
          ? `contains ${key}: go straight to bucket ${b} and scan its short chain. Found.`
          : `contains ${key}: bucket ${b} ${chain.length ? `holds ${chain.join(', ')}` : 'is empty'}, so ${key} is not in the set. Only one bucket was examined.`,
        parts: [grid(b, at, at >= 0 ? 'match' : 'bad'), hash],
      });
    } else {
      results.push(null);
      if (at >= 0) {
        frames.push({ note: `remove ${key}: find it in bucket ${b}...`, parts: [grid(b, at, 'bad'), hash] });
        chain.splice(at, 1);
        frames.push({ note: `...and take it out of the chain.`, parts: [grid(b), hash] });
      } else {
        frames.push({ note: `remove ${key}: it is not in bucket ${b}, so there is nothing to do.`, parts: [grid(b), hash] });
      }
    }
  }
  const total = buckets.reduce((s, c) => s + c.length, 0);
  frames.push({
    note: `${total} keys in ${size} buckets: a load factor of ${(total / size).toFixed(2)}. While it stays small, every operation looks at only a few keys: O(1) on average.`,
    parts: [grid()],
  });
  return { frames, results, buckets };
}

/** Group words by a canonical key: the word's letters in sorted order. */
export function groupByKey(words: string[]): { frames: Frame[]; groups: string[][] } {
  const groups = new Map<string, string[]>();
  const frames: Frame[] = [];
  const view = (focusWord: number, focusKey: string | null, tone: Tone): Frame['parts'] => {
    const entries = [...groups.entries()];
    const keyAt = entries.findIndex(([k]) => k === focusKey);
    return [
      { kind: 'array', label: 'words', items: words, tones: focusWord >= 0 ? { [focusWord]: 'active' } : {} },
      { kind: 'map', label: 'groups', keyTitle: 'key (sorted letters)', valueTitle: 'words', entries: entries.map(([k, v]): [Cell, Cell] => [k, v.join(', ')]), tones: keyAt >= 0 ? { [keyAt]: tone } : {} },
    ];
  };
  frames.push({ note: 'Anagrams contain the same letters. Give every word a key that is the same for all its anagrams: its letters in sorted order.', parts: view(-1, null, 'active') });
  words.forEach((w, i) => {
    const key = [...w].sort().join('');
    const seen = groups.has(key);
    if (!seen) groups.set(key, []);
    groups.get(key)!.push(w);
    frames.push({
      note: seen ? `"${w}" sorts to "${key}", a key we have seen: add it to that group.` : `"${w}" sorts to "${key}", a new key: start a new group.`,
      parts: view(i, key, seen ? 'match' : 'warn'),
    });
  });
  frames.push({ note: `${groups.size} groups. Each word cost one sort of its letters and one map lookup.`, parts: view(-1, null, 'active') });
  return { frames, groups: [...groups.values()] };
}
