// Walkthrough frames for the simulation chapter, produced by running each process for real.
import type { Cell, Frame, GridViz, Tone } from '../viz/types';

const DIRS = [
  { name: 'north', dx: 0, dy: 1, arrow: '↑' },
  { name: 'east', dx: 1, dy: 0, arrow: '→' },
  { name: 'south', dx: 0, dy: -1, arrow: '↓' },
  { name: 'west', dx: -1, dy: 0, arrow: '←' },
];

/** Robot Bounded In Circle: run the instructions once step by step, then pass by pass, and apply the rule. */
export function robotPasses(instructions: string): { frames: Frame[]; bounded: boolean; ends: [number, number, string][] } {
  // Collect every position over four passes first, so the drawing has a fixed size.
  const path: { x: number; y: number; d: number }[] = [{ x: 0, y: 0, d: 0 }];
  let x = 0;
  let y = 0;
  let d = 0;
  const ends: [number, number, string][] = [];
  for (let pass = 0; pass < 4; pass++) {
    for (const ch of instructions) {
      if (ch === 'G') {
        x += DIRS[d].dx;
        y += DIRS[d].dy;
      } else if (ch === 'L') d = (d + 3) % 4;
      else d = (d + 1) % 4;
      path.push({ x, y, d });
    }
    ends.push([x, y, DIRS[d].name]);
  }
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const draw = (upto: number, label: string): GridViz => {
    const cells: Cell[][] = [];
    const tones: Partial<Record<string, Tone>> = {};
    for (let yy = maxY; yy >= minY; yy--) cells.push(Array.from({ length: maxX - minX + 1 }, () => null));
    for (let i = 0; i <= upto; i++) {
      const p = path[i];
      const r = maxY - p.y;
      const c = p.x - minX;
      cells[r][c] = '·';
      tones[`${r},${c}`] = 'done';
    }
    const o = { r: maxY - 0, c: 0 - minX };
    cells[o.r][o.c] = cells[o.r][o.c] ?? '·';
    tones[`${o.r},${o.c}`] = 'info';
    const cur = path[upto];
    cells[maxY - cur.y][cur.x - minX] = DIRS[cur.d].arrow;
    tones[`${maxY - cur.y},${cur.x - minX}`] = 'active';
    return {
      kind: 'grid',
      label,
      cells,
      tones,
      rowHeaders: Array.from({ length: maxY - minY + 1 }, (_, i) => `y=${maxY - i}`),
      colHeaders: Array.from({ length: maxX - minX + 1 }, (_, i) => `x=${minX + i}`),
    };
  };
  const frames: Frame[] = [];
  const instr = (i: number) => ({ kind: 'array' as const, label: 'instructions', items: [...instructions], pointers: i >= 0 ? [{ name: 'next', at: i }] : [], indices: false });
  frames.push({ note: 'The state is just a position and a facing direction. Start at the origin (blue), facing north.', parts: [draw(0, 'the plane'), instr(0)] });
  for (let i = 0; i < instructions.length; i++) {
    const p = path[i + 1];
    const ch = instructions[i];
    frames.push({
      note: ch === 'G' ? `"G": one step ${DIRS[p.d].name}, to (${p.x}, ${p.y}).` : `"${ch}": turn ${ch === 'L' ? 'left' : 'right'}; now facing ${DIRS[p.d].name}. The position does not change.`,
      parts: [draw(i + 1, 'the plane'), instr(i + 1 < instructions.length ? i + 1 : -1)],
    });
  }
  const per = instructions.length;
  const [ex, ey, ed] = ends[0];
  const bounded = (ex === 0 && ey === 0) || ed !== 'north';
  frames.push({
    note: `After one pass: (${ex}, ${ey}) facing ${ed}. ${
      ex === 0 && ey === 0 ? 'Back at the origin, so the robot repeats the same loop forever: bounded.' : ed !== 'north' ? 'Not facing north, so the next pass starts turned, and its moves are the first pass rotated. Watch the next three passes.' : 'Facing north again but away from the origin: every pass moves it the same distance further. Unbounded.'
    }`,
    parts: [draw(per, 'the plane'), { kind: 'vars', items: [['x', ex], ['y', ey], ['facing', ed]], tones: { 2: 'warn' } }],
  });
  if (!(ex === 0 && ey === 0) && ed !== 'north') {
    for (let pass = 1; pass < 4; pass++) {
      const [px, py, pd] = ends[pass];
      const home = px === 0 && py === 0 && pd === 'north';
      frames.push({
        note: home
          ? `After pass ${pass + 1}: back at the origin facing north. The rotated copies cancelled out, so the path is a closed loop: bounded.`
          : `After pass ${pass + 1}: (${px}, ${py}) facing ${pd}.`,
        parts: [draw(per * (pass + 1), 'the plane'), { kind: 'vars', items: [['x', px], ['y', py], ['facing', pd]], tones: home ? { 0: 'match', 1: 'match', 2: 'match' } : {} }],
      });
    }
  }
  return { frames, bounded, ends };
}

