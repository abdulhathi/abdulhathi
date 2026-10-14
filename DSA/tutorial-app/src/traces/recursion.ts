// Walkthrough frames for chapter 04, produced by running each recursion for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Fast power by recursion: x^n = (x^(n/2))², times x when n is odd. Records the call stack. */
export function powerCallStack(x: number, n: number): { frames: Frame[]; result: number; depth: number } {
  const frames: Frame[] = [];
  const stack: string[] = [];
  const returned: [string, Cell][] = [];
  let depth = 0;
  const snap = (note: string, top: Tone): Frame => ({
    note,
    parts: [
      { kind: 'stack', label: 'call stack', items: [...stack], tones: stack.length ? { [stack.length - 1]: top } : {} },
      { kind: 'map', label: 'answers returned', keyTitle: 'call', valueTitle: 'returns', entries: [...returned], tones: returned.length ? { [returned.length - 1]: 'match' } : {} },
    ],
  });
  const pow = (e: number): number => {
    stack.push(`pow(${x}, ${e})`);
    depth = Math.max(depth, stack.length);
    if (e === 0) {
      frames.push(snap(`pow(${x}, 0) is the base case: anything to the power 0 is 1. No further call is needed.`, 'match'));
      stack.pop();
      returned.push([`pow(${x}, 0)`, 1]);
      return 1;
    }
    const half = Math.floor(e / 2);
    frames.push(snap(`pow(${x}, ${e}) needs pow(${x}, ${half}) first, so it waits on the stack while that call runs.`, 'active'));
    const h = pow(half);
    const result = e % 2 === 0 ? h * h : h * h * x;
    frames.push(
      snap(
        `Back in pow(${x}, ${e}): the inner call returned ${h}. ${e} is ${e % 2 === 0 ? 'even' : 'odd'}, so the answer is ${h} × ${h}${e % 2 === 0 ? '' : ` × ${x}`} = ${result}.`,
        'info',
      ),
    );
    stack.pop();
    returned.push([`pow(${x}, ${e})`, result]);
    return result;
  };
  const result = pow(n);
  frames.push(snap(`The stack is empty again and the answer is ${result}. Only ${depth} calls were ever waiting at once, because the exponent halves each time.`, 'match'));
  return { frames, result, depth };
}

/** Reverse a linked list by recursion: reverse the rest, then attach the current node to the end. */
export function reverseListRecursive(values: number[]): { frames: Frame[]; reversed: number[] } {
  const frames: Frame[] = [];
  const stack: string[] = [];
  let reversed: number[] = [];
  const snap = (note: string, waiting: number, active?: number): Frame => ({
    note,
    parts: [
      { kind: 'stack', label: 'call stack', items: [...stack], tones: stack.length ? { [stack.length - 1]: 'active' } : {} },
      {
        kind: 'list',
        label: 'not reversed yet',
        items: values.slice(0, waiting),
        tones: active !== undefined && active < waiting ? { [active]: 'active' } : {},
      },
      { kind: 'list', label: 'reversed so far', items: [...reversed], tones: reversed.length ? { [reversed.length - 1]: 'match' } : {} },
    ],
  });
  const rev = (i: number) => {
    stack.push(`reverse(from ${values[i]})`);
    if (i === values.length - 1) {
      reversed = [values[i]];
      frames.push(snap(`Base case: the list starting at ${values[i]} has one node, and a single node is already reversed. Return it as the new head.`, i));
      stack.pop();
      return;
    }
    frames.push(snap(`reverse(from ${values[i]}) trusts the recursive call to reverse everything after ${values[i]}, and waits.`, i + 1, i));
    rev(i + 1);
    reversed = [...reversed, values[i]];
    frames.push(snap(`The rest came back reversed. ${values[i + 1]} is now its last node, so point ${values[i + 1]}.next at ${values[i]} and set ${values[i]}.next to null.`, i));
    stack.pop();
  };
  if (values.length > 0) rev(0);
  frames.push(snap(`Done. The new head is ${reversed[0]}, and each node points the other way.`, 0));
  return { frames, reversed };
}

/** The rows of the 0 → 01, 1 → 10 grammar (K-th Symbol in Grammar), for a still picture. */
export function grammarRows(n: number): number[][] {
  const rows: number[][] = [[0]];
  while (rows.length < n) rows.push(rows[rows.length - 1].flatMap((b) => (b === 0 ? [0, 1] : [1, 0])));
  return rows;
}

/** K-th symbol by recursion on the parent position: the shape the chapter teaches. */
export function kthSymbol(n: number, k: number): number {
  if (n === 1) return 0;
  const parent = kthSymbol(n - 1, Math.ceil(k / 2));
  return k % 2 === 1 ? parent : 1 - parent;
}
