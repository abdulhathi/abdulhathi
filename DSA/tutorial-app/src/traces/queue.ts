// Walkthrough frames for chapter 17 (Queues and deques), produced by running each structure for real.
import type { Cell, Frame, Tone, Viz } from '../viz/types';

export type RingOp = ['enqueue', number] | ['dequeue'];

/** A fixed-size ring buffer: head index + count, with every index taken modulo the capacity. */
export function ringBuffer(capacity: number, ops: RingOp[]): { frames: Frame[]; contents: number[]; results: (boolean | number)[] } {
  const slots: Cell[] = Array(capacity).fill(null);
  let head = 0;
  let count = 0;
  const frames: Frame[] = [];
  const results: (boolean | number)[] = [];
  const view = (focus?: number, tone: Tone = 'active'): Viz[] => {
    const tones: Partial<Record<number, Tone>> = {};
    for (let k = 0; k < count; k++) tones[(head + k) % capacity] = 'info';
    if (focus !== undefined) tones[focus] = tone;
    const tail = (head + count) % capacity;
    return [
      {
        kind: 'array',
        label: `slots (capacity ${capacity})`,
        items: [...slots],
        tones,
        pointers: [{ name: 'head', at: head, tone: 'info' }, ...(count < capacity ? [{ name: 'next', at: tail, tone: 'warn' as Tone }] : [])],
      },
      { kind: 'vars', items: [['head', head], ['count', count], ['next write', count < capacity ? `(${head} + ${count}) mod ${capacity} = ${tail}` : 'full']] },
    ];
  };
  frames.push({ note: 'An empty ring: head is the front of the queue, count is how many items it holds, and the next write goes to (head + count) mod capacity.', parts: view() });
  for (const op of ops) {
    if (op[0] === 'enqueue') {
      if (count === capacity) {
        results.push(false);
        frames.push({ note: `enqueue ${op[1]}: the ring is full (count = capacity), so the call returns false and nothing changes.`, parts: view(head, 'bad') });
        continue;
      }
      const at = (head + count) % capacity;
      slots[at] = op[1];
      count++;
      results.push(true);
      frames.push({
        note: `enqueue ${op[1]}: write it at slot (${head} + ${count - 1}) mod ${capacity} = ${at}${at < head ? ', which wraps around to the start of the array' : ''}. count becomes ${count}.`,
        parts: view(at, 'match'),
      });
    } else {
      if (count === 0) {
        results.push(false);
        frames.push({ note: 'dequeue: the ring is empty, so the call returns false.', parts: view() });
        continue;
      }
      const out = slots[head] as number;
      const was = head;
      slots[head] = null;
      head = (head + 1) % capacity;
      count--;
      results.push(out);
      frames.push({ note: `dequeue: take ${out} from slot ${was}, then head moves to (${was} + 1) mod ${capacity} = ${head}. Nothing is shifted.`, parts: view(was, 'bad') });
    }
  }
  const contents = Array.from({ length: count }, (_, k) => slots[(head + k) % capacity] as number);
  frames.push({ note: `Front to back the queue holds ${contents.join(', ') || 'nothing'}. Every operation was O(1): only head and count changed.`, parts: view() });
  return { frames, contents, results };
}

export type StackQueueOp = ['push', number] | ['pop'];

/** A FIFO queue built from two stacks: pushes go in, pops come out, and "out" is refilled only when empty. */
export function twoStackQueue(ops: StackQueueOp[]): { frames: Frame[]; popped: number[] } {
  const inS: number[] = [];
  const outS: number[] = [];
  const popped: number[] = [];
  const frames: Frame[] = [];
  const view = (inTone?: Tone, outTone?: Tone): Viz[] => [
    { kind: 'stack', label: 'in stack', items: [...inS], tones: inTone && inS.length ? { [inS.length - 1]: inTone } : {} },
    { kind: 'stack', label: 'out stack', items: [...outS], tones: outTone && outS.length ? { [outS.length - 1]: outTone } : {} },
    { kind: 'vars', items: [['popped so far', popped.length ? popped.join(', ') : '—']] },
  ];
  frames.push({ note: 'Two empty stacks. New items always go on "in"; the queue\'s front is always on top of "out".', parts: view() });
  for (const op of ops) {
    if (op[0] === 'push') {
      inS.push(op[1]);
      frames.push({ note: `push ${op[1]}: put it on top of the in stack. O(1).`, parts: view('active') });
      continue;
    }
    if (outS.length === 0) {
      const moved = inS.length;
      while (inS.length) outS.push(inS.pop()!);
      frames.push({
        note: `pop with "out" empty: move all ${moved} items from "in" to "out". Moving reverses them, so the oldest item lands on top.`,
        parts: view(undefined, 'warn'),
      });
    }
    const v = outS.pop()!;
    popped.push(v);
    frames.push({ note: `pop: take ${v} from the top of "out". It is the oldest item still in the queue.`, parts: view() });
  }
  frames.push({ note: 'Each item is moved from "in" to "out" at most once, so a long run of operations costs O(1) per operation on average.', parts: view() });
  return { frames, popped };
}

/** Count calls in the last `window` milliseconds: new times join at the back, expired times leave from the front. */
export function recentCalls(times: number[], window = 3000): { frames: Frame[]; counts: number[] } {
  const queue: number[] = [];
  let head = 0;
  const frames: Frame[] = [];
  const counts: number[] = [];
  const live = () => queue.slice(head);
  frames.push({ note: `Each call asks: how many calls happened in the last ${window} ms, this one included? Times only ever increase.`, parts: [{ kind: 'queue', label: 'call times', items: [] }] });
  for (const t of times) {
    queue.push(t);
    const expired: number[] = [];
    for (let k = head; k < queue.length && queue[k] < t - window; k++) expired.push(queue[k]);
    if (expired.length) {
      frames.push({
        note: `ping(${t}): add ${t} at the back. The window is [${t - window}, ${t}], so ${expired.join(' and ')} ${expired.length > 1 ? 'are' : 'is'} too old.`,
        parts: [
          {
            kind: 'queue',
            label: 'call times',
            items: live(),
            tones: { ...Object.fromEntries(expired.map((_, k) => [k, 'bad' as Tone])), [live().length - 1]: 'active' },
          },
        ],
      });
      head += expired.length;
    }
    counts.push(live().length);
    frames.push({
      note: expired.length
        ? `Drop the expired times from the front. ${live().length} call${live().length > 1 ? 's' : ''} remain${live().length > 1 ? '' : 's'}: the answer is ${live().length}.`
        : `ping(${t}): add ${t} at the back. Nothing is older than ${t - window}, so the answer is ${live().length}.`,
      parts: [{ kind: 'queue', label: 'call times', items: live(), tones: { [live().length - 1]: 'match' } }, { kind: 'vars', items: [['answer', live().length]] }],
    });
  }
  return { frames, counts };
}
