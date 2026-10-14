// Walkthrough frames for chapter 39 (Backtracking), produced by running each algorithm for real.
import type { Cell, Frame, GraphViz, Tone } from '../viz/types';

/**
 * All subsets with choose, explore, un-choose. Every node of the recursion tree is one subset:
 * from a node, you may add any number that comes after the last one chosen.
 */
export function subsets(nums: number[]) {
  // Lay out the recursion tree first so every frame can draw it.
  type TNode = { id: string; subset: number[]; children: TNode[] };
  const build = (subset: number[], start: number): TNode => ({
    id: subset.length ? subset.join('-') : 'root',
    subset,
    children: nums.slice(start).map((x, k) => build([...subset, x], start + k + 1)),
  });
  const root = build([], 0);
  const nodes: GraphViz['nodes'] = [];
  const edges: GraphViz['edges'] = [];
  let leaf = 0;
  const place = (n: TNode, depth: number): number => {
    let x: number;
    if (!n.children.length) x = leaf++ * 52;
    else {
      const xs = n.children.map((c) => place(c, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
      for (const c of n.children) edges.push({ from: n.id, to: c.id });
    }
    nodes.push({ id: n.id, x, y: depth * 64, label: n.subset.length ? String(n.subset[n.subset.length - 1]) : '{ }' });
    return x;
  };
  place(root, 0);

  const results: number[][] = [];
  const frames: Frame[] = [];
  const path: number[] = [];
  const recorded = new Set<string>();
  const draw = (current: string): GraphViz => ({
    kind: 'graph',
    label: 'recursion tree (each node is one subset)',
    directed: true,
    nodes,
    // An edge is on the current path when the current node is its child or lies below it.
    edges: edges.map((e) => ({ ...e, tone: current === e.to || current.startsWith(`${e.to}-`) ? ('active' as Tone) : undefined })),
    tones: Object.fromEntries(nodes.map((n) => [n.id, n.id === current ? 'active' : recorded.has(n.id) ? 'done' : undefined])) as Partial<Record<string, Tone>>,
  });
  const snapshot = (note: string) => {
    const id = path.length ? path.join('-') : 'root';
    frames.push({
      note,
      parts: [
        draw(id),
        { kind: 'array', label: 'path (the current choice)', items: [...path] as Cell[], indices: false },
        { kind: 'set', label: 'subsets recorded', items: results.map((r) => `[${r.join(',')}]`), tones: { [results.length - 1]: 'match' } },
      ],
    });
  };

  const explore = (start: number) => {
    results.push([...path]);
    recorded.add(path.length ? path.join('-') : 'root');
    snapshot(
      path.length === 0
        ? 'Start with an empty path. Every node of this search is a valid subset, so record a copy of the path straight away: the empty subset.'
        : `Choose ${path[path.length - 1]} and record [${path.join(', ')}]. Next, try adding each number that comes after it.`,
    );
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]); // choose
      explore(i + 1); // explore
      const undone = path.pop()!; // un-choose
      snapshot(
        `Un-choose ${undone}: the path is back to [${path.join(', ')}]${i + 1 < nums.length ? `, ready to try ${nums[i + 1]} instead` : ', and there is nothing left to try at this level'}.`,
      );
    }
  };
  explore(0);
  frames.push({
    note: `Done: ${results.length} subsets, one per node of the tree, which is 2ⁿ for n = ${nums.length}. The path was always shrunk back (un-choose) before trying the next number.`,
    parts: [draw(''), { kind: 'array', label: 'path', items: [], indices: false }, { kind: 'set', label: 'subsets recorded', items: results.map((r) => `[${r.join(',')}]`) }],
  });
  return { frames, results };
}

/** N-Queens: place one queen per row; columns and both diagonals must stay free. */
export function nQueens(n: number) {
  const cols = new Set<number>();
  const diag = new Set<number>(); // r - c
  const anti = new Set<number>(); // r + c
  const queens: number[] = []; // queens[r] = column
  const frames: Frame[] = [];
  let solutions = 0;
  let firstSolution: number[] | null = null;

  const board = (row: number | null, last?: [number, number], deadEnd = false) => {
    const cells: Cell[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ''));
    const tones: Partial<Record<string, Tone>> = {};
    queens.forEach((c, r) => {
      cells[r][c] = 'Q';
      tones[`${r},${c}`] = 'match';
    });
    if (last) tones[`${last[0]},${last[1]}`] = 'active';
    if (row !== null && row < n) {
      for (let c = 0; c < n; c++) {
        const attacked = cols.has(c) || diag.has(row - c) || anti.has(row + c);
        if (attacked) {
          cells[row][c] = '×';
          tones[`${row},${c}`] = deadEnd ? 'bad' : 'dim';
        } else if (!tones[`${row},${c}`]) tones[`${row},${c}`] = 'info';
      }
    }
    return [{ kind: 'grid' as const, label: `${n} × ${n} board (× = attacked, blue = free in the next row)`, cells, tones, rowHeaders: Array.from({ length: n }, (_, r) => `row ${r}`) }];
  };

  const solve = (r: number) => {
    if (r === n) {
      solutions++;
      if (!firstSolution) {
        firstSolution = [...queens];
        frames.push({ note: `All ${n} rows have a queen and none attack each other: a solution. (The search would now continue to find the others.)`, parts: board(null) });
      }
      return;
    }
    let placedAny = false;
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || diag.has(r - c) || anti.has(r + c)) continue;
      placedAny = true;
      cols.add(c);
      diag.add(r - c);
      anti.add(r + c);
      queens.push(c);
      if (!firstSolution) {
        frames.push({
          note: `Row ${r}: column ${c} is not attacked by any queen above. Place a queen there and mark its column and both diagonals.`,
          parts: board(r + 1, [r, c]),
        });
      }
      solve(r + 1);
      queens.pop();
      cols.delete(c);
      diag.delete(r - c);
      anti.delete(r + c);
      if (!firstSolution) {
        frames.push({ note: `Back in row ${r}: un-choose the queen at column ${c} and try the next column.`, parts: board(r) });
      }
    }
    if (!placedAny && !firstSolution) {
      frames.push({ note: `Row ${r}: every column is attacked. Dead end: no need to look at the rows below. Go back up.`, parts: board(r, undefined, true) });
    }
  };
  frames.push({ note: `Place one queen per row, top to bottom. A queen attacks its column and both diagonals, so keep three sets: used columns, used (row − column) and used (row + column).`, parts: board(0) });
  solve(0);
  return { frames, solutions, firstSolution: firstSolution as number[] | null };
}
