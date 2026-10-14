// Walkthrough frames for the counting chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Anagram check with one frequency table: count up for s, count down for t, then look for anything non-zero. */
export function anagramCounts(s: string, t: string): { frames: Frame[]; isAnagram: boolean } {
  const letters = [...new Set([...s, ...t])].sort();
  const count = new Map(letters.map((c) => [c, 0]));
  const frames: Frame[] = [];
  const view = (word: string, label: string, i: number, hot: string | null, note: string, tone: Tone = 'active') => ({
    note,
    parts: [
      { kind: 'array' as const, label, items: [...word], tones: i >= 0 && i < word.length ? { [i]: tone } : {}, pointers: i >= 0 && i < word.length ? [{ name: 'i', at: i }] : [] },
      {
        kind: 'grid' as const,
        label: 'count per letter',
        colHeaders: letters,
        cells: [letters.map((c) => count.get(c)! as Cell)],
        tones: hot === null ? {} : { [`0,${letters.indexOf(hot)}`]: tone },
      },
    ],
  });
  frames.push(view(s, 's', -1, null, 'One counter per letter, all zero. Anagrams use every letter the same number of times.'));
  if (s.length !== t.length) {
    frames.push(view(s, 's', -1, null, 'The lengths differ, so they cannot be anagrams. No counting needed.', 'bad'));
    return { frames, isAnagram: false };
  }
  for (let i = 0; i < s.length; i++) {
    count.set(s[i], count.get(s[i])! + 1);
    if (i < 3 || i === s.length - 1) frames.push(view(s, 's', i, s[i], `"${s[i]}" in s: add one to its counter.`));
  }
  frames.push(view(s, 's', -1, null, `All of s is counted. Now walk through t and subtract.`));
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    count.set(c, count.get(c)! - 1);
    const neg = count.get(c)! < 0;
    if (neg) {
      frames.push(view(t, 't', i, c, `"${c}" in t takes its counter below zero: t has more "${c}"s than s. Not an anagram.`, 'bad'));
      return { frames, isAnagram: false };
    }
    if (i < 3 || i === t.length - 1) frames.push(view(t, 't', i, c, `"${c}" in t: subtract one.`, 'warn'));
  }
  frames.push(view(t, 't', -1, null, 'Every counter is back to zero, so both words use the same letters the same number of times: an anagram.', 'match'));
  return { frames, isAnagram: true };
}

/** Count equal pairs while scanning: each new value pairs with every earlier copy of itself. */
export function goodPairs(nums: number[]): { frames: Frame[]; pairs: number } {
  const seen = new Map<number, number>();
  let pairs = 0;
  const frames: Frame[] = [];
  const view = (i: number, note: string, hotKey?: number) => {
    const entries = [...seen.entries()];
    return {
      note,
      parts: [
        { kind: 'array' as const, label: 'nums', items: nums, tones: i < nums.length ? { [i]: 'active' as Tone } : {}, pointers: i < nums.length ? [{ name: 'i', at: i }] : [] },
        {
          kind: 'map' as const,
          label: 'copies seen so far',
          keyTitle: 'value',
          valueTitle: 'count',
          entries: entries as [Cell, Cell][],
          tones: hotKey === undefined ? {} : { [entries.findIndex(([k]) => k === hotKey)]: 'match' as Tone },
        },
        { kind: 'vars' as const, items: [['pairs', pairs]] as [string, Cell][] },
      ],
    };
  };
  frames.push(view(nums.length, 'A good pair is two equal values at different positions. Instead of checking every pair, count as you go.'));
  for (let i = 0; i < nums.length; i++) {
    const before = seen.get(nums[i]) ?? 0;
    pairs += before;
    seen.set(nums[i], before + 1);
    frames.push(
      view(
        i,
        before === 0
          ? `${nums[i]} is new: it pairs with nobody yet. Its count becomes 1.`
          : `${nums[i]} has been seen ${before} time${before > 1 ? 's' : ''}, so it forms ${before} new pair${before > 1 ? 's' : ''}. Total ${pairs}.`,
        nums[i],
      ),
    );
  }
  frames.push(view(nums.length, `Done in one pass. Total good pairs: ${pairs}. (A value seen c times forms c × (c − 1) / 2 pairs in all.)`));
  return { frames, pairs };
}

/** Counting by contribution: the vowel at index i lies in (i + 1) × (n − i) substrings. */
export function vowelContributions(word: string): { frames: Frame[]; total: number } {
  const n = word.length;
  const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
  let total = 0;
  const frames: Frame[] = [];
  frames.push({
    note: `There are ${(n * (n + 1)) / 2} substrings, and listing them all is O(n²). Flip the question: for each vowel, in how many substrings does it appear?`,
    parts: [{ kind: 'array', label: 'word', items: [...word] }, { kind: 'vars', items: [['total', 0]] }],
  });
  for (let i = 0; i < n; i++) {
    if (!vowels.has(word[i])) {
      frames.push({
        note: `"${word[i]}" is not a vowel: it contributes nothing.`,
        parts: [{ kind: 'array', label: 'word', items: [...word], tones: { [i]: 'dim' } }, { kind: 'vars', items: [['total', total]] }],
      });
      continue;
    }
    const left = i + 1;
    const right = n - i;
    total += left * right;
    frames.push({
      note: `"${word[i]}" at index ${i}: a substring containing it starts at one of ${left} positions (0 to ${i}) and ends at one of ${right} positions (${i} to ${n - 1}). That is ${left} × ${right} = ${left * right} substrings.`,
      parts: [
        { kind: 'array', label: 'word', items: [...word], tones: { [i]: 'match' }, window: [0, n - 1], pointers: [{ name: 'here', at: i, tone: 'match' }] },
        { kind: 'vars', items: [['starts', left], ['ends', right], ['total', total]], tones: { 2: 'match' } },
      ],
    });
  }
  frames.push({ note: `Sum of the contributions: ${total} vowels across all substrings, found in O(n).`, parts: [{ kind: 'array', label: 'word', items: [...word] }, { kind: 'vars', items: [['total', total]], tones: { 0: 'match' } }] });
  return { frames, total };
}
