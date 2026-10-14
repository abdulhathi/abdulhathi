// Walkthrough frames for the linked lists chapter, produced by running each algorithm on real nodes.
import type { Frame, Pointer } from '../viz/types';

type Node = { val: number; next: Node | null };

export function build(values: number[]): Node | null {
  let head: Node | null = null;
  for (let i = values.length - 1; i >= 0; i--) head = { val: values[i], next: head };
  return head;
}

export function toArray(head: Node | null): number[] {
  const out: number[] = [];
  for (let n = head; n; n = n.next) out.push(n.val);
  return out;
}

/** Iterative reversal: move one node at a time from the front of "remaining" to the front of "reversed". */
export function reverseList(values: number[]): { frames: Frame[]; result: number[] } {
  let prev: Node | null = null;
  let curr = build(values);
  const frames: Frame[] = [];
  const view = (note: string, moved = false): Frame => ({
    note,
    parts: [
      {
        kind: 'list',
        label: 'reversed so far (prev is its head)',
        items: toArray(prev),
        tones: moved ? { 0: 'match' } : {},
        pointers: prev ? [{ name: 'prev', at: 0, tone: 'match' }] : [],
      },
      { kind: 'list', label: 'still to reverse (curr is its head)', items: toArray(curr), pointers: curr ? [{ name: 'curr', at: 0 }] : [] },
    ],
  });
  frames.push(view('prev = null (an empty reversed list), curr = head. Each step moves exactly one node from curr to the front of prev.'));
  while (curr) {
    const next: Node | null = curr.next;
    const v = curr.val;
    curr.next = prev;
    prev = curr;
    curr = next;
    frames.push(
      view(
        `Save next = ${next ? next.val : 'null'}, point ${v}'s next at prev, then move prev to ${v} and curr to ${next ? next.val : 'null'}. Saving next first is what keeps the rest of the list reachable.`,
        true,
      ),
    );
  }
  frames.push(view(`curr is null: every node has moved. prev is the new head: ${toArray(prev).join(' → ')}.`));
  return { frames, result: toArray(prev) };
}

/** Merge two sorted lists behind a dummy head: always attach the smaller front node. */
export function mergeTwo(a: number[], b: number[]): { frames: Frame[]; result: number[] } {
  const dummy: Node = { val: 0, next: null };
  let tail = dummy;
  let p = build(a);
  let q = build(b);
  const frames: Frame[] = [];
  const view = (note: string): Frame => ({
    note,
    parts: [
      { kind: 'list', label: 'list 1', items: toArray(p), pointers: p ? [{ name: 'p', at: 0 }] : [] },
      { kind: 'list', label: 'list 2', items: toArray(q), pointers: q ? [{ name: 'q', at: 0, tone: 'info' }] : [] },
      {
        kind: 'list',
        label: 'merged (after the dummy)',
        items: toArray(dummy.next),
        tones: dummy.next ? { [toArray(dummy.next).length - 1]: 'match' } : {},
        pointers: dummy.next ? [{ name: 'tail', at: toArray(dummy.next).length - 1, tone: 'match' }] : [],
      },
    ],
  });
  frames.push(view('A dummy node sits before the answer, so attaching the first node is no different from attaching any other. tail marks the end of the merged list.'));
  while (p && q) {
    if (p.val <= q.val) {
      const v = p.val;
      tail.next = p;
      p = p.next;
      tail = tail.next;
      tail.next = null;
      frames.push(view(`${v} ≤ ${q.val}: attach ${v} from list 1 and move p on.`));
    } else {
      const v = q.val;
      tail.next = q;
      q = q.next;
      tail = tail.next;
      tail.next = null;
      frames.push(view(`${v} < ${p.val}: attach ${v} from list 2 and move q on.`));
    }
  }
  const rest = p ?? q;
  if (rest) {
    tail.next = rest;
    p = null;
    q = null;
    frames.push(view('One list is empty. The other is already sorted, so attach all of it in one step.'));
  }
  frames.push(view(`The answer is dummy.next: ${toArray(dummy.next).join(' → ')}.`));
  return { frames, result: toArray(dummy.next) };
}

/** Remove the n-th node from the end in one pass: two pointers n + 1 apart, starting at a dummy. */
export function removeNthFromEnd(values: number[], n: number): { frames: Frame[]; result: number[] } {
  // Index 0 of the drawing is the dummy node, shown as "D".
  const items: (number | string)[] = ['D', ...values];
  const len = items.length;
  const frames: Frame[] = [];
  const view = (slow: number, fast: number, note: string, removed?: number): Frame => {
    const pointers: Pointer[] = [{ name: 'slow', at: slow }];
    if (fast < len) pointers.push({ name: 'fast', at: fast, tone: 'info' });
    return {
      note,
      parts: [
        {
          kind: 'list',
          label: 'list with a dummy node D in front',
          items: [...items],
          tones: { 0: 'dim', ...(removed !== undefined ? { [removed]: 'bad' } : {}) },
          pointers,
        },
        { kind: 'vars', items: [['n', n], ['gap', fast - slow]] },
      ],
    };
  };
  let slow = 0;
  let fast = 0;
  frames.push(view(slow, fast, `To delete the ${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} node from the end, slow must stop just before it. Start both pointers at a dummy node, so even the head can be removed the same way.`));
  for (let i = 0; i <= n; i++) fast++;
  frames.push(view(slow, fast, `Move fast ${n + 1} steps ahead. Now exactly ${n} nodes lie strictly between slow and fast.`));
  while (fast < len) {
    slow++;
    fast++;
    frames.push(view(slow, fast, fast < len ? 'Move both one step. The gap stays the same.' : 'fast has run off the end (null). Because of the gap, slow is now just before the node to delete.'));
  }
  const target = slow + 1;
  frames.push(view(slow, fast, `Point slow's next past the following node, and ${items[target]} drops out of the list.`, target));
  items.splice(target, 1);
  frames.push(view(slow, len, `Return dummy.next: ${items.slice(1).join(' → ') || 'an empty list'}. One pass, O(1) extra space.`));
  return { frames, result: items.slice(1) as number[] };
}
