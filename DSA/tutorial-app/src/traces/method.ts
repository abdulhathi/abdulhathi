// Walkthrough frames for chapter 02: Two Sum solved two ways.
import type { Frame } from '../viz/types';

/** Brute force: try every pair. Returns the frames and how many pairs were checked. */
export function twoSumBrute(nums: number[], target: number): { frames: Frame[]; result: [number, number] | null; checks: number } {
  const frames: Frame[] = [];
  let checks = 0;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      checks++;
      const hit = nums[i] + nums[j] === target;
      frames.push({
        note: hit
          ? `${nums[i]} + ${nums[j]} = ${target}. Found after checking ${checks} pairs.`
          : `Pair ${checks}: ${nums[i]} + ${nums[j]} = ${nums[i] + nums[j]}, not ${target}. Try the next pair.`,
        parts: [
          {
            kind: 'array',
            label: 'nums',
            items: nums,
            tones: { [i]: hit ? 'match' : 'active', [j]: hit ? 'match' : 'info' },
            pointers: [{ name: 'i', at: i }, { name: 'j', at: j, tone: 'info' }],
          },
          { kind: 'vars', items: [['pairs checked', checks], ['target', target]] },
        ],
      });
      if (hit) return { frames, result: [i, j], checks };
    }
  }
  return { frames, result: null, checks };
}

/** One pass with a hash map from value to index: look up the complement before storing. */
export function twoSumMap(nums: number[], target: number): { frames: Frame[]; result: [number, number] | null } {
  const frames: Frame[] = [];
  const seen = new Map<number, number>();
  const mapView = (key?: number, tone: 'match' | 'active' = 'match') => ({
    kind: 'map' as const,
    label: 'seen: value → index',
    keyTitle: 'value',
    valueTitle: 'index',
    entries: [...seen.entries()] as [number, number][],
    tones: key !== undefined ? { [[...seen.keys()].indexOf(key)]: tone } : {},
  });
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) {
      frames.push({
        note: `At ${nums[i]} we need ${need}, and the map says ${need} was at index ${seen.get(need)}. Answer found in one pass.`,
        parts: [
          { kind: 'array', label: 'nums', items: nums, tones: { [i]: 'match', [seen.get(need)!]: 'match' }, pointers: [{ name: 'i', at: i }] },
          { kind: 'vars', items: [['need', need]], tones: { 0: 'match' } },
          mapView(need),
        ],
      });
      return { frames, result: [seen.get(need)!, i] };
    }
    seen.set(nums[i], i);
    frames.push({
      note: `At ${nums[i]} we need ${target} − ${nums[i]} = ${need}. It is not in the map, so store ${nums[i]} → ${i} for later values to find, and move on.`,
      parts: [
        { kind: 'array', label: 'nums', items: nums, tones: { [i]: 'active' }, pointers: [{ name: 'i', at: i }] },
        { kind: 'vars', items: [['need', need]] },
        mapView(nums[i], 'active'),
      ],
    });
  }
  return { frames, result: null };
}
