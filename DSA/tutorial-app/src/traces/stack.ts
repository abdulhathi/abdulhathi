// Walkthrough frames for chapter 16 (Stacks), produced by running each algorithm for real.
import type { Cell, Frame, Tone, Viz } from '../viz/types';

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Check that every bracket is closed by its partner, in the right order. */
export function validBrackets(s: string): { frames: Frame[]; valid: boolean } {
  const chars = [...s];
  const stack: string[] = [];
  const frames: Frame[] = [];
  const view = (i: number, tone: Tone, stackTone?: Tone): Viz[] => [
    { kind: 'array', label: 's', items: chars, pointers: i < chars.length ? [{ name: 'i', at: i }] : [], tones: i < chars.length ? { [i]: tone } : {} },
    { kind: 'stack', label: 'open brackets', items: [...stack], tones: stackTone && stack.length ? { [stack.length - 1]: stackTone } : {} },
  ];
  frames.push({ note: 'Scan left to right. Opening brackets wait on the stack until their partner arrives.', parts: view(0, 'active') });
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!(c in PAIRS)) {
      stack.push(c);
      frames.push({ note: `"${c}" opens a group. Push it: it must be closed before anything opened earlier.`, parts: view(i, 'active', 'active') });
      continue;
    }
    const top = stack[stack.length - 1];
    if (top !== PAIRS[c]) {
      frames.push({
        note: top === undefined
          ? `"${c}" closes a group, but nothing is open. The string is invalid.`
          : `"${c}" must close a "${PAIRS[c]}", but the most recent open bracket is "${top}". The string is invalid.`,
        parts: view(i, 'bad', 'bad'),
      });
      return { frames, valid: false };
    }
    frames.push({ note: `"${c}" matches the "${top}" on top. Pop it: that group is closed.`, parts: view(i, 'match', 'match') });
    stack.pop();
  }
  const valid = stack.length === 0;
  frames.push({
    note: valid ? 'The scan is over and the stack is empty: every bracket was closed in order. Valid.' : `The scan is over but ${stack.length} bracket(s) are still open. Invalid.`,
    parts: view(chars.length, 'done', valid ? undefined : 'bad'),
  });
  return { frames, valid };
}

/** Evaluate a postfix (reverse Polish) expression with a stack of numbers. */
export function evalPostfix(tokens: string[]): { frames: Frame[]; value: number } {
  const stack: number[] = [];
  const frames: Frame[] = [];
  const view = (i: number, tone: Tone, stackTone?: Tone): Viz[] => [
    { kind: 'array', label: 'tokens', items: tokens, pointers: i < tokens.length ? [{ name: 'i', at: i }] : [], tones: i < tokens.length ? { [i]: tone } : {} },
    { kind: 'stack', label: 'values', items: [...stack], tones: stackTone && stack.length ? { [stack.length - 1]: stackTone } : {} },
  ];
  frames.push({ note: 'Numbers wait on the stack. An operator always uses the two most recent values.', parts: view(0, 'active') });
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!['+', '-', '*', '/'].includes(t)) {
      stack.push(Number(t));
      frames.push({ note: `${t} is a number: push it.`, parts: view(i, 'active', 'active') });
      continue;
    }
    const b = stack.pop()!;
    const a = stack.pop()!;
    const r = t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : Math.trunc(a / b);
    stack.push(r);
    const sym = t === '*' ? '×' : t === '/' ? '÷' : t === '-' ? '−' : '+';
    frames.push({ note: `"${t}": pop ${b} (right operand) and ${a} (left operand), push ${a} ${sym} ${b} = ${r}.`, parts: view(i, 'info', 'match') });
  }
  frames.push({ note: `All tokens are used. The single value left, ${stack[0]}, is the answer.`, parts: view(tokens.length, 'done', 'match') });
  return { frames, value: stack[0] };
}

/** Expand k[text] encodings, nested to any depth, with a stack of saved contexts. */
export function decode(s: string): { frames: Frame[]; result: string } {
  const chars = [...s];
  const stack: [string, number][] = [];
  let current = '';
  let k = 0;
  const frames: Frame[] = [];
  const show = (v: string) => (v === '' ? '""' : `"${v}"`);
  const view = (i: number, tone: Tone, stackTone?: Tone): Viz[] => [
    { kind: 'array', label: 's', items: chars, pointers: i < chars.length ? [{ name: 'i', at: i }] : [], tones: i < chars.length ? { [i]: tone } : {} },
    {
      kind: 'stack',
      label: 'saved (prefix, count)',
      items: stack.map(([p, n]): Cell => `${show(p)} ×${n}`),
      tones: stackTone && stack.length ? { [stack.length - 1]: stackTone } : {},
    },
    { kind: 'vars', items: [['current', show(current)], ['k', k]] },
  ];
  frames.push({ note: 'current holds the text being built at this nesting level; k holds a repeat count being read.', parts: view(0, 'active') });
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c >= '0' && c <= '9') {
      k = k * 10 + Number(c);
      frames.push({ note: `A digit: the repeat count is now ${k}.`, parts: view(i, 'active') });
    } else if (c === '[') {
      stack.push([current, k]);
      const note = `"[" starts a new level. Save the text so far (${show(current)}) and the count ${k}, then build the inside from empty.`;
      current = '';
      k = 0;
      frames.push({ note, parts: view(i, 'info', 'active') });
    } else if (c === ']') {
      const [prefix, n] = stack.pop()!;
      const inner = current;
      current = prefix + inner.repeat(n);
      frames.push({ note: `"]" closes the level: saved prefix ${show(prefix)} + ${show(inner)} repeated ${n} times = ${show(current)}.`, parts: view(i, 'match') });
    } else {
      current += c;
      frames.push({ note: `A letter: append it to current.`, parts: view(i, 'active') });
    }
  }
  frames.push({ note: `Done. The decoded string is ${show(current)}.`, parts: view(chars.length, 'done') });
  return { frames, result: current };
}
