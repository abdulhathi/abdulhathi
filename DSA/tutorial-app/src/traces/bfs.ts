// Walkthrough frames for chapter 38 (Breadth-first search), produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

const DIRS: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const key = (r: number, c: number) => `${r},${c}`;

/**
 * Shortest path on a grid (# = wall), one frame per BFS level. Each cell shows its distance
 * from the start once discovered; at the end the path is traced back through parents.
 */
export function gridBfs(grid: string[], start: [number, number], target: [number, number]) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist: (number | null)[][] = grid.map((r) => [...r].map(() => null));
  const parent = new Map<string, string>();
  const frames: Frame[] = [];
  let frontier: [number, number][] = [start];
  dist[start[0]][start[1]] = 0;

  const picture = (highlight: Set<string>, tone: Tone, path?: Set<string>) => {
    const cells: Cell[][] = grid.map((row, r) => [...row].map((ch, c) => (ch === '#' ? '#' : (dist[r][c] ?? ''))));
    const tones: Partial<Record<string, Tone>> = {};
    grid.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        const k = key(r, c);
        if (ch === '#') tones[k] = 'dim';
        else if (path?.has(k)) tones[k] = 'match';
        else if (highlight.has(k)) tones[k] = tone;
        else if (dist[r][c] !== null) tones[k] = 'done';
      }),
    );
    if (!path) tones[key(...target)] = tones[key(...target)] ?? 'info';
    return [
      { kind: 'grid' as const, label: `grid: S = (${start}), T = (${target}), # = wall`, cells, tones },
      { kind: 'queue' as const, label: 'queue (the next level)', items: frontier.map(([r, c]) => `${r},${c}`) },
    ];
  };

  frames.push({ note: `Start at (${start}) with distance 0. The queue holds one level of the search at a time.`, parts: picture(new Set([key(...start)]), 'active') });
  let level = 0;
  let found = false;
  while (frontier.length && !found) {
    const next: [number, number][] = [];
    for (const [r, c] of frontier) {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] === '#' || dist[nr][nc] !== null) continue;
        dist[nr][nc] = level + 1;
        parent.set(key(nr, nc), key(r, c));
        next.push([nr, nc]);
        if (nr === target[0] && nc === target[1]) found = true;
      }
    }
    level++;
    frontier = next;
    if (!next.length) break;
    frames.push({
      note: found
        ? `Level ${level}: the target is among the new cells. BFS reaches cells in order of distance, so ${level} steps is the shortest possible.`
        : `Level ${level}: every unvisited open neighbour of level ${level - 1} gets distance ${level} and joins the queue. Nothing at distance ${level} can be reached any faster.`,
      parts: picture(new Set(next.map(([r, c]) => key(r, c))), 'warn'),
    });
  }
  const path = new Set<string>();
  if (found) {
    let k: string | undefined = key(...target);
    while (k) {
      path.add(k);
      k = parent.get(k);
    }
    frames.push({ note: `Follow the parent links back from the target to recover one shortest path of ${level} steps.`, parts: picture(new Set(), 'active', path) });
  } else {
    frames.push({ note: 'The queue is empty and the target was never reached: there is no path.', parts: picture(new Set(), 'active') });
  }
  return { frames, distance: found ? level : -1 };
}