/** Add two non-negative integers given as strings, digit by digit from the right, with a carry. */
export function addStrings(a: string, b: string): { frames: Frame[]; sum: string } {
  const out: string[] = [];
  const width = Math.max(a.length, b.length) + 1;
  const pad = (s: string) => [...s.padStart(width, ' ')].map((ch) => (ch === ' ' ? null : ch));
  const frames: Frame[] = [];
  let i = a.length - 1;
  let j = b.length - 1;
  let carry = 0;
  const view = (col: number, note: string, tone: Tone = 'active'): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'a', items: pad(a), tones: col >= 0 ? { [col]: tone } : {}, indices: false },
      { kind: 'array', label: 'b', items: pad(b), tones: col >= 0 ? { [col]: tone } : {}, indices: false },
      { kind: 'array', label: 'sum (built right to left)', items: [...[...out].reverse().join('').padStart(width, ' ')].map((ch) => (ch === ' ' ? null : ch)), tones: col >= 0 ? { [col]: 'match' } : {}, indices: false },
      { kind: 'vars', items: [['carry', carry]] },
    ],
  });
  frames.push(view(-1, 'Line the numbers up on the right, exactly as on paper. Work from the last digit, carrying into the next column.'));
  let col = width - 1;
  while (i >= 0 || j >= 0 || carry > 0) {
    const da = i >= 0 ? a.charCodeAt(i) - 48 : 0;
    const db = j >= 0 ? b.charCodeAt(j) - 48 : 0;
    const total = da + db + carry;
    out.push(String(total % 10));
    const before = carry;
    carry = Math.floor(total / 10);
    frames.push(view(col, `${da} + ${db} + carry ${before} = ${total}: write ${total % 10}${carry ? ' and carry 1' : ''}.`));
    i--;
    j--;
    col--;
  }
  const sum = [...out].reverse().join('');
  frames.push(view(-1, `No digits and no carry left. The sum is ${sum}. Each digit was touched once: O(max(m, n)).`));
  return { frames, sum };
}

/** Find the Winner of the Circular Game with a queue: rotate k − 1 friends to the back, remove the k-th. */
export function circularGame(n: number, k: number): { frames: Frame[]; winner: number } {
  const queue = Array.from({ length: n }, (_, i) => i + 1);
  const out: number[] = [];
  const frames: Frame[] = [];
  const view = (note: string, tones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'queue', label: 'circle (front = whose turn it is)', items: [...queue], tones },
      { kind: 'array', label: 'left the game', items: [...out], indices: false },
    ],
  });
  frames.push(view(`Model the circle as a queue: the front is where counting starts. Counting ${k} friends means passing ${k - 1} of them to the back.`));
  while (queue.length > 1) {
    for (let s = 0; s < k - 1; s++) queue.push(queue.shift()!);
    frames.push(view(`Rotate ${k - 1} friend${k - 1 === 1 ? '' : 's'} from the front to the back. Friend ${queue[0]} is now at the front: number ${k} in the count.`, { 0: 'bad' }));
    out.push(queue.shift()!);
    frames.push(view(`Friend ${out[out.length - 1]} leaves. Counting restarts from the new front, friend ${queue[0]}.`, { 0: 'active' }));
  }
  frames.push(view(`One friend is left: friend ${queue[0]} wins. The queue costs O(n · k); the Josephus recurrence does it in O(n).`, { 0: 'match' }));
  return { frames, winner: queue[0] };
}
