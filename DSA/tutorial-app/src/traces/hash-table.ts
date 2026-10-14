// Walkthrough frames for the hash tables chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** How a hash table stores keys: bucket = key mod size, and colliding keys share a bucket's chain. */
export function bucketInserts(keys: number[], size: number): { frames: Frame[]; buckets: number[][] } {
  const buckets: number[][] = Array.from({ length: size }, () => []);
  const frames: Frame[] = [];
  const grid = (hot?: [number, number], tone: Tone = 'active') => {
    const width = Math.max(3, ...buckets.map((b) => b.length));
    const cells: Cell[][] = buckets.map((b) => Array.from({ length: width }, (_, c) => (c < b.length ? b[c] : null)));
    return {
      kind: 'grid' as const,
      label: `buckets (key mod ${size})`,
      cells,
      rowHeaders: buckets.map((_, i) => `#${i}`),
      tones: hot ? { [`${hot[0]},${hot[1]}`]: tone } : {},
    };
  };
  frames.push({
    note: `An empty table with ${size} buckets. To store a key, compute its bucket from the key itself, here key mod ${size}, and put it there.`,
    parts: [grid()],
  });
  for (const key of keys) {
    const b = key % size;
    const collision = buckets[b].length > 0;
    buckets[b].push(key);
    frames.push({
      note: collision
        ? `${key} mod ${size} = ${b}, but bucket ${b} already holds ${buckets[b].slice(0, -1).join(', ')}. That is a collision: the key joins the chain in that bucket.`
        : `${key} mod ${size} = ${b}, so ${key} goes into bucket ${b}. No searching: the bucket comes straight from the key.`,
      parts: [grid([b, buckets[b].length - 1], collision ? 'warn' : 'active'), { kind: 'vars', items: [['key', key], ['bucket', b]] }],
    });
  }
  const probe = keys[keys.length - 1];
  const pb = probe % size;
  frames.push({
    note: `Looking up ${probe} repeats the same calculation: bucket ${pb}, then a short scan of its chain. With few keys per bucket, that is O(1) on average.`,
    parts: [grid([pb, buckets[pb].indexOf(probe)], 'match'), { kind: 'vars', items: [['lookup', probe], ['bucket', pb]], tones: { 1: 'match' } }],
  });
  return { frames, buckets };
}

/** Two Sum with a value → index map: look for the complement before storing the current value. */
export function twoSum(nums: number[], target: number): { frames: Frame[]; result: [number, number] | null } {
  const seen = new Map<number, number>();
  const frames: Frame[] = [];
  const view = (i: number, tones: Partial<Record<number, Tone>>, mapTone?: number, note = '') => ({
    note,
    parts: [
      { kind: 'array' as const, label: 'nums', items: nums, tones, pointers: i < nums.length ? [{ name: 'i', at: i }] : [] },
      {
        kind: 'map' as const,
        label: 'seen',
        keyTitle: 'value',
        valueTitle: 'index',
        entries: [...seen.entries()] as [Cell, Cell][],
        tones: mapTone !== undefined ? { [mapTone]: 'match' as Tone } : {},
      },
      { kind: 'vars' as const, items: [['target', target] as [string, Cell], ...(i < nums.length ? [['need', target - nums[i]] as [string, Cell]] : [])] },
    ],
  });
  frames.push(view(0, {}, undefined, `For each value, the partner you need is target − value. A map from value to index answers "have I seen it?" in O(1).`));
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    const j = seen.get(need);
    if (j !== undefined) {
      const pos = [...seen.keys()].indexOf(need);
      frames.push(view(i, { [i]: 'match', [j]: 'match' }, pos, `Need ${need}, and the map says ${need} sits at index ${j}. Answer: indices ${j} and ${i}.`));
      return { frames, result: [j, i] };
    }
    frames.push(view(i, { [i]: 'active' }, undefined, `Need ${need}: not in the map yet. Store ${nums[i]} → ${i} so a later value can find it.`));
    seen.set(nums[i], i);
  }
  frames.push(view(nums.length, {}, undefined, 'The scan ended without a match: no two values add up to the target.'));
  return { frames, result: null };
}

/** Group Anagrams: words with the same sorted letters share a key, so they land in the same group. */
export function groupAnagrams(words: string[]): { frames: Frame[]; groups: string[][] } {
  const groups = new Map<string, string[]>();
  const frames: Frame[] = [];
  const view = (i: number, key: string | null, note: string) => {
    const entries = [...groups.entries()];
    const at = key === null ? -1 : entries.findIndex(([k]) => k === key);
    return {
      note,
      parts: [
        { kind: 'array' as const, label: 'words', items: words, tones: i < words.length ? { [i]: 'active' as Tone } : {}, pointers: i < words.length ? [{ name: 'i', at: i }] : [] },
        {
          kind: 'map' as const,
          label: 'groups',
          keyTitle: 'key (sorted letters)',
          valueTitle: 'words',
          entries: entries.map(([k, list]) => [k, list.join(', ')] as [Cell, Cell]),
          tones: at >= 0 ? { [at]: 'match' as Tone } : {},
        },
      ],
    };
  };
  frames.push(view(words.length, null, 'Anagrams contain exactly the same letters. Sorting the letters gives every anagram the same key.'));
  for (let i = 0; i < words.length; i++) {
    const key = [...words[i]].sort().join('');
    const existed = groups.has(key);
    groups.set(key, [...(groups.get(key) ?? []), words[i]]);
    frames.push(
      view(i, key, existed ? `"${words[i]}" sorts to "${key}", a key we have seen: add it to that group.` : `"${words[i]}" sorts to "${key}", a new key: start a new group.`),
    );
  }
  frames.push(view(words.length, null, `Done. Each map value is one group of anagrams: ${groups.size} groups.`));
  return { frames, groups: [...groups.values()] };
}

/** Longest Consecutive Sequence: put everything in a set, and count up only from numbers with no predecessor. */
export function longestConsecutive(nums: number[]): { frames: Frame[]; best: number } {
  const set = new Set(nums);
  const items = [...set];
  const frames: Frame[] = [];
  let best = 0;
  const view = (tones: Partial<Record<number, Tone>>, note: string, run: number) => ({
    note,
    parts: [
      { kind: 'set' as const, label: 'set of values', items, tones },
      { kind: 'vars' as const, items: [['run', run], ['best', best]] as [string, Cell][] },
    ],
  });
  frames.push(view({}, 'Put every value in a set: duplicates disappear, and "is x here?" costs O(1).', 0));
  for (const v of items) {
    const idx = items.indexOf(v);
    if (set.has(v - 1)) {
      frames.push(view({ [idx]: 'dim' }, `${v - 1} is in the set, so ${v} is not the start of a run. Skip it: the run will be counted from its start.`, 0));
      continue;
    }
    let len = 1;
    const tones: Partial<Record<number, Tone>> = { [idx]: 'active' };
    while (set.has(v + len)) {
      tones[items.indexOf(v + len)] = 'match';
      len++;
    }
    const improved = len > best;
    best = Math.max(best, len);
    frames.push(
      view(
        tones,
        `${v - 1} is missing, so ${v} starts a run. Count upwards: ${Array.from({ length: len }, (_, k) => v + k).join(', ')}. Length ${len}.${improved ? ' A new best.' : ''}`,
        len,
      ),
    );
  }
  frames.push(view({}, `Every value was visited at most twice (once in the loop, once while counting a run), so the work is O(n). Longest run: ${best}.`, best));
  return { frames, best };
}