/** Rotting oranges: multi-source BFS where every rotten orange starts in the queue at minute 0. */
export function rottingOranges(grid: number[][]) {
  const g = grid.map((r) => [...r]);
  const rows = g.length;
  const cols = g[0].length;
  const frames: Frame[] = [];
  let frontier: [number, number][] = [];
  let fresh = 0;
  g.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === 2) frontier.push([r, c]);
      if (v === 1) fresh++;
    }),
  );
  const picture = (newly: Set<string>, minute: number) => {
    const cells: Cell[][] = g.map((row) => row.map((v) => (v === 0 ? '' : v === 1 ? 'F' : 'R')));
    const tones: Partial<Record<string, Tone>> = {};
    g.forEach((row, r) =>
      row.forEach((v, c) => {
        const k = key(r, c);
        tones[k] = v === 0 ? 'dim' : v === 1 ? 'match' : newly.has(k) ? 'warn' : 'bad';
      }),
    );
    return [
      { kind: 'grid' as const, label: 'F = fresh, R = rotten', cells, tones },
      { kind: 'vars' as const, items: [['minute', minute], ['fresh left', fresh]] as [string, Cell][] },
    ];
  };
  frames.push({
    note: `All ${frontier.length} rotten oranges go into the queue together: they all spread at the same time. ${fresh} fresh oranges remain.`,
    parts: picture(new Set(frontier.map(([r, c]) => key(r, c))), 0),
  });
  let minute = 0;
  while (frontier.length && fresh > 0) {
    const next: [number, number][] = [];
    for (const [r, c] of frontier) {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || g[nr][nc] !== 1) continue;
        g[nr][nc] = 2;
        fresh--;
        next.push([nr, nc]);
      }
    }
    if (!next.length) break;
    minute++;
    frontier = next;
    frames.push({
      note: `Minute ${minute}: every fresh orange next to one that rotted last minute turns rotten (amber). ${fresh} fresh left.`,
      parts: picture(new Set(next.map(([r, c]) => key(r, c))), minute),
    });
  }
  const answer = fresh === 0 ? minute : -1;
  frames.push({
    note: fresh === 0 ? `No fresh oranges remain after ${minute} minutes: the number of BFS levels is the answer.` : `The spread has stopped, but ${fresh} fresh oranges can never be reached: the answer is −1.`,
    parts: picture(new Set(), minute),
  });
  return { frames, minutes: answer };
}

/**
 * 0-1 BFS: entering an empty cell costs 0 and entering an obstacle costs 1. A deque replaces
 * the priority queue of Dijkstra: cost-0 moves go to the front, cost-1 moves to the back.
 */
export function zeroOneBfs(grid: number[][]) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist: number[][] = grid.map((r) => r.map(() => Infinity));
  const done: boolean[][] = grid.map((r) => r.map(() => false));
  const deque: [number, number][] = [[0, 0]];
  dist[0][0] = 0;
  const frames: Frame[] = [];
  const picture = (current?: [number, number], changed: string[] = []) => {
    const cells: Cell[][] = grid.map((row, r) => row.map((v, c) => (dist[r][c] === Infinity ? (v ? '▲' : '') : `${dist[r][c]}${v ? '▲' : ''}`)));
    const tones: Partial<Record<string, Tone>> = {};
    grid.forEach((row, r) =>
      row.forEach((_, c) => {
        const k = key(r, c);
        if (done[r][c]) tones[k] = 'done';
        if (changed.includes(k)) tones[k] = 'warn';
      }),
    );
    if (current) tones[key(...current)] = 'active';
    return [
      { kind: 'grid' as const, label: '▲ = obstacle (costs 1 to enter); numbers = best cost so far', cells, tones },
      { kind: 'queue' as const, label: 'deque', items: deque.map(([r, c]) => `${r},${c}`) },
    ];
  };
  frames.push({ note: 'Start at the top-left corner with cost 0. The deque always holds cells in order of cost, with costs differing by at most 1.', parts: picture() });
  while (deque.length) {
    const [r, c] = deque.shift()!;
    if (done[r][c]) continue;
    done[r][c] = true;
    const front: string[] = [];
    const back: string[] = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || done[nr][nc]) continue;
      const w = grid[nr][nc];
      if (dist[r][c] + w < dist[nr][nc]) {
        dist[nr][nc] = dist[r][c] + w;
        if (w === 0) {
          deque.unshift([nr, nc]);
          front.push(`(${nr}, ${nc})`);
        } else {
          deque.push([nr, nc]);
          back.push(`(${nr}, ${nc})`);
        }
      }
    }
    const parts: string[] = [];
    if (front.length) parts.push(`free moves to ${front.join(', ')} go to the front`);
    if (back.length) parts.push(`moves into obstacles ${back.join(', ')} cost 1 and go to the back`);
    frames.push({
      note: `Take (${r}, ${c}) from the front: its cost ${dist[r][c]} is final.${parts.length ? ` From it, ${parts.join('; ')}.` : ' It improves no neighbour.'}`,
      parts: picture([r, c], [...front, ...back].map((s) => s.replace(/[() ]/g, ''))),
    });
    if (r === rows - 1 && c === cols - 1) break;
  }
  const answer = dist[rows - 1][cols - 1];
  frames.push({ note: `The bottom-right corner is settled with cost ${answer}: that is the fewest obstacles to remove.`, parts: picture() });
  return { frames, cost: answer };
}
